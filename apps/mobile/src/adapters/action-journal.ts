import type { ActionReceipt, ActionStatus } from './action-client';
import type { SecureValueStore } from './pairing-store';

export const ACTION_JOURNAL_PREFIX='orca-deck.action-journal.v1.slot.';
export const ACTION_JOURNAL_SLOTS=100;
export const ACTION_JOURNAL_MAX_BYTES=1900;
export interface ActionJournal {
 load():Promise<ActionReceipt[]>;
 reserve(receipt:ActionReceipt):Promise<void>;
 update(receipt:ActionReceipt):Promise<void>;
}
export class ActionJournalError extends Error {
 constructor(readonly code:'storage_unavailable'|'invalid_record'|'duplicate_id'|'capacity'|'record_missing'|'target_mismatch'){super(code);this.name='ActionJournalError';}
}
interface Stored { version:1;sequence:number;receipt:ActionReceipt }
const statuses=new Set<ActionStatus>(['accepted','partial','unknown','cursor_required','target_changed','not_connected','expired','refused','unavailable','storage_unavailable']);
const receiptFields=['acknowledged','at','bodyAccepted','hostId','hostVersion','handle','incarnationId','id','paneKey','status','submitAttempted','worktreeId'];
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).sort().join()===expected.slice().sort().join();
export const isUnresolvedAction=(r:ActionReceipt)=>!r.acknowledged&&(r.status==='unknown'||r.status==='partial');
const sameTarget=(a:ActionReceipt,b:ActionReceipt)=>a.id===b.id&&a.hostId===b.hostId&&a.worktreeId===b.worktreeId&&a.paneKey===b.paneKey&&a.handle===b.handle&&a.incarnationId===b.incarnationId&&a.hostVersion===b.hostVersion;
function bytes(text:string):number{let n=0;for(const char of text){const cp=char.codePointAt(0)!;n+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;}return n;}
function validReceipt(value:unknown):value is ActionReceipt{
 if(!object(value)||!keys(value,receiptFields)||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value.id))return false;
 if(!['hostId','hostVersion','handle','incarnationId','worktreeId','paneKey'].every(k=>typeof value[k]==='string'&&(value[k] as string).length>0&&(value[k] as string).length<=1900))return false;
 if(!Number.isSafeInteger(value.at)||(value.at as number)<0||typeof value.bodyAccepted!=='boolean'||typeof value.acknowledged!=='boolean'||![true,false,null].includes(value.submitAttempted as boolean|null)||!statuses.has(value.status as ActionStatus))return false;
 const uncertain=value.status==='unknown'||value.status==='partial';
 if(value.acknowledged&&!uncertain)return false;
 if(value.status==='accepted')return value.bodyAccepted&&value.submitAttempted===true;
 if(value.status==='cursor_required')return value.bodyAccepted&&value.submitAttempted===false;
 if(value.status==='partial')return value.bodyAccepted&&value.submitAttempted!==null;
 if(value.status==='unknown')return value.bodyAccepted||value.submitAttempted===false;
 return value.bodyAccepted===false&&value.submitAttempted===false;
}
function encode(value:Stored):string{
 if(!Number.isSafeInteger(value.sequence)||value.sequence<=0||!validReceipt(value.receipt))throw new ActionJournalError('invalid_record');
 const raw=JSON.stringify(value);if(bytes(raw)>ACTION_JOURNAL_MAX_BYTES)throw new ActionJournalError('invalid_record');return raw;
}
function decode(raw:string):Stored{
 if(bytes(raw)>ACTION_JOURNAL_MAX_BYTES)throw new ActionJournalError('invalid_record');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new ActionJournalError('invalid_record');}
 if(!object(value)||!keys(value,['version','sequence','receipt'])||value.version!==1||!Number.isSafeInteger(value.sequence)||(value.sequence as number)<=0||!validReceipt(value.receipt))throw new ActionJournalError('invalid_record');
 return value as unknown as Stored;
}

/** One process-owned writer. Each native value is its own publication; no index can strand an input intent. */
export class SecureActionJournal implements ActionJournal {
 private slots:(Stored|null)[]=Array.from({length:ACTION_JOURNAL_SLOTS},()=>null);
 private available=false;
 private queue:Promise<void>=Promise.resolve();
 constructor(private readonly store:SecureValueStore){}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.queue.then(work);this.queue=next.then(()=>undefined,()=>undefined);return next;}
 private key(slot:number):string{return ACTION_JOURNAL_PREFIX+String(slot).padStart(2,'0');}
 load():Promise<ActionReceipt[]>{return this.serial(async()=>{
  this.available=false;
  const records:(Stored|null)[]=[];const ids=new Set<string>();const sequences=new Set<number>();
  try{
   // Native values stay small; sequential reads bound platform work during startup.
   for(let i=0;i<ACTION_JOURNAL_SLOTS;i++){
    const raw=await this.store.get(this.key(i));const entry=raw===null?null:decode(raw);
    if(entry&&(ids.has(entry.receipt.id)||sequences.has(entry.sequence)))throw new ActionJournalError('invalid_record');
    if(entry){ids.add(entry.receipt.id);sequences.add(entry.sequence);}records.push(entry);
   }
  }catch(error){if(error instanceof ActionJournalError)throw error;throw new ActionJournalError('storage_unavailable');}
  this.slots=records;this.available=true;
  return records.filter((r):r is Stored=>r!==null).sort((a,b)=>a.sequence-b.sequence).map(r=>({...r.receipt}));
 });}
 private assertAvailable():void{if(!this.available)throw new ActionJournalError('storage_unavailable');}
 private async publish(slot:number,entry:Stored):Promise<void>{
  const raw=encode(entry);
  try{await this.store.set(this.key(slot),raw);if(await this.store.get(this.key(slot))!==raw)throw new Error('readback');}
  catch{this.available=false;throw new ActionJournalError('storage_unavailable');}
  this.slots[slot]={...entry,receipt:{...entry.receipt}};
 }
 reserve(receipt:ActionReceipt):Promise<void>{return this.serial(async()=>{
  this.assertAvailable();
  if(!validReceipt(receipt)||receipt.bodyAccepted||receipt.submitAttempted!==false||receipt.acknowledged||receipt.status==='partial')throw new ActionJournalError('invalid_record');
  if(this.slots.some(s=>s?.receipt.id===receipt.id))throw new ActionJournalError('duplicate_id');
  if(isUnresolvedAction(receipt)&&this.slots.filter(s=>s&&isUnresolvedAction(s.receipt)).length>=50)throw new ActionJournalError('capacity');
  let slot=this.slots.findIndex(s=>s===null);
  if(slot<0){
   let oldest=Infinity;
   this.slots.forEach((s,i)=>{if(s&&!isUnresolvedAction(s.receipt)&&s.sequence<oldest){oldest=s.sequence;slot=i;}});
  }
  if(slot<0)throw new ActionJournalError('capacity');
  const sequence=Math.max(0,...this.slots.map(s=>s?.sequence??0))+1;
  await this.publish(slot,{version:1,sequence,receipt:{...receipt}});
 });}
 update(receipt:ActionReceipt):Promise<void>{return this.serial(async()=>{
  this.assertAvailable();if(!validReceipt(receipt))throw new ActionJournalError('invalid_record');
  const slot=this.slots.findIndex(s=>s?.receipt.id===receipt.id);if(slot<0)throw new ActionJournalError('record_missing');
  const previous=this.slots[slot]!;
  if(!sameTarget(previous.receipt,receipt))throw new ActionJournalError('target_mismatch');
  if(previous.receipt.bodyAccepted&&!receipt.bodyAccepted||previous.receipt.submitAttempted===true&&receipt.submitAttempted!==true||previous.receipt.acknowledged&&!receipt.acknowledged)throw new ActionJournalError('invalid_record');
  if(isUnresolvedAction(receipt)&&!isUnresolvedAction(previous.receipt)&&this.slots.filter(s=>s&&isUnresolvedAction(s.receipt)).length>=50)throw new ActionJournalError('capacity');
  await this.publish(slot,{version:1,sequence:previous.sequence,receipt:{...receipt}});
 });}
}
