import type {SecureValueStore} from './pairing-store';
import {isRecord} from './structured-request-wire';
export type RequestOutcome='unknown'|'accepted'|'refused'|'changed';
export interface RequestReceipt{operationId:string;hostId:string;hostVersion:string;worktreeId:string;tabId:string;sessionId:string;itemId:string;revision:number;fence:number;at:number;kind:'approval'|'async_reply';status:RequestOutcome;acknowledged:boolean}
export interface RequestJournal{load():Promise<RequestReceipt[]>;reserve(r:RequestReceipt):Promise<void>;update(r:RequestReceipt):Promise<void>}
export const REQUEST_JOURNAL_PREFIX='orca-deck.request-journal.v1.slot.';
const SLOTS=32,MAX_BYTES=1900;
const fields=['operationId','hostId','hostVersion','worktreeId','tabId','sessionId','itemId','revision','fence','at','kind','status','acknowledged'];
const immutable=['operationId','hostId','hostVersion','worktreeId','tabId','sessionId','itemId','revision','fence','at','kind'] as const;
type Stored={version:1|2;sequence:number;receipt:RequestReceipt};
export class RequestJournalError extends Error{constructor(){super('request_journal_unavailable');this.name='RequestJournalError';}}
const fail=():never=>{throw new RequestJournalError();};
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.slice().sort().join();
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
export const unresolvedRequest=(r:RequestReceipt)=>r.status==='unknown'&&!r.acknowledged;
function valid(v:unknown):v is RequestReceipt{
 if(!isRecord(v)||!exact(v,fields)||typeof v.operationId!=='string'||!/^\d{13}-[0-9a-f]{32}$/.test(v.operationId))return false;
 if(!['hostId','hostVersion','worktreeId','tabId','sessionId','itemId'].every(k=>typeof v[k]==='string'&&(v[k] as string).length>0&&(v[k] as string).length<=1024))return false;
 if(!['revision','fence'].every(k=>typeof v[k]==='number'&&Number.isSafeInteger(v[k])&&(v[k] as number)>0)||!Number.isSafeInteger(v.at)||(v.at as number)<0)return false;
 return ['approval','async_reply'].includes(String(v.kind))&&['unknown','accepted','refused','changed'].includes(String(v.status))&&typeof v.acknowledged==='boolean'&&(!v.acknowledged||v.status==='unknown');
}
function encode(v:Stored):string{
 if(![1,2].includes(v.version)||!Number.isSafeInteger(v.sequence)||v.sequence<=0||!valid(v.receipt))return fail();const raw=JSON.stringify(v);if(bytes(raw)>MAX_BYTES)return fail();return raw;
}
function decode(raw:string):Stored{
 if(bytes(raw)>MAX_BYTES)return fail();let v:unknown;try{v=JSON.parse(raw);}catch{return fail();}
 if(!isRecord(v)||!exact(v,['version','sequence','receipt'])||v.version!==1&&v.version!==2||v.version===1&&isRecord(v.receipt)&&v.receipt.kind!=='approval'||!Number.isSafeInteger(v.sequence)||(v.sequence as number)<=0||!valid(v.receipt))return fail();return v as unknown as Stored;
}
/** Small independent native slots; metadata only, no answer/body/hash/audio/token. One process-owned writer. */
export class SecureRequestJournal implements RequestJournal{
 private slots:(Stored|null)[]=Array.from({length:SLOTS},()=>null);
 private available=false;private queue:Promise<unknown>=Promise.resolve();
 constructor(private readonly store:SecureValueStore){}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.queue.then(work);this.queue=next.catch(()=>undefined);return next;}
 private key(i:number){return REQUEST_JOURNAL_PREFIX+String(i).padStart(2,'0');}
 load():Promise<RequestReceipt[]>{return this.serial(async()=>{
  this.available=false;const slots:(Stored|null)[]=[],ids=new Set<string>(),sequences=new Set<number>();
  try{for(let i=0;i<SLOTS;i++){const raw=await this.store.get(this.key(i));const entry=raw===null?null:decode(raw);if(entry){if(ids.has(entry.receipt.operationId)||sequences.has(entry.sequence))return fail();ids.add(entry.receipt.operationId);sequences.add(entry.sequence);}slots.push(entry);}}
  catch{return fail();}
  this.slots=slots;this.available=true;return slots.filter((r):r is Stored=>r!==null).sort((a,b)=>a.sequence-b.sequence).map(r=>({...r.receipt}));
 });}
 private async publish(i:number,value:Stored):Promise<void>{
  const raw=encode(value);try{await this.store.set(this.key(i),raw);if(await this.store.get(this.key(i))!==raw)return fail();}
  catch{this.available=false;return fail();}this.slots[i]={...value,receipt:{...value.receipt}};
 }
 reserve(r:RequestReceipt):Promise<void>{return this.serial(async()=>{
  if(!this.available||!valid(r)||r.status!=='unknown'||r.acknowledged||this.slots.some(s=>s?.receipt.operationId===r.operationId)||this.slots.filter(s=>s&&unresolvedRequest(s.receipt)).length>=16)return fail();
  let slot=this.slots.findIndex(s=>s===null);if(slot<0){let oldest=Infinity;this.slots.forEach((s,i)=>{if(s&&!unresolvedRequest(s.receipt)&&s.sequence<oldest){slot=i;oldest=s.sequence;}});}if(slot<0)return fail();
  await this.publish(slot,{version:r.kind==='approval'?1:2,sequence:Math.max(0,...this.slots.map(s=>s?.sequence??0))+1,receipt:{...r}});
 });}
 update(r:RequestReceipt):Promise<void>{return this.serial(async()=>{
  if(!this.available||!valid(r))return fail();const slot=this.slots.findIndex(s=>s?.receipt.operationId===r.operationId);if(slot<0)return fail();const old=this.slots[slot]!;
  if(immutable.some(k=>old.receipt[k]!==r[k])||old.receipt.acknowledged&&!r.acknowledged||old.receipt.status!=='unknown'&&old.receipt.status!==r.status)return fail();
  await this.publish(slot,{version:old.version,sequence:old.sequence,receipt:{...r}});
 });}
}
