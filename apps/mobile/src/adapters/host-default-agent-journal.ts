import type {SecureValueStore} from './pairing-store';
import {isRecord} from './structured-request-wire';
import {type HostDefaultAgentVersion} from './host-default-agent-wire';

export interface HostDefaultLaunchReceipt{
 operationId:string;hostId:string;hostVersion:HostDefaultAgentVersion;worktreeId:string;agent:'codex';at:number;
 status:'unknown'|'journaled'|'refused'|'changed';acknowledged:boolean;sessionId:string|null;messageId:string|null;
}
export interface HostDefaultAgentJournal{load():Promise<HostDefaultLaunchReceipt[]>;reserve(receipt:HostDefaultLaunchReceipt):Promise<void>;update(receipt:HostDefaultLaunchReceipt):Promise<void>}
export const HOST_DEFAULT_AGENT_JOURNAL_PREFIX='orca-deck.host-default-launch.v1.slot.';
export const unresolvedHostDefaultLaunch=(r:HostDefaultLaunchReceipt)=>r.status==='unknown'&&!r.acknowledged;
const fields=['operationId','hostId','hostVersion','worktreeId','agent','at','status','acknowledged','sessionId','messageId'];
const immutable=['operationId','hostId','hostVersion','worktreeId','agent','at'] as const;
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.slice().sort().join();
const bytes=(v:string)=>new TextEncoder().encode(v).byteLength;
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=1024;
const fail=():never=>{throw new Error('host_default_launch_journal_unavailable');};
type Stored={version:1;sequence:number;receipt:HostDefaultLaunchReceipt};
function valid(v:unknown):v is HostDefaultLaunchReceipt{
 if(!isRecord(v)||!exact(v,fields)||typeof v.operationId!=='string'||!/^\d{13}-[0-9a-f]{32}$/.test(v.operationId)||!nonempty(v.hostId)||!nonempty(v.worktreeId)||!nonempty(v.hostVersion)||v.agent!=='codex'||!Number.isSafeInteger(v.at)||(v.at as number)<0)return false;
 if(!['unknown','journaled','refused','changed'].includes(String(v.status))||typeof v.acknowledged!=='boolean'||v.acknowledged&&v.status!=='unknown')return false;
 return v.status==='journaled'?nonempty(v.sessionId)&&v.sessionId.startsWith('codex_')&&v.sessionId.length>6&&nonempty(v.messageId):v.sessionId===null&&v.messageId===null;
}
function capture(r:HostDefaultLaunchReceipt):HostDefaultLaunchReceipt{if(!valid(r))return fail();return{...r};}
function encode(v:Stored):string{
 if(v.version!==1||!Number.isSafeInteger(v.sequence)||v.sequence<=0||!valid(v.receipt))return fail();
 const raw=JSON.stringify(v);if(bytes(raw)>1900)return fail();return raw;
}
function decode(raw:string):Stored{
 if(bytes(raw)>1900)return fail();let v:unknown;try{v=JSON.parse(raw);}catch{return fail();}
 if(!isRecord(v)||!exact(v,['version','sequence','receipt'])||v.version!==1||!Number.isSafeInteger(v.sequence)||(v.sequence as number)<=0||!valid(v.receipt))return fail();
 return{version:1,sequence:v.sequence as number,receipt:{...v.receipt}};
}

/** One process-owned protected metadata writer. Never stores a prompt, answer, digest or credential. */
export class SecureHostDefaultAgentJournal implements HostDefaultAgentJournal{
 private slots:(Stored|null)[]=Array.from({length:32},()=>null);private available=false;private queue:Promise<unknown>=Promise.resolve();
 constructor(private readonly store:SecureValueStore){}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.queue.then(work);this.queue=next.catch(()=>undefined);return next;}
 private key(i:number){return HOST_DEFAULT_AGENT_JOURNAL_PREFIX+String(i).padStart(2,'0');}
 load():Promise<HostDefaultLaunchReceipt[]>{return this.serial(async()=>{
  this.available=false;const slots:(Stored|null)[]=[],ids=new Set<string>(),sequences=new Set<number>();
  try{for(let i=0;i<32;i++){const raw=await this.store.get(this.key(i));const entry=raw===null?null:decode(raw);if(entry){if(ids.has(entry.receipt.operationId)||sequences.has(entry.sequence))return fail();ids.add(entry.receipt.operationId);sequences.add(entry.sequence);}slots.push(entry);}}catch{return fail();}
  this.slots=slots;this.available=true;return slots.filter((s):s is Stored=>s!==null).sort((a,b)=>a.sequence-b.sequence).map(s=>({...s.receipt}));
 });}
 private async publish(index:number,value:Stored):Promise<void>{
  const raw=encode(value);try{await this.store.set(this.key(index),raw);if(await this.store.get(this.key(index))!==raw)return fail();}catch{this.available=false;return fail();}
  this.slots[index]={...value,receipt:{...value.receipt}};
 }
 reserve(receipt:HostDefaultLaunchReceipt):Promise<void>{const r=capture(receipt);return this.serial(async()=>{
  if(!this.available||!valid(r)||r.status!=='unknown'||r.acknowledged||this.slots.some(s=>s?.receipt.operationId===r.operationId)||this.slots.filter(s=>s&&unresolvedHostDefaultLaunch(s.receipt)).length>=16)return fail();
  let index=this.slots.findIndex(s=>s===null);if(index<0){let oldest=Infinity;this.slots.forEach((s,i)=>{if(s&&!unresolvedHostDefaultLaunch(s.receipt)&&s.sequence<oldest){index=i;oldest=s.sequence;}});}if(index<0)return fail();
  await this.publish(index,{version:1,sequence:Math.max(0,...this.slots.map(s=>s?.sequence??0))+1,receipt:r});
 });}
 update(receipt:HostDefaultLaunchReceipt):Promise<void>{const r=capture(receipt);return this.serial(async()=>{
  if(!this.available||!valid(r))return fail();const index=this.slots.findIndex(s=>s?.receipt.operationId===r.operationId);if(index<0)return fail();const old=this.slots[index]!;
  if(immutable.some(k=>old.receipt[k]!==r[k])||old.receipt.acknowledged&&!r.acknowledged||old.receipt.status!=='unknown'&&(old.receipt.status!==r.status||old.receipt.sessionId!==r.sessionId||old.receipt.messageId!==r.messageId))return fail();
  await this.publish(index,{version:1,sequence:old.sequence,receipt:r});
 });}
}
