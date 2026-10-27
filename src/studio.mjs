import React, {useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore, memo} from '@cove/runtime/react';
import {extensionFetch} from '@cove/runtime/api';
import {useQueryClient} from '@cove/runtime/react-query';
import {RATES,SKIPS,clamp,formatTime,parseTime,draftFor,validateDraft,buildWrite,recordSignature,layoutRows,unannotatedRanges,formatBoundary,duplicateTiming} from './model.mjs';
import {exportTimeline,parseTimeline,planImport,importedSegment,MAX_IMPORT_BYTES} from './exchange.mjs';
const h=React.createElement;
async function api(url,method='GET',body){
 const r=await extensionFetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 if(!r.ok){const msg=await r.text();throw new Error(r.status===403?'Your COVE account does not allow this operation.':msg.slice(0,400)||'Request failed ('+r.status+').');}
 return r.status===204?null:r.json();
}
async function allTags(){
 const tags=[];for(let page=1;page<=100;page++){
  const data=await api('/api/tags?perPage=200&page='+page+'&sort=name&direction=asc');
  const items=Array.isArray(data)?data:data.items??[];tags.push(...items);
  if(Array.isArray(data)||items.length<200||tags.length>=(data.total??Infinity))break;
 }return tags;
}
function button(label,onClick,options={}){return h('button',{type:'button',onClick,...options},label);}
const NativePlayer=memo(function StudioPlayer({video,onContext}){
 const media=useRef(null);
 const file=video.files?.find(f=>f.id===video.primaryFileId)??video.files?.[0];
 const [failure,setFailure]=useState('');
 const sync=useCallback(()=>{
  const v=media.current;if(!v)return;
  onContext({hostId:video.id,currentTime:v.currentTime||0,duration:v.duration||file?.duration||0,playing:!v.paused,playbackRate:v.playbackRate,
   play:()=>v.play(),pause:()=>v.pause(),seek:sec=>{v.currentTime=clamp(sec,0,Number.isFinite(v.duration)?v.duration:file?.duration||0);},setPlaybackRate:rate=>{v.playbackRate=rate;}});
 },[video.id,file?.duration,onContext]);
 useEffect(()=>{sync();return()=>onContext(null);},[sync]);
 return file?h(React.Fragment,null,h('video',{ref:media,src:'/api/stream/video/'+video.id+'?fileId='+file.id,controls:true,playsInline:true,preload:'metadata','aria-label':'Annotation video',onTimeUpdate:sync,onPlay:sync,onPause:sync,onRateChange:sync,onSeeked:sync,onLoadedMetadata:sync,onEnded:sync,onError:()=>setFailure('This browser could not play the original file. Open the scene in COVE’s standard player to check codec support.')}),failure?h('p',{role:'alert',className:'as-error'},failure):null):h('p',null,'This video has no playable file.');
});
export function AnnotateAction(props){
 const {video,onNavigate}=props.context??props;
 return video&&onNavigate?button('Annotate',()=>onNavigate({page:'annotation-studio',id:video.id}),{className:'as-launch',title:'Open Annotation Studio'}):null;
}
export function AnnotationPage({id,onNavigate}){return h(Workspace,{key:id,id:Number(id),onNavigate});}
function Workspace({id,onNavigate}){
 const queryClient=useQueryClient();
 const [video,setVideo]=useState(null),[segments,setSegments]=useState([]),[tags,setTags]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[baseline,setBaseline]=useState(null),[busy,setBusy]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[undo,setUndo]=useState(null);
 const [side,setSide]=useState('');
 const [tagError,setTagError]=useState('');
 const [incoming,setIncoming]=useState(null),[importError,setImportError]=useState(''),[importAcknowledged,setImportAcknowledged]=useState(false),[importProgress,setImportProgress]=useState('');
 const importFile=useRef(null);
 const [zoom,setZoom]=useState(1),[filter,setFilter]=useState(''),[tagSearch,setTagSearch]=useState(''),[loop,setLoop]=useState(false),[jump,setJump]=useState(''),[lastTag,setLastTag]=useState('');
 const track=useRef(null),scroll=useRef(null),drag=useRef(null),latest=useRef(null),ready=useRef(false),pending=useRef(false);
 const [player,setPlayer]=useState(null);
 const onContext=useCallback(value=>setPlayer(value),[]);
 const duration=Number(video?.files?.find(f=>f.id===video.primaryFileId)?.duration??video?.files?.[0]?.duration??0);
 const now=player?.currentTime??0;
 const original=selected==null?null:segments.find(s=>s.id===selected);
 const dirty=Boolean(draft&&(selected==null||!original||JSON.stringify({tagId:draft.tagId,start:draft.start,end:draft.end})!==JSON.stringify(draftFor(original))));
 const valid=draft?validateDraft({...draft,tagId:draft.tagId||((draft.tagText?.trim())?'1':'')},duration):'';
 const rows=useMemo(()=>layoutRows(segments,tags,filter),[segments,tags,filter]);
 const gaps=useMemo(()=>unannotatedRanges(segments,duration),[segments,duration]);
 const importPlan=useMemo(()=>incoming&&video?planImport(incoming.document,video,segments,tags):null,[incoming,video,segments,tags]);
 const visibleTags=useMemo(()=>tags.filter(t=>t.name.toLowerCase().includes(tagSearch.toLowerCase())||String(t.id)===draft?.tagId),[tags,tagSearch,draft?.tagId]);
 const draftKey='cove.annotation-studio.draft.'+id;
 useEffect(()=>{
  let live=true;
  Promise.all([api('/api/videos/'+id),api('/api/videos/'+id+'/segments'),allTags()]).then(([v,s,t])=>{
   if(!live)return;setVideo(v);setSegments(s);setTags(t);
   try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved?.draft){setDraft(saved.draft);setSelected(saved.selected??null);setBaseline(saved.baseline??null);setNotice('Restored your unsaved draft. Save or cancel it when ready.');}}catch{}
   ready.current=true;setLoading(false);
  }).catch(e=>{if(live){setError(e.message);setLoading(false);}});
  return()=>{live=false;};
 },[id]);
 useEffect(()=>{if(!ready.current)return;try{if(dirty)sessionStorage.setItem(draftKey,JSON.stringify({draft,selected,baseline}));else sessionStorage.removeItem(draftKey);}catch{}},[draft,selected,baseline,dirty]);
 useEffect(()=>{if(!dirty)return;const guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 useEffect(()=>{if(loop&&player?.playing&&draft&&!valid&&now>=parseTime(draft.end))player.seek(parseTime(draft.start));},[now,loop,player?.playing,draft,valid]);
 const invalidate=()=>{void queryClient.invalidateQueries();};
 function clearDraft(){setDraft(null);setSelected(null);setBaseline(null);setConfirmDelete(false);setLoop(false);setTagSearch('');}
 function canReplace(){return !busy&&(!dirty||window.confirm('Discard the unsaved changes to this interval?'));}
 function choose(s){if(!canReplace())return;setSide('editor');setSelected(s.id);setDraft(draftFor(s));setBaseline(recordSignature(s));setTagSearch('');setConfirmDelete(false);setLoop(false);setError('');player?.seek(s.startSec);}
 function chooseGap(gap){if(!canReplace())return;setSelected(null);setBaseline(null);setDraft({tagId:'',start:String(gap.start),end:String(gap.end)});setTagSearch('');setTagError('');setConfirmDelete(false);setLoop(false);setError('');setSide('editor');player?.seek(gap.start);}
 function newInterval(){if(!canReplace())return;setSide('editor');setSelected(null);setBaseline(null);setDraft({tagId:lastTag,start:String(now),end:''});setTagSearch('');setConfirmDelete(false);setLoop(false);setError('');}
 function duplicateInterval(){
  if(busy||selected==null||!draft)return;
  setDraft(duplicateTiming(draft));setSelected(null);setBaseline(null);setTagSearch('');setTagError('');setConfirmDelete(false);setLoop(false);setError('');setSide('editor');setNotice('Timing copied to a new interval. Choose a tag and Save; the original interval stays unchanged.');
 }
 function mark(which){if(busy)return;if(!draft)setSide('editor');setError('');setConfirmDelete(false);setDraft(d=>({...d??{tagId:lastTag,start:String(now),end:''},[which]:String(now)}));}
 function nudge(which,seconds){if(!draft||busy)return;const t=parseTime(draft[which]);setDraft({...draft,[which]:String(Math.round(clamp((Number.isFinite(t)?t:now)+seconds,0,duration)*1e6)/1e6)});}
 function skip(seconds){player?.seek(clamp(now+seconds,0,duration));}
 async function save(){
  if(!draft||pending.current)return;
  if(!draft.tagId&&!draft.tagText?.trim()){setError('Choose or type a tag.');return;}
  const message=validateDraft({...draft,tagId:draft.tagId||'1'},duration);if(message){setError(message);return;}
  pending.current=true;setBusy(true);setError('');
  try{
   if(selected!=null){const fresh=await api('/api/videos/'+id+'/segments/'+selected);if(recordSignature(fresh)!==baseline)throw new Error('This interval changed in another editor. Your draft is preserved. Cancel and select it again after reloading to use the newer version.');}
   let writeDraft=draft;if(!writeDraft.tagId){const tag=await resolveTag(writeDraft.tagText);writeDraft={...writeDraft,tagId:String(tag.id)};}
   const record=await api('/api/videos/'+id+'/segments'+(selected==null?'':'/'+selected),selected==null?'POST':'PUT',buildWrite(writeDraft,original));
   setSegments(s=>selected==null?[...s,record]:s.map(x=>x.id===selected?record:x));setLastTag(String(record.tagId));setSelected(record.id);setDraft(draftFor(record));setBaseline(recordSignature(record));setConfirmDelete(false);setNotice('Interval saved.');invalidate();
  }catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 async function remove(){
  if(selected==null||pending.current)return;pending.current=true;setBusy(true);setError('');
  try{
   const fresh=await api('/api/videos/'+id+'/segments/'+selected);if(recordSignature(fresh)!==baseline)throw new Error('This interval changed elsewhere. Reload before deleting it.');
   await api('/api/videos/'+id+'/segments/'+selected,'DELETE');setUndo(fresh);setSegments(s=>s.filter(x=>x.id!==selected));clearDraft();setNotice('Interval deleted. You can undo this deletion.');invalidate();
  }catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 async function restore(){if(!undo||pending.current)return;pending.current=true;setBusy(true);setError('');try{const s=await api('/api/videos/'+id+'/segments','POST',buildWrite(draftFor(undo),undo));setSegments(list=>[...list,s]);setUndo(null);setNotice('Deleted interval restored.');invalidate();}catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}}
 async function resolveTag(name){
  const normalized=name.trim();if(!normalized)throw new Error('Choose or type a tag.');
  const existing=tags.find(t=>t.name.toLowerCase()===normalized.toLowerCase());
  if(existing)return existing;
  const tag=await api('/api/tags','POST',{name:normalized});
  setTags(ts=>[...ts.filter(t=>t.id!==tag.id),tag].sort((a,b)=>a.name.localeCompare(b.name)));invalidate();return tag;
 }
 function selectTag(tag){setDraft(d=>{const {tagText,...rest}=d??{start:String(now),end:''};return {...rest,tagId:String(tag.id)};});setLastTag(String(tag.id));setTagError('');}
 async function commitTag(name){
  if(pending.current)return false;pending.current=true;setBusy(true);setTagError('');
  try{const tag=await resolveTag(name);selectTag(tag);return true;}catch(e){setTagError(e.message);return false;}finally{pending.current=false;setBusy(false);}
 }
 function typeTag(text){
  const exact=tags.find(t=>t.name.toLowerCase()===text.trim().toLowerCase());
  setDraft(d=>({...d??{start:String(now),end:''},tagId:exact?String(exact.id):'',tagText:text}));setTagError('');
 }
 function centerPlayhead(){const box=scroll.current;if(box)box.scrollLeft=Math.max(0,(box.scrollWidth-148)*now/Math.max(1,duration)-box.clientWidth/2+148);}
 function seekEvent(e){const rect=e.currentTarget.getBoundingClientRect();player?.seek(clamp((e.clientX-rect.left)/rect.width*duration,0,duration));}
 function beginDrag(e,which){if(busy||!draft)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={which,rect:e.currentTarget.parentElement.parentElement.getBoundingClientRect()};}
 function moveDrag(e){const d=drag.current;if(!d)return;const t=Math.round(clamp((e.clientX-d.rect.left)/d.rect.width*duration,0,duration)*100)/100;setDraft(old=>({...old,[d.which]:String(t)}));}
 latest.current={player,draft,save,mark,skip,newInterval,clearDraft,canReplace,busy};
 useEffect(()=>{
  const key=e=>{
   if(document.querySelector('dialog.as-import-dialog[open]'))return;
   const a=latest.current;if(!a||e.ctrlKey||e.metaKey){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!a?.busy)a?.save();}return;}
   if(e.altKey||e.target.closest?.('input,select,textarea,[contenteditable=true],[role=dialog]'))return;
   let handled=true;
   if(e.code==='Space'&&e.target.tagName!=='BUTTON'){a.player?.playing?a.player.pause():a.player?.play().catch(err=>setError(err.message));}
   else if(e.key==='ArrowLeft')a.skip(e.shiftKey?-5:-1);
   else if(e.key==='ArrowRight')a.skip(e.shiftKey?5:1);
   else if(['1','2','3','5'].includes(e.key))a.player?.setPlaybackRate?.(Number(e.key));
   else if(e.key.toLowerCase()==='i')a.mark('start');
   else if(e.key.toLowerCase()==='o')a.mark('end');
   else if(e.key.toLowerCase()==='n')a.newInterval();
   else if(e.key==='Escape'){if(a.canReplace())a.clearDraft();}
   else handled=false;
   if(handled){e.preventDefault();e.stopImmediatePropagation();}
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[]);
 async function downloadTimeline(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{
   const [v,s,t]=await Promise.all([api('/api/videos/'+id),api('/api/videos/'+id+'/segments'),allTags()]);
   const doc=await exportTimeline(v,s,t);const blob=new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;link.download=(v.title||'scene').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)+'.annotations.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setNotice('Exported '+doc.segments.length+' saved intervals. Unsaved drafts are not included.');
  }catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 async function openImport(file){
  if(!file||pending.current)return;pending.current=true;setBusy(true);setError('');setImportError('');setImportAcknowledged(false);setImportProgress('');
  try{if(file.size>MAX_IMPORT_BYTES)throw new Error('Choose a JSON file smaller than 5 MB.');
   const document=parseTimeline(await file.text());
   const [v,s,t]=await Promise.all([api('/api/videos/'+id),api('/api/videos/'+id+'/segments'),allTags()]);
   setVideo(v);setSegments(s);setTags(t);setIncoming({name:file.name,document});
  }catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 async function applyImport(){
  if(!incoming||pending.current)return;pending.current=true;setBusy(true);setImportError('');let added=0;
  const runId=crypto.randomUUID();
  try{
   const [v,current,knownTags]=await Promise.all([api('/api/videos/'+id),api('/api/videos/'+id+'/segments'),allTags()]);
   const plan=planImport(incoming.document,v,current,knownTags);
   if(plan.blocked)throw new Error('One or more intervals exceed this video’s duration. Import was not started.');
   if(plan.requiresConfirmation&&!importAcknowledged)throw new Error('Confirm that the video and file use the same timeline before importing.');
   setVideo(v);setSegments(current);setTags(knownTags);
   for(const entry of plan.entries.filter(e=>e.state==='add')){
    setImportProgress('Importing '+(added+1)+' of '+plan.add+'…');
    let tag=knownTags.find(t=>t.name.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase()===entry.tag.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase());
    if(!tag){const definition=incoming.document.tags.find(t=>t.name.toLowerCase()===entry.tag.toLowerCase());tag=await api('/api/tags','POST',{name:entry.tag,...(definition?.description?{description:definition.description}:{})});knownTags.push(tag);setTags([...knownTags].sort((a,b)=>a.name.localeCompare(b.name)));}
    const body=importedSegment(entry,runId);body.tagId=tag.id;
    const saved=await api('/api/videos/'+id+'/segments','POST',body);added++;current.push(saved);setSegments([...current]);
   }
   setIncoming(null);setImportProgress('');setNotice('Imported '+added+' intervals; skipped '+plan.duplicates+' duplicates.'+(plan.conflicts?' Kept '+plan.conflicts+' locally edited intervals unchanged.':''));invalidate();
  }catch(e){setImportError('Import stopped'+(added?' after '+added+' intervals':'')+'. Any intervals already saved will be detected on retry. '+e.message);invalidate();}
  finally{pending.current=false;setBusy(false);}
 }
 function goBack(){if(!busy)onNavigate({page:'video',id});}
 const endpoint=(which,label)=>h('div',{className:'as-boundary'},h('label',null,label,h(TimeField,{label:label+' time',value:draft?.[which],onChange:value=>setDraft({...draft,[which]:value}),disabled:busy})),h('div',{className:'as-buttonrow'},button('−1s',()=>nudge(which,-1),{disabled:busy}),button('−0.1s',()=>nudge(which,-0.1),{disabled:busy}),button('+0.1s',()=>nudge(which,0.1),{disabled:busy}),button('+1s',()=>nudge(which,1),{disabled:busy}),button('Use playhead',()=>mark(which),{disabled:busy,title:which==='start'?'Shortcut: I':'Shortcut: O'})));
 if(loading)return h('main',{className:'as-studio'},h('p',null,'Loading Annotation Studio…'));
 if(!video)return h('main',{className:'as-studio'},h('p',{role:'alert',className:'as-error'},error||'Video not found.'),button('Back to video',goBack));
 return h('main',{className:'as-studio'+(side?' as-show-'+side:'')},
  h('header',{className:'as-heading'},h('div',null,button('← Back to video',goBack,{className:'as-back',disabled:busy}),h('h1',null,'Annotation Studio'),h('p',null,video.title)),h('div',{className:'as-header-actions'},h('span',{className:'as-save-state'},dirty?'Unsaved draft':segments.filter(s=>s.tagId!=null&&(!s.kind||s.kind==='tag')).length+' saved intervals'),h('div',{className:'as-buttonrow'},button('Export JSON',downloadTimeline,{disabled:busy}),button('Import JSON',()=>importFile.current?.click(),{disabled:busy})),h('input',{type:'file',ref:importFile,accept:'.json,application/json',hidden:true,'aria-label':'Import annotation JSON file',onChange:e=>{const file=e.target.files?.[0];e.target.value='';void openImport(file);}}))),
  h('div',{className:'as-player'},h(NativePlayer,{video,onContext})),
  h('section',{className:'as-transport','aria-label':'Annotation playback controls'},
   h('div',{className:'as-side-toggles'},button('Intervals',()=>setSide(s=>s==='saved'?'':'saved'),{'aria-pressed':side==='saved'}),button('Editor',()=>setSide(s=>s==='editor'?'':'editor'),{'aria-pressed':side==='editor'})),
   h('div',{className:'as-buttonrow'},button(player?.playing?'Pause':'Play',()=>{if(player?.playing)player.pause();else player?.play().catch(e=>setError(e.message));},{disabled:!player,className:'as-primary'}),...SKIPS.map(sec=>button((sec>0?'+':'−')+Math.abs(sec)+'s',()=>skip(sec),{key:sec,disabled:!player,'aria-label':(sec<0?'Back ':'Forward ')+Math.abs(sec)+' seconds'}))),
   h('div',{className:'as-buttonrow','aria-label':'Playback speed'},...RATES.map(rate=>button(rate+'×',()=>player?.setPlaybackRate?.(rate),{key:rate,disabled:!player?.setPlaybackRate,'aria-pressed':Math.abs((player?.playbackRate??1)-rate)<0.01,className:Math.abs((player?.playbackRate??1)-rate)<0.01?'as-active':''}))),
   h('div',{className:'as-time'},h('output',{'aria-label':'Playback time'},formatTime(now)+' / '+formatTime(duration))),
   h('form',{className:'as-jump',onSubmit:e=>{e.preventDefault();const sec=parseTime(jump);if(Number.isFinite(sec)){player?.seek(clamp(sec,0,duration));setError('');}else setError('Enter a valid jump time, such as 2:30.');}},h('input',{'aria-label':'Jump to time',placeholder:'Jump to mm:ss',value:jump,onChange:e=>setJump(e.target.value)}),h('button',{type:'submit',disabled:!player},'Go'))),
  h('div',{className:'as-keyboard'},'Space play/pause · ←/→ 1s · Shift+←/→ 5s · 1/2/3/5 speed · N new · I/O start/end · Ctrl+S save'),
  error?h('div',{className:'as-error',role:'alert'},error):null,
  notice?h('div',{className:'as-notice',role:'status'},notice,undo?button('Undo deletion',restore,{disabled:busy}):null):null,
  h('div',{className:'as-workarea'},
   h('section',{className:'as-timeline-panel','aria-label':'Act timeline'},
    h('div',{className:'as-timeline-tools'},h('h2',null,'Act timeline'),h('input',{'aria-label':'Filter timeline tags',placeholder:'Filter tags…',value:filter,onChange:e=>setFilter(e.target.value)}),h('label',null,'Zoom ',h('select',{'aria-label':'Timeline zoom',value:zoom,onChange:e=>setZoom(Number(e.target.value))},...[1,2,4,8,16].map(z=>h('option',{key:z,value:z},z===1?'Whole scene':z+'×')))),zoom>1?button('Find playhead',centerPlayhead,{title:'Scroll the zoomed timeline to the current playback position without seeking the video'}):null),
    h('div',{className:'as-timeline-scroll',ref:scroll},h('div',{className:'as-timeline',style:{width:zoom*100+'%'}},
     h('div',{className:'as-timeline-row as-ruler'},h('div',{className:'as-row-label'},'Tag'),h('div',{className:'as-track',onClick:seekEvent,ref:track},...Array.from({length:Math.ceil(zoom*8)+1},(_,i)=>{const fraction=i/(zoom*8);return h('span',{key:i,className:'as-tick',style:{left:(fraction*100)+'%'}},formatTime(duration*fraction,0));}))),
     h('div',{className:'as-timeline-row as-gap-row'},h('div',{className:'as-row-label',title:'No saved tag covers these times.'},'Unannotated'),h('div',{className:'as-track',onClick:seekEvent},
      ...gaps.map(gap=>h('button',{type:'button',key:gap.start,className:'as-segment as-gap-segment',style:{left:(gap.start/duration*100)+'%',width:((gap.end-gap.start)/duration*100)+'%',top:2},title:'Unannotated · '+formatTime(gap.start)+'–'+formatTime(gap.end)+' · Click to annotate','aria-label':'Annotate gap '+formatTime(gap.start)+' to '+formatTime(gap.end),disabled:busy,onClick:e=>{e.stopPropagation();chooseGap(gap);}},h('span',{className:'as-segment-label'},formatTime(gap.start,0)+'–'+formatTime(gap.end,0)))),
      !gaps.length?h('span',{className:'as-no-gaps'},'No gaps'):null,
      h('div',{className:'as-playhead',style:{left:(now/Math.max(1,duration)*100)+'%'}}))),
     ...rows.map(row=>h('div',{className:'as-timeline-row',key:row.tagId},h('div',{className:'as-row-label',title:row.name},row.name),h('div',{className:'as-track',style:{height:row.lanes*18+4},onClick:seekEvent},
      ...row.items.map(s=>{const isSelected=s.id===selected;const a=isSelected&&draft?parseTime(draft.start):s.startSec;const b=isSelected&&draft?parseTime(draft.end):s.endSec;const start=Number.isFinite(a)?a:s.startSec,end=Number.isFinite(b)?b:s.endSec??s.startSec;return h('button',{type:'button',key:s.id,className:'as-segment'+(isSelected?' as-selected':''),style:{left:(start/duration*100)+'%',width:Math.max(0.18,(end-start)/duration*100)+'%',top:s.lane*18+2,backgroundColor:colorFor(row.tagId)},title:row.name+' · '+formatTime(start)+'–'+formatTime(end),onClick:e=>{e.stopPropagation();choose(s);},'aria-label':row.name+' '+formatTime(start)+' to '+formatTime(end)},
       isSelected?h('span',{className:'as-handle as-handle-start',title:'Drag start; Save to apply',onClick:e=>e.stopPropagation(),onPointerDown:e=>beginDrag(e,'start'),onPointerMove:moveDrag,onPointerUp:()=>{drag.current=null;},onPointerCancel:()=>{drag.current=null;}},'⋮'):null,
       h('span',{className:'as-segment-label'},formatTime(start,0)+'–'+formatTime(end,0)),
       isSelected?h('span',{className:'as-handle as-handle-end',title:'Drag end; Save to apply',onClick:e=>e.stopPropagation(),onPointerDown:e=>beginDrag(e,'end'),onPointerMove:moveDrag,onPointerUp:()=>{drag.current=null;},onPointerCancel:()=>{drag.current=null;}},'⋮'):null);}),
      h('div',{className:'as-playhead',style:{left:(now/Math.max(1,duration)*100)+'%'}})))),
     !rows.length?h('div',{className:'as-empty'},filter?'No matching tags.':'No tagged intervals yet. Use New interval or press I to start.'):null)),
    h('p',{className:'as-help'},'Unannotated shows time with no saved tags. Click a gap to start an interval, or an existing range to edit it. Click empty space to seek. Overlapping acts stay on separate rows. Drag the selected range’s edges, then Save.')),
   h('aside',{className:'as-editor','aria-label':'Interval editor'},button('Close editor',()=>setSide(''),{className:'as-close-side'}),h('div',{className:'as-editor-heading'},h('h2',null,draft?(selected==null?'New interval':'Edit interval'):'Interval editor'),button('New interval',newInterval,{disabled:busy||!player,className:'as-new-interval',title:'Start a separate interval, including an overlapping act'})),
    h(TagSelector,{tags,value:draft?.tagText??tags.find(t=>String(t.id)===draft?.tagId)?.name??'',disabled:busy,onType:typeTag,onSelect:selectTag,onCommit:commitTag}),
    tagError?h('p',{className:'as-error',role:'alert'},tagError):null,
    draft?h(React.Fragment,null,
     endpoint('start','Start'),endpoint('end','End'),
     h('p',{className:'as-duration'},valid||('Duration: '+formatTime(parseTime(draft.end)-parseTime(draft.start)))),
     h('div',{className:'as-buttonrow'},button(loop?'Loop on':'Loop interval',()=>setLoop(v=>!v),{disabled:!!valid||!player,'aria-pressed':loop}),button('Preview',()=>{if(player&&!valid){player.seek(parseTime(draft.start));player.play().catch(e=>setError(e.message));}},{disabled:!!valid||!player})),
     h('div',{className:'as-editor-actions'},button(busy?'Saving…':'Save interval',save,{className:'as-primary',disabled:busy||!dirty||!!valid}),button('Cancel',()=>{clearDraft();setError('');setNotice('Draft cancelled.');},{disabled:busy}),button('Duplicate',duplicateInterval,{disabled:busy||selected==null||!Number.isFinite(parseTime(draft.start))||!Number.isFinite(parseTime(draft.end)),title:'Copy these times into a new interval for another tag'})),
     selected!=null?h('div',{className:'as-delete'},confirmDelete?h(React.Fragment,null,h('p',null,'Delete this saved interval?'),button('Delete interval',remove,{className:'as-danger',disabled:busy}),button('Keep interval',()=>setConfirmDelete(false),{disabled:busy})):button('Delete…',()=>setConfirmDelete(true),{className:'as-danger',disabled:busy})):null,
     h('small',null,'Times accept seconds or mm:ss.ss. Edits apply only when saved.')):h(React.Fragment,null,h('p',null,'Select a range on the timeline, or start an interval at the playhead.'),h('p',{className:'as-help'},'Press I at the beginning, O at the end, choose a tag, then Save.')))),
  h(SavedIntervals,{segments,tags,selected,filter,busy,onSelect:choose,onClose:()=>setSide('')}),
  incoming&&importPlan?h(ImportDialog,{incoming,plan:importPlan,currentTitle:video.title,busy,error:importError,progress:importProgress,acknowledged:importAcknowledged,onAcknowledged:setImportAcknowledged,onImport:applyImport,onClose:()=>{if(!busy)setIncoming(null);}}):null);
}
function ImportDialog({incoming,plan,currentTitle,busy,error,progress,acknowledged,onAcknowledged,onImport,onClose}){
 const element=useRef(null);
 useEffect(()=>{element.current?.showModal();return()=>element.current?.close();},[]);
 const labels={add:'Add',duplicate:'Already present',conflict:'Local edit kept','out-of-bounds':'Outside video'};
 return h('dialog',{ref:element,className:'as-import-dialog',role:'dialog','aria-modal':true,'aria-labelledby':'as-import-title',onCancel:e=>{e.preventDefault();if(!busy)onClose();}},
  h('header',null,h('h2',{id:'as-import-title'},'Import annotations'),button('Close',onClose,{disabled:busy})),
  h('p',null,h('strong',null,incoming.name)),h('p',null,'File scene: '+incoming.document.scene.title),h('p',null,'Current video: '+currentTitle),
  h('p',{className:'as-import-summary'},plan.add+' to add · '+plan.duplicates+' already present'+(plan.conflicts?' · '+plan.conflicts+' local edits kept':'')),
  h('p',null,'Existing intervals are kept. New tag names are added to COVE. Overlapping acts remain separate.'),
  plan.newTags.length?h('p',null,'New tags: '+plan.newTags.join(', ')):null,
  plan.warnings.length?h('ul',{className:'as-import-warnings'},...plan.warnings.map((text,i)=>h('li',{key:i},text))):h('p',{className:'as-match'},'Exact video fingerprint matches.'),
  plan.requiresConfirmation?h('label',{className:'as-import-ack'},h('input',{type:'checkbox',checked:acknowledged,onChange:e=>onAcknowledged(e.target.checked),disabled:busy}),'I checked that this file and video use the same timeline.'):null,
  plan.blocked?h('p',{className:'as-error',role:'alert'},'Some intervals fall outside this video. Fix the file or choose the correct video before importing.'):null,
  h('div',{className:'as-import-preview'},h('table',null,h('thead',null,h('tr',null,...['Tag','Start','End','Action'].map(label=>h('th',{key:label},label)))),h('tbody',null,...plan.entries.slice(0,200).map((s,i)=>h('tr',{key:i},h('td',null,s.tag),h('td',null,formatBoundary(String(s.start_seconds))),h('td',null,s.end_seconds==null?'Point':formatBoundary(String(s.end_seconds))),h('td',null,labels[s.state])))))),
  plan.entries.length>200?h('small',null,'Showing the first 200 of '+plan.entries.length+' intervals.'):null,
  error?h('p',{className:'as-error',role:'alert'},error):null,
  progress?h('p',{role:'status'},progress):null,
  h('footer',null,button('Cancel',onClose,{disabled:busy}),button(busy?'Importing…':'Import '+plan.add+' intervals',onImport,{className:'as-primary',disabled:busy||plan.blocked||!plan.add||plan.requiresConfirmation&&!acknowledged})));
}

function TimeField({label,value,onChange,disabled}){
 const [editing,setEditing]=useState(false),[text,setText]=useState('');
 return h('input',{'aria-label':label,value:editing?text:formatBoundary(value),onFocus:()=>{setText(formatBoundary(value));setEditing(true);},onChange:e=>{setText(e.target.value);onChange(e.target.value);},onBlur:()=>setEditing(false),disabled,placeholder:'mm:ss.ss',inputMode:'text'});
}

function TagSelector({tags,value,disabled,onType,onSelect,onCommit}){
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const trimmed=value.trim(),exact=tags.some(t=>t.name.toLowerCase()===trimmed.toLowerCase());
 const matches=tags.filter(t=>!trimmed||t.name.toLowerCase().includes(trimmed.toLowerCase())).sort((a,b)=>(b.name.toLowerCase()===trimmed.toLowerCase())-(a.name.toLowerCase()===trimmed.toLowerCase())||a.name.localeCompare(b.name)).slice(0,10);
 const options=[...matches.map(tag=>({tag,label:tag.name})),...(!exact&&trimmed?[{create:true,label:'Create “'+trimmed+'”'}]:[])];
 async function choose(option){if(disabled)return;if(option?.tag){onSelect(option.tag);setOpen(false);}else if(await onCommit(trimmed))setOpen(false);}
 function key(event){
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();setOpen(true);setActive(i=>Math.max(0,Math.min(options.length-1,i+(event.key==='ArrowDown'?1:-1))));}
  else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(trimmed||active>=0)void choose(active>=0&&open?options[active]:exact?options.find(o=>o.tag?.name.toLowerCase()===trimmed.toLowerCase()):null);}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);}
 }
 return h('div',{className:'as-tag-combo'},h('label',null,'Tag',h('input',{role:'combobox','aria-label':'Interval tag','aria-autocomplete':'list','aria-expanded':open,'aria-controls':'as-tag-options','aria-activedescendant':open&&active>=0?'as-tag-option-'+active:undefined,value,onChange:e=>{onType(e.target.value);setOpen(true);setActive(-1);},onFocus:()=>{setOpen(true);setActive(-1);},onBlur:()=>setOpen(false),onKeyDown:key,disabled,autoComplete:'off',placeholder:'Choose or type a tag…'})),
  open&&!disabled?h('div',{id:'as-tag-options',role:'listbox','aria-label':'Tag suggestions',className:'as-tag-options'},...options.map((option,i)=>h('button',{key:option.tag?.id??'create',id:'as-tag-option-'+i,type:'button',role:'option','aria-selected':i===active,className:(option.create?'as-tag-create ':'')+(i===active?'as-tag-highlight':''),tabIndex:-1,onMouseDown:e=>e.preventDefault(),onClick:()=>void choose(option)},option.label))):null,
  h('small',null,'Choose a match, or type a new tag and press Enter.'));
}

function SavedIntervals({segments,tags,selected,filter,busy,onSelect,onClose}){
 const [order,setOrder]=useState(()=>{try{return localStorage.getItem('cove.annotation-studio.order')==='tag'?'tag':'time';}catch{return 'time';}});
 const [collapsed,setCollapsed]=useState(()=>{try{const ids=JSON.parse(localStorage.getItem('cove.annotation-studio.collapsed-tags')||'[]');return Array.isArray(ids)?ids:[];}catch{return [];}});
 function collapse(ids){setCollapsed(ids);try{localStorage.setItem('cove.annotation-studio.collapsed-tags',JSON.stringify(ids));}catch{}}
 const items=segments.filter(s=>s.tagId!=null&&(!s.kind||s.kind==='tag')&&(!filter||(s.tagName||'').toLowerCase().includes(filter.toLowerCase()))).sort((a,b)=>a.startSec-b.startSec||a.id-b.id);
 const nameFor=s=>s.tagName||tags.find(t=>t.id===s.tagId)?.name||'Tag '+s.tagId;
 const groups=order==='time'?[{name:null,items}]:[...new Set(items.map(s=>s.tagId))].map(tagId=>({tagId,name:nameFor(items.find(s=>s.tagId===tagId)),items:items.filter(s=>s.tagId===tagId)})).sort((a,b)=>a.name.localeCompare(b.name));
 const row=s=>h('li',{key:s.id},button(h(React.Fragment,null,h('strong',null,nameFor(s)),h('span',null,formatTime(s.startSec)+' — '+(s.endSec==null?'Point':formatTime(s.endSec)))),()=>onSelect(s),{disabled:busy,className:'as-saved-item'+(selected===s.id?' as-list-selected':''),'aria-label':'Edit '+nameFor(s)+' '+formatTime(s.startSec)+' to '+formatTime(s.endSec),'aria-pressed':selected===s.id}));
 return h('section',{className:'as-interval-list','aria-label':'Saved intervals'},button('Close intervals',onClose,{className:'as-close-side'}),h('h2',null,'Saved intervals'),h('label',{className:'as-list-order'},'View',h('select',{'aria-label':'Saved interval grouping',value:order,onChange:e=>{const value=e.target.value;setOrder(value);try{localStorage.setItem('cove.annotation-studio.order',value);}catch{}}},h('option',{value:'time'},'Chronological'),h('option',{value:'tag'},'Grouped by tag'))),h('p',{className:'as-help'},items.length+' intervals'),order==='tag'?h('div',{className:'as-collapse-controls'},button('Collapse all',()=>collapse(groups.map(g=>g.tagId))),button('Expand all',()=>collapse([]))):null,h('div',{className:'as-saved-scroll'},...groups.map((group,i)=>h('div',{key:group.name??'all'},group.name?button(h(React.Fragment,null,h('span',{className:'as-group-label'},h('span',{'aria-hidden':true},collapsed.includes(group.tagId)?'▸':'▾'),group.name),h('span',{className:'as-group-count'},group.items.length)),()=>collapse(collapsed.includes(group.tagId)?collapsed.filter(x=>x!==group.tagId):[...collapsed,group.tagId]),{className:'as-saved-group as-group-toggle','aria-expanded':!collapsed.includes(group.tagId),'aria-label':(collapsed.includes(group.tagId)?'Expand ':'Collapse ')+group.name}):null,(!group.name||!collapsed.includes(group.tagId))?h('ol',null,...group.items.map(row)):null))));
}

function colorFor(id){return 'hsl('+((Number(id)*57)%360)+' 45% 34%)';}
export default {components:{AnnotateAction,AnnotationPage}};
