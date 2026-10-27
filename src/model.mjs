export const RATES = [0.5, 1, 2, 3, 5];
export const SKIPS = [-5, -1, 1, 5];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function formatTime(seconds, precision = 2) {
 if (!Number.isFinite(Number(seconds))) return '';
 const scale = 10 ** precision;
 const ticks = Math.round(Math.max(0, Number(seconds)) * scale);
 const minutes = Math.floor(ticks / (60 * scale));
 return minutes + ':' + ((ticks % (60 * scale)) / scale).toFixed(precision).padStart(precision ? 3 + precision : 2, '0');
}
export function parseTime(text) {
 const parts = String(text).trim().split(':');
 if (parts.length > 3 || !parts.length || parts.some(x => !/^\d+(?:\.\d+)?$/.test(x))) return NaN;
 if (parts.slice(1).some(x => Number(x) >= 60)) return NaN;
 return parts.reduce((a, x) => a * 60 + Number(x), 0);
}
export function draftFor(segment) {
 return {tagId: segment.tagId == null ? '' : String(segment.tagId), start: String(segment.startSec), end: segment.endSec == null ? '' : String(segment.endSec)};
}
export function validateDraft(draft, duration) {
 const start = parseTime(draft.start), end = parseTime(draft.end);
 if (!draft.tagId || !Number.isInteger(Number(draft.tagId)) || Number(draft.tagId) < 1) return 'Choose a tag.';
 if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Enter both times as seconds or minutes:seconds.';
 if (end <= start) return 'End must be later than start.';
 if (start < 0 || end > duration + 0.001) return 'Keep both times within the video.';
 return '';
}
export function buildWrite(draft, original = null) {
 return {startSec: parseTime(draft.start), endSec: parseTime(draft.end), tagId: Number(draft.tagId),
 kind: original?.kind ?? 'tag', refId: original?.refId ?? null, payload: original?.payload ?? null,
 sourceKey: original?.sourceKey ?? 'user', sourceRunId: original?.sourceRunId ?? null,
 confidence: original?.confidence ?? null, title: original?.title ?? null, colorHint: original?.colorHint ?? null};
}
function stable(value) {
 if(Array.isArray(value)) return value.map(stable);
 if(value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
export function recordSignature(record) {
 if (!record) return '';
 return JSON.stringify([record.startSec, record.endSec, record.tagId, record.kind, record.refId, stable(record.payload), record.sourceKey, record.sourceRunId, record.confidence, record.title, record.colorHint]);
}
export function layoutRows(segments, tags, filter = '') {
 const grouped = new Map();
 for (const s of segments) {
  if (s.tagId == null || (s.kind && s.kind !== 'tag')) continue;
  const name = s.tagName || tags.find(t => t.id === s.tagId)?.name || 'Tag ' + s.tagId;
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
  if (!grouped.has(s.tagId)) grouped.set(s.tagId, {tagId:s.tagId,name,items:[],lanes:1});
  grouped.get(s.tagId).items.push(s);
 }
 return [...grouped.values()].sort((a,b) => a.name.localeCompare(b.name)).map(row => {
  const ends = [];
  row.items = row.items.sort((a,b) => a.startSec-b.startSec || a.id-b.id).map(s => {
   let lane = ends.findIndex(end => end <= s.startSec);
   if (lane < 0) lane = ends.length;
   ends[lane] = Math.max(s.startSec + 0.1, s.endSec ?? s.startSec);
   return {...s,lane};
  });
  row.lanes = Math.max(1, ends.length);
  return row;
 });
}

// Coverage is the union of saved tag ranges, independent of the visible tag filter.
// Points and other segment kinds do not annotate a duration.
export function unannotatedRanges(segments, duration) {
 if (!Number.isFinite(duration) || duration <= 0) return [];
 const ranges=segments.filter(s=>s.tagId!=null&&(!s.kind||s.kind==='tag')&&Number.isFinite(s.startSec)&&Number.isFinite(s.endSec)&&s.endSec>s.startSec)
  .map(s=>({start:clamp(s.startSec,0,duration),end:clamp(s.endSec,0,duration)}))
  .filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start||a.end-b.end);
 const gaps=[];let cursor=0;
 for(const r of ranges){if(r.start>cursor)gaps.push({start:cursor,end:r.start});cursor=Math.max(cursor,r.end);}
 if(cursor<duration)gaps.push({start:cursor,end:duration});
 return gaps;
}

export function formatBoundary(value) {
 if (value == null || value === '') return '';
 const seconds=parseTime(value);
 return Number.isFinite(seconds)?formatTime(seconds,2).padStart(8,'0'):String(value);
}
export function duplicateTiming(draft) {
 return {tagId:'',start:draft.start,end:draft.end};
}
