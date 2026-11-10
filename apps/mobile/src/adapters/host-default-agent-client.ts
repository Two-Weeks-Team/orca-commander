import {isMethodNotFound} from './read-only-orca-client';
import type {ActionChannel} from './action-client';
import {normalizeWorktreePs} from './orca-read-model';
import {isRecord,structuredOperationId} from './structured-request-wire';
import {buildHostDefaultAgentLaunch,readHostDefaultSelection,readHostDefaultAgentLaunchResult,HOST_DEFAULT_AGENT_CAPABILITIES,type HostDefaultAgentVersion} from './host-default-agent-wire';
import {unresolvedHostDefaultLaunch,type HostDefaultAgentJournal,type HostDefaultLaunchReceipt} from './host-default-agent-journal';
import {ensureTransportCapabilities,CapabilityNegotiationError,refreshBoundActionChannel,type RefreshActionChannel} from './transport-capabilities';

export type HostDefaultAgentReason='busy'|'storage_unavailable'|'not_connected'|'unsupported_host'|'automatic_default'|'no_default'|'disabled_default'|'unsupported_default'|'selection_unavailable'|'target_changed'|'invalid_prompt'|'identity_unavailable'|'reconciliation_required'|'worktrees_unavailable';
export interface HostDefaultAgentConfirmation {readonly operationId:string;readonly hostId:string;readonly hostVersion:HostDefaultAgentVersion;readonly runtimeId:string;readonly generation:number;readonly worktreeId:string;readonly agent:'codex';readonly prompt:string;readonly preparedAt:number}
export interface HostDefaultAgentState {readonly journal:'loading'|'ready'|'unavailable';readonly busy:boolean;readonly receipts:readonly HostDefaultLaunchReceipt[]}
export interface EligibleInstructionWorktree {readonly worktreeId:string;readonly title:string;readonly path?:string}
export type HostDefaultAgentResult={status:'journaled'|'unknown'|'refused'|'changed'|'storage_unavailable'|'already_submitted'|'busy';sessionId?:string;messageId?:string;reason?:string;warning?:string};
interface Options {journal:HostDefaultAgentJournal;uuid:()=>string;now?:()=>number;refreshChannel:RefreshActionChannel}
class Refusal extends Error {constructor(readonly reason:HostDefaultAgentReason){super(reason);}}
type ChannelIdentity=Pick<ActionChannel,'transport'|'hostId'|'runtimeId'|'generation'>;
const same=(a:ChannelIdentity,b:ChannelIdentity)=>a.transport===b.transport&&a.hostId===b.hostId&&a.runtimeId===b.runtimeId&&a.generation===b.generation;
/** Initial dispatch uses the verified replay-required RPC once. There is deliberately no resend/replay API. */
export class HostDefaultAgentClient {
 private state:HostDefaultAgentState=Object.freeze({journal:'loading',busy:false,receipts:Object.freeze([])});
 private listeners=new Set<()=>void>();private loading:Promise<void>;private epoch=0;
 private pending?:{confirmation:HostDefaultAgentConfirmation;channel:ChannelIdentity};private now:()=>number;
 constructor(private channel:()=>ActionChannel|null,private options:Options){this.now=options.now??Date.now;this.loading=this.load();}
 getSnapshot(){return this.state;}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private publish(patch:Partial<HostDefaultAgentState>){this.state=Object.freeze({...this.state,...patch});for(const listener of this.listeners){try{listener();}catch{/* Consumers cannot own dispatch. */}}}
 private receipts(values:readonly HostDefaultLaunchReceipt[]){return Object.freeze(values.map(value=>Object.freeze({...value})));}
 private async load(){this.publish({journal:'loading'});try{this.publish({journal:'ready',receipts:this.receipts(await this.options.journal.load())});}catch{this.publish({journal:'unavailable'});}}
 async reloadJournal(){await this.loading;if(this.state.busy||this.pending)return;this.loading=this.load();await this.loading;}
 invalidate(){this.epoch++;this.pending=undefined;}
 cancel(confirmation:HostDefaultAgentConfirmation){if(this.pending?.confirmation===confirmation)this.pending=undefined;}
 private live():ActionChannel&{hostVersion:HostDefaultAgentVersion} {
  const c=this.channel();
  if(!c||((c.transport as {state?:unknown}).state!==undefined&&(c.transport as {state?:unknown}).state!=='ready')||!Number.isSafeInteger(c.generation)||c.generation<0)throw new Refusal('not_connected');
  if(typeof c.runtimeId!=='string'||!c.runtimeId)throw new Refusal('not_connected');return{...c,hostVersion:c.hostVersion||'unknown'};
 }
 private current(c:ActionChannel){if(!same(c,this.live()))throw new Refusal('target_changed');}
 private blocked(hostId:string,worktreeId:string){return this.state.receipts.filter(unresolvedHostDefaultLaunch).length>=16||this.state.receipts.some(receipt=>unresolvedHostDefaultLaunch(receipt)&&receipt.hostId===hostId&&receipt.worktreeId===worktreeId);}
 private async worktrees(c:ActionChannel):Promise<readonly EligibleInstructionWorktree[]>{
  const raw=await c.transport.request('worktree.ps',{limit:200});this.current(c);
  const normalized=normalizeWorktreePs(raw,{hostId:c.hostId,generation:c.generation,observedAt:this.now()});
  if(!normalized.ok||!isRecord(raw)||!Array.isArray(raw.worktrees))throw new Refusal('worktrees_unavailable');
  return raw.worktrees.flatMap(row=>isRecord(row)&&row.hostId==='local'&&typeof row.worktreeId==='string'?[Object.freeze({worktreeId:row.worktreeId,title:typeof row.displayName==='string'?row.displayName:row.worktreeId,...(typeof row.path==='string'?{path:row.path}:{})})]:[]);
 }
 async listEligibleWorktrees():Promise<{ok:true;worktrees:readonly EligibleInstructionWorktree[]}|{ok:false;reason:HostDefaultAgentReason}>{
  try{const c=this.live();return{ok:true,worktrees:await this.worktrees(c)};}catch(error){return{ok:false,reason:error instanceof Refusal?error.reason:'worktrees_unavailable'};}
 }
 private async verify(c:ActionChannel,worktreeId:string){
  if(!await refreshBoundActionChannel(c,()=>this.live(),this.options.refreshChannel))throw new Refusal('target_changed');
  try{await ensureTransportCapabilities(c,HOST_DEFAULT_AGENT_CAPABILITIES,HOST_DEFAULT_AGENT_CAPABILITIES,()=>this.live());}catch(error){throw new Refusal(error instanceof CapabilityNegotiationError&&error.reason==='target_changed'?'target_changed':'unsupported_host');}
  this.current(c);
  if((await this.worktrees(c)).filter(row=>row.worktreeId===worktreeId).length!==1)throw new Refusal('target_changed');
  const selected=readHostDefaultSelection(await c.transport.request('settings.getAgentLaunch',{}));this.current(c);
  if(!selected.ok){const reasons={automatic:'automatic_default',none:'no_default',disabled:'disabled_default',unsupported:'unsupported_default',unavailable:'selection_unavailable'} as const;throw new Refusal(reasons[selected.reason]);}
 }
 async prepare(input:{worktreeId:string;prompt:string}):Promise<{ok:true;confirmation:HostDefaultAgentConfirmation}|{ok:false;reason:HostDefaultAgentReason}>{
  const requested={worktreeId:input.worktreeId,prompt:input.prompt};
  await this.loading;if(this.state.busy||this.pending)return{ok:false,reason:'busy'};
  if(this.state.journal!=='ready')return{ok:false,reason:'storage_unavailable'};
  if(typeof requested.worktreeId!=='string'||!requested.worktreeId||requested.worktreeId.startsWith('id:')||requested.worktreeId.length>1024)return{ok:false,reason:'target_changed'};
  if(typeof requested.prompt!=='string'||!requested.prompt.trim()||new TextEncoder().encode(JSON.stringify({text:requested.prompt,delivery:'submit'})).length>256*1024)return{ok:false,reason:'invalid_prompt'};
  const epoch=this.epoch;this.publish({busy:true});
  try{
   const c=this.live();if(this.blocked(c.hostId,requested.worktreeId))throw new Refusal('reconciliation_required');
   await this.verify(c,requested.worktreeId);if(epoch!==this.epoch)throw new Refusal('target_changed');
   let operationId:string;try{operationId=structuredOperationId(this.options.uuid,this.now());}catch{throw new Refusal('identity_unavailable');}
   if(this.state.receipts.some(receipt=>receipt.operationId===operationId))throw new Refusal('identity_unavailable');
   const confirmation=Object.freeze({operationId,hostId:c.hostId,hostVersion:c.hostVersion,runtimeId:c.runtimeId,generation:c.generation,worktreeId:requested.worktreeId,agent:'codex' as const,prompt:requested.prompt,preparedAt:this.now()});
   this.pending={confirmation,channel:{transport:c.transport,hostId:c.hostId,runtimeId:c.runtimeId,generation:c.generation}};return{ok:true,confirmation};
  }catch(error){return{ok:false,reason:error instanceof Refusal?error.reason:'selection_unavailable'};}finally{this.publish({busy:false});}
 }
 async confirm(confirmation:HostDefaultAgentConfirmation):Promise<HostDefaultAgentResult>{
  if(this.state.busy)return{status:'busy'};
  const pending=this.pending;if(!pending||pending.confirmation!==confirmation)return{status:'already_submitted'};
  this.pending=undefined;const epoch=this.epoch;this.publish({busy:true});let reserved=false;
  let receipt:HostDefaultLaunchReceipt={operationId:confirmation.operationId,hostId:confirmation.hostId,hostVersion:confirmation.hostVersion,worktreeId:confirmation.worktreeId,agent:'codex',at:this.now(),status:'unknown',acknowledged:false,sessionId:null,messageId:null};
  const finish=async(status:HostDefaultAgentResult['status'],details:Omit<HostDefaultAgentResult,'status'>={}):Promise<HostDefaultAgentResult>=>{
   if(reserved){
    if(['journaled','refused','changed'].includes(status))receipt={...receipt,status:status as HostDefaultLaunchReceipt['status']};
    try{await this.options.journal.update(receipt);}catch{this.publish({journal:'unavailable'});}
    const others=this.state.receipts.filter(row=>row.operationId!==receipt.operationId);this.publish({receipts:this.receipts([...others.filter(unresolvedHostDefaultLaunch),...others.filter(row=>!unresolvedHostDefaultLaunch(row)).slice(-31),receipt])});
   }
   this.publish({busy:false});return{status,...details};
  };
  try{
   if(this.state.journal!=='ready')return await finish('storage_unavailable');
   let c=this.live();if(!same(c,pending.channel)||this.blocked(c.hostId,confirmation.worktreeId))return await finish('changed');
   await this.options.journal.reserve(receipt);reserved=true;
   c=this.live();if(!same(c,pending.channel))return await finish('changed');
   await this.verify(c,confirmation.worktreeId);
   if(this.epoch!==epoch||this.state.journal!=='ready')return await finish('changed');this.current(c);
   const params=buildHostDefaultAgentLaunch({worktreeId:confirmation.worktreeId,operationId:confirmation.operationId,prompt:confirmation.prompt});if(!params)return await finish('changed');
   // No await follows final channel/selection/scope checks except this original initial mutation.
   let raw:unknown;try{raw=await c.transport.request('agent.launchReplay',params as unknown as Record<string,unknown>);}catch(error){return await finish(isMethodNotFound(error)?'refused':'unknown');}
   const result=readHostDefaultAgentLaunchResult(raw,confirmation.worktreeId);
   if(result.kind!=='journaled')return await finish('unknown');
   receipt={...receipt,sessionId:result.sessionId,messageId:result.messageId};return await finish('journaled',{sessionId:result.sessionId,messageId:result.messageId,reason:result.reason,...(result.warning?{warning:result.warning}:{})});
  }catch(error){if(!reserved){if(error instanceof Refusal)return await finish('changed');this.publish({journal:'unavailable'});return await finish('storage_unavailable');}return await finish('changed');}
 }
 async acknowledge(operationId:string):Promise<boolean>{
  await this.loading;if(this.state.busy||this.pending||this.state.journal!=='ready')return false;
  const receipt=this.state.receipts.find(row=>row.operationId===operationId&&unresolvedHostDefaultLaunch(row));if(!receipt)return false;
  this.publish({busy:true});try{const next={...receipt,acknowledged:true};await this.options.journal.update(next);this.publish({receipts:this.receipts(this.state.receipts.map(row=>row.operationId===operationId?next:row))});return true;}catch{this.publish({journal:'unavailable'});return false;}finally{this.publish({busy:false});}
 }
}
