export const TIMELINE_FORMAT='cove.annotation-studio';
export const TIMELINE_VERSION=1;
export const MAX_IMPORT_BYTES=5*1024*1024;
const normalizeTag=name=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
const tagged=s=>s.tagId!=null&&(!s.kind||s.kind==='tag');
function endpoint(value){try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.origin+u.pathname:'';}catch{return '';}}
export function sceneIdentity(video){
 const file=video.files?.find(f=>f.id===video.primaryFileId)??video.files?.[0];
 return {title:video.title||'Untitled video',duration_seconds:Number(file?.duration||0),
  remote_ids:(video.remoteIds??[]).map(r=>({endpoint:endpoint(r.endpoint),id:r.remoteId})).filter(r=>r.endpoint&&typeof r.id==='string'&&r.id),
  fingerprints:(file?.fingerprints??[]).filter(f=>typeof f.type==='string'&&typeof f.value==='string').map(f=>({type:f.type.toLowerCase(),value:f.value}))};
}
async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function exportTimeline(video,segments,tags,exportedAt=new Date().toISOString()){
 const scene=sceneIdentity(video),used=new Map(),counts=new Map();
 const identity=JSON.stringify([scene.remote_ids,scene.fingerprints,scene.duration_seconds]);
 const exported=[];
 for(const s of segments.filter(tagged).sort((a,b)=>a.startSec-b.startSec||a.id-b.id)){
  const tag=tags.find(t=>t.id===s.tagId),name=(s.tagName||tag?.name||'').trim();
  if(!name)throw new Error('An interval has an unnamed tag. Name that tag before exporting.');
  if(!used.has(normalizeTag(name)))used.set(normalizeTag(name),{name,...(tag?.description?{description:tag.description}:{})});
  const signature=JSON.stringify([identity,normalizeTag(name),s.startSec,s.endSec??null]);
  const ordinal=(counts.get(signature)||0)+1;counts.set(signature,ordinal);
  const savedId=s.payload?.annotation_studio?.annotation_id??s.payload?.annotation_id;
  const id=typeof savedId==='string'&&savedId?savedId:'sha256:'+await sha256(signature+'#'+ordinal);
  exported.push({id,tag:name,start_seconds:s.startSec,end_seconds:s.endSec??null});
 }
 return {format:TIMELINE_FORMAT,version:TIMELINE_VERSION,exported_at:exportedAt,scene,tags:[...used.values()].sort((a,b)=>a.name.localeCompare(b.name)),segments:exported};
}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function string(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(label+' must be a nonempty string, at most '+max+' characters.');return value.trim();}
export function parseTimeline(input){
 let doc=input;if(typeof input==='string'){try{doc=JSON.parse(input.replace(/^\uFEFF/,''));}catch{throw new Error('This file is not valid JSON.');}}
 if(!object(doc)||doc.format!==TIMELINE_FORMAT)throw new Error('Choose an Annotation Studio JSON export. Other formats are not supported.');
 if(doc.version!==TIMELINE_VERSION)throw new Error('Unsupported timeline format version: '+String(doc.version));
 if(!object(doc.scene)||!Number.isFinite(doc.scene.duration_seconds)||doc.scene.duration_seconds<=0)throw new Error('The file must specify a positive scene duration.');
 if(!Array.isArray(doc.segments)||doc.segments.length>50000)throw new Error('The file must contain a segments array with at most 50,000 entries.');
 const scene={title:string(doc.scene.title,'Scene title',1000),duration_seconds:doc.scene.duration_seconds,remote_ids:[],fingerprints:[]};
 if(doc.scene.remote_ids!=null&&!Array.isArray(doc.scene.remote_ids))throw new Error('Scene remote_ids must be an array.');
 for(const r of doc.scene.remote_ids??[]){if(!object(r))throw new Error('Invalid scene identifier.');const clean=endpoint(string(r.endpoint,'Identifier endpoint',2000));if(!clean)throw new Error('Invalid identifier endpoint.');scene.remote_ids.push({endpoint:clean,id:string(r.id,'Remote scene ID',1000)});}
 if(doc.scene.fingerprints!=null&&!Array.isArray(doc.scene.fingerprints))throw new Error('Scene fingerprints must be an array.');
 for(const f of doc.scene.fingerprints??[]){if(!object(f))throw new Error('Invalid scene fingerprint.');scene.fingerprints.push({type:string(f.type,'Fingerprint type',100).toLowerCase(),value:string(f.value,'Fingerprint value',2000)});}
 const ids=new Set(),segments=doc.segments.map((s,i)=>{
  if(!object(s))throw new Error('Invalid interval '+(i+1));const label='Interval '+(i+1),id=string(s.id,label+' ID',1000);
  if(ids.has(id))throw new Error('Duplicate annotation ID in the file: '+id);ids.add(id);
  const start=s.start_seconds,end=s.end_seconds;
  if(!Number.isFinite(start)||start<0||start>scene.duration_seconds)throw new Error(label+' has an invalid start time.');
  if(end!==null&&(!Number.isFinite(end)||end<start||end>scene.duration_seconds))throw new Error(label+' has an invalid end time.');
  return {id,tag:string(s.tag,label+' tag',200),start_seconds:start,end_seconds:end};
 });
 if(doc.tags!=null&&!Array.isArray(doc.tags))throw new Error('Tag definitions must be an array.');
 const tags=(doc.tags??[]).map(t=>{if(!object(t))throw new Error('Invalid tag definition.');return {name:string(t.name,'Tag name',200),...(typeof t.description==='string'?{description:t.description.slice(0,20000)}:{})};});
 return {format:TIMELINE_FORMAT,version:TIMELINE_VERSION,scene,tags,segments};
}
const segmentKey=(name,start,end)=>JSON.stringify([normalizeTag(name),start,end??null]);
export function planImport(doc,video,existing,tags){
 const current=sceneIdentity(video),duration=current.duration_seconds;
 const keys=new Set(),ids=new Map();
 for(const s of existing.filter(tagged)){
  const name=s.tagName||tags.find(t=>t.id===s.tagId)?.name;if(!name)continue;
  const key=segmentKey(name,s.startSec,s.endSec);keys.add(key);
  const id=s.payload?.annotation_studio?.annotation_id??s.payload?.annotation_id;if(id)ids.set(id,key);
 }
 const entries=doc.segments.map(s=>{
  const key=segmentKey(s.tag,s.start_seconds,s.end_seconds);let state='add';
  if(s.start_seconds>duration||s.end_seconds!=null&&s.end_seconds>duration)state='out-of-bounds';
  else if(ids.has(s.id)&&ids.get(s.id)!==key)state='conflict';
  else if(keys.has(key))state='duplicate';
  if(state==='add')keys.add(key);
  return {...s,state};
 });
 const strong=new Set(['sha256','md5','oshash']);
 const fingerprintMatch=doc.scene.fingerprints.some(a=>strong.has(a.type)&&current.fingerprints.some(b=>a.type===b.type&&a.value.toLowerCase()===b.value.toLowerCase()));
 const remoteMatch=doc.scene.remote_ids.some(a=>current.remote_ids.some(b=>a.endpoint===b.endpoint&&a.id===b.id));
 const remoteConflict=!remoteMatch&&doc.scene.remote_ids.some(a=>current.remote_ids.some(b=>a.endpoint===b.endpoint&&a.id!==b.id));
 const durationDelta=Math.abs(doc.scene.duration_seconds-duration);
 const warnings=[];
 if(remoteConflict)warnings.push('The scene identifier differs from this video.');
 if(!fingerprintMatch)warnings.push(remoteMatch?'Scene metadata matches, but this exact video file is not verified.':'No exact video fingerprint match was found.');
 if(durationDelta>0.05)warnings.push('The file and video durations differ by '+durationDelta.toFixed(2)+' seconds.');
 const newTags=[...new Set(entries.filter(e=>e.state==='add').map(e=>e.tag))].filter(name=>!tags.some(t=>normalizeTag(t.name)===normalizeTag(name)));
 return {entries,newTags,warnings,requiresConfirmation:!fingerprintMatch||remoteConflict||durationDelta>0.05,blocked:entries.some(e=>e.state==='out-of-bounds'),
  add:entries.filter(e=>e.state==='add').length,duplicates:entries.filter(e=>e.state==='duplicate').length,conflicts:entries.filter(e=>e.state==='conflict').length};
}
export function importedSegment(entry,runId){return {startSec:entry.start_seconds,endSec:entry.end_seconds,tagId:null,kind:'tag',sourceKey:'local.annotation-studio',sourceRunId:runId,
 payload:{annotation_studio:{annotation_id:entry.id,import_run_id:runId,format:TIMELINE_FORMAT,version:TIMELINE_VERSION}}};}
