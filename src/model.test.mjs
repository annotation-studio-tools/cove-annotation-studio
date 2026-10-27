import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTime,parseTime,draftFor,validateDraft,buildWrite,recordSignature,layoutRows,SKIPS} from './model.mjs';
test('time editing preserves fractional seconds and rejects malformed input',()=>{
 assert.equal(parseTime('01:02.125'),62.125); assert.equal(parseTime('1:02:03.5'),3723.5);
 assert.ok(Number.isNaN(parseTime('1:99'))); assert.ok(Number.isNaN(parseTime('')));
 assert.equal(formatTime(59.999), '1:00.00');
 const d=draftFor({tagId:3,startSec:1.123456,endSec:19.987654});
 assert.equal(buildWrite(d).startSec,1.123456);assert.equal(buildWrite(d).endSec,19.987654);
 assert.equal(validateDraft({...d,end:'0'},100),'End must be later than start.');
 assert.equal(validateDraft({...d,end:'101'},100),'Keep both times within the video.');
 assert.equal(validateDraft(d,100),'');assert.deepEqual(SKIPS,[-5,-1,1,5]);
});
test('editing boundaries retains provenance and full native payload',()=>{
 const s={id:4,tagId:7,startSec:10,endSec:20,kind:'tag',refId:9,payload:{annotation_id:'a',import_baseline:{original:'keep'}},sourceKey:'user',sourceRunId:'original-run',confidence:0.8,title:'note',colorHint:'#abc'};
 const out=buildWrite({...draftFor(s),end:'22'},s);
 assert.deepEqual(out,{startSec:10,endSec:22,tagId:7,kind:'tag',refId:9,payload:s.payload,sourceKey:'user',sourceRunId:'original-run',confidence:0.8,title:'note',colorHint:'#abc'});
 assert.notEqual(recordSignature(s),recordSignature({...s,endSec:21}));
});
test('overlapping records occupy individual lanes without merging',()=>{
 const rows=layoutRows([{id:1,tagId:1,startSec:0,endSec:10},{id:2,tagId:1,startSec:5,endSec:15},{id:3,tagId:1,startSec:15,endSec:20},{id:4,tagId:2,startSec:0,endSec:5}], [{id:1,name:'A'},{id:2,name:'B'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].items.length,3);assert.equal(rows[0].lanes,2);
 assert.deepEqual(rows[0].items.map(x=>x.lane),[0,1,0]);
 assert.equal(layoutRows(rows.flatMap(r=>r.items),[{id:1,name:'A'},{id:2,name:'B'}],'b').length,1);
});

test('conflict checks ignore storage timestamp precision and JSON object key ordering',()=>{
 const s={startSec:0.125,endSec:1.725,tagId:1,kind:'tag',payload:{b:2,a:{z:1,x:0}},updatedAt:'2026-10-27T00:00:00.1234567Z'};
 const stored={...s,payload:{a:{x:0,z:1},b:2},updatedAt:'2026-10-27T00:00:00.123456Z'};
 assert.equal(recordSignature(s),recordSignature(stored));
 assert.notEqual(recordSignature(s),recordSignature({...stored,payload:{b:3,a:{z:1,x:0}}}));
});

import {unannotatedRanges} from './model.mjs';
test('unannotated coverage unions overlapping acts and preserves leading, internal and trailing gaps',()=>{
 const range=(start,end,tagId=1)=>({startSec:start,endSec:end,tagId,kind:'tag'});
 assert.deepEqual(unannotatedRanges([range(2,10),range(4,6,2),range(8,12),range(15,20),range(20,22)],25),[{start:0,end:2},{start:12,end:15},{start:22,end:25}]);
 assert.deepEqual(unannotatedRanges([],25),[{start:0,end:25}]);
 assert.deepEqual(unannotatedRanges([range(-4,40)],25),[]);
 assert.deepEqual(unannotatedRanges([range(0,3),range(3,25)],25),[]);
 assert.deepEqual(unannotatedRanges([range(4,4),range(4,null),{...range(0,25),kind:'face'},range(0,25,null)],25),[{start:0,end:25}]);
 assert.deepEqual(unannotatedRanges([],0),[]);
 assert.deepEqual(unannotatedRanges([range(0,0.125),range(0.126,1)],1),[{start:0.125,end:0.126}]);
});

import {formatBoundary,duplicateTiming} from './model.mjs';
test('boundary display uses mm:ss.ss without rewriting stored precision',()=>{
 const raw=draftFor({tagId:1,startSec:527.123456,endSec:616.987654});
 assert.equal(formatBoundary(raw.start),'08:47.12');assert.equal(formatBoundary(raw.end),'10:16.99');
 assert.equal(buildWrite(raw).startSec,527.123456);assert.equal(buildWrite(raw).endSec,616.987654);
 assert.equal(formatBoundary('0'),'00:00.00');assert.equal(formatBoundary(''),'');assert.equal(formatBoundary('9:15.25'),'09:15.25');
 const copy=duplicateTiming(raw);assert.deepEqual(copy,{tagId:'',start:raw.start,end:raw.end});assert.equal(raw.tagId,'1');
});
