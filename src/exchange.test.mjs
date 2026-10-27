import test from 'node:test';
import assert from 'node:assert/strict';
import {exportTimeline,parseTimeline,planImport,importedSegment} from './exchange.mjs';
const video={title:'Example',primaryFileId:9,files:[{id:9,path:'C:/private/video.mp4',duration:100,fingerprints:[{type:'oshash',value:'1234'}]}],remoteIds:[{endpoint:'https://user:secret@example.test/graphql?api_key=secret',remoteId:'scene-a'}]};
const tags=[{id:22,name:'Act A',description:'Definition'},{id:23,name:'Act B'}];
const segments=[{id:5,tagId:22,tagName:'Act A',kind:'tag',startSec:1.123456,endSec:8.987654,payload:{secret:'private'}},{id:6,tagId:23,tagName:'Act B',kind:'tag',startSec:3,endSec:7}];
test('portable export preserves exact overlapping intervals without local ids, paths or opaque payloads',async()=>{
 const doc=await exportTimeline(video,segments,tags);const text=JSON.stringify(doc);
 assert.ok(!text.includes('private'));assert.ok(!text.includes('secret'));assert.ok(!text.includes('tagId'));assert.ok(!text.includes('hostId'));
 assert.equal(doc.scene.remote_ids[0].endpoint,'https://example.test/graphql');
 assert.equal(doc.segments[0].start_seconds,1.123456);assert.equal(doc.segments[0].end_seconds,8.987654);
 assert.equal(doc.tags[0].description,'Definition');assert.equal(parseTimeline(text).segments.length,2);
 assert.deepEqual((await exportTimeline(video,segments,tags)).segments,doc.segments);
 const sameFileOtherDatabase=segments.map(s=>({...s,id:s.id+100,tagId:s.tagId+100}));
 assert.deepEqual((await exportTimeline(video,sameFileOtherDatabase,tags.map(t=>({...t,id:t.id+100})))).segments,doc.segments);
});
test('reimport skips duplicates, preserves overlaps, and identifies edited imported records',async()=>{
 const doc=parseTimeline(await exportTimeline(video,segments,tags));
 let plan=planImport(doc,video,segments,tags);assert.equal(plan.add,0);assert.equal(plan.duplicates,2);assert.equal(plan.requiresConfirmation,false);
 const imported=doc.segments.map((entry,i)=>({...importedSegment(entry,'run'),id:80+i,tagId:tags[i].id,tagName:tags[i].name}));
 plan=planImport(doc,video,[{...imported[0],endSec:9},imported[1]],tags);assert.equal(plan.conflicts,1);assert.equal(plan.add,0);
 plan=planImport(doc,video,[],tags);assert.equal(plan.add,2);assert.equal(plan.duplicates,0);
 const within={...doc,segments:[doc.segments[0],{...doc.segments[0],id:'another-id'}]};
 assert.equal(planImport(within,video,[],tags).duplicates,1);
});
test('validation rejects malformed, unsupported, unsafe timing and repeated ids',async()=>{
 const doc=await exportTimeline(video,segments,tags);
 for(const bad of [null,{...doc,version:2},{...doc,segments:[{...doc.segments[0],start_seconds:'1'}]},{...doc,segments:[{...doc.segments[0],end_seconds:101}]},{...doc,segments:[doc.segments[0],doc.segments[0]]}])assert.throws(()=>parseTimeline(bad));
 assert.throws(()=>parseTimeline('{bad json'));
 const point=parseTimeline({...doc,segments:[{...doc.segments[0],end_seconds:null}]});assert.equal(point.segments[0].end_seconds,null);
 const shorter={...video,files:[{...video.files[0],duration:5}]};assert.equal(planImport(parseTimeline(doc),shorter,[],tags).blocked,true);
});
test('perceptual hashes alone do not prove scene identity; mismatched timing needs acknowledgement',async()=>{
 const doc=parseTimeline(await exportTimeline(video,segments,tags));
 const unknown={...doc,scene:{...doc.scene,remote_ids:[],fingerprints:[{type:'phash',value:'same'}]}};
 assert.equal(planImport(unknown,video,[],tags).requiresConfirmation,true);
 assert.equal(planImport({...doc,scene:{...doc.scene,duration_seconds:101}},video,[],tags).requiresConfirmation,true);
});
