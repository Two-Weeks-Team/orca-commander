import {isMethodNotFound} from './read-only-orca-client';
import {READ_FRESH_MS} from '../core/read-freshness';
import {ensureTransportCapabilities,refreshBoundActionChannel,type RefreshActionChannel} from './transport-capabilities';
import type {ActionChannel} from './action-client';
import type {RpcTransport} from './read-only-orca-client';
import {normalizeWorktreePs,comparePublication,type TabsPublication,type PaneInventoryEvidence} from './orca-read-model';
import {isRecord,parseNativeTargets,readRequestEvidence,STRUCTURED_CAPABILITIES,CLAUDE_READ_CAPABILITY,structuredFingerprint,structuredOperationId,type NativeTarget,type RequestEvidence,type RequestItem} from './structured-request-wire';
import {unresolvedRequest,type RequestJournal,type RequestOutcome,type RequestReceipt} from './structured-request-journal';
import {readNativeAsyncEvidence,formatNativeAsyncReply,readAsyncSendOutcome,type NativeAsyncAnswer,type NativeAsyncEvidence} from './native-async-reply';
export type NativeReplyEntry=NativeAsyncEvidence&{hostId:string;hostVersion:string;runtimeId:string;generation:number;observedAt:number};
export interface NativeReplyConfirmation{readonly kind:'async_reply';readonly operationId:string;readonly entry:NativeReplyEntry;readonly text:string;readonly preparedAt:number}
export type StructuredEntry=RequestEvidence&{hostId:string;hostVersion:string;runtimeId:string;generation:number;observedAt:number};
export interface StructuredConfirmation{readonly operationId:string;readonly entry:StructuredEntry;readonly item:RequestItem;readonly option:{id:string;label:string};readonly preparedAt:number}
export interface StructuredState{inventory?:PaneInventoryEvidence|null;asyncEntries:readonly NativeReplyEntry[];asyncUnavailableTargets:readonly NativeTarget[];phase:'idle'|'loading'|'ready'|'unavailable';journal:'loading'|'ready'|'unavailable';busy:boolean;refreshing:boolean;skippedWorktrees:number;unsupportedTargets:readonly NativeTarget[];unavailableTargets:readonly NativeTarget[];unavailableWorktrees:readonly string[];entries:readonly StructuredEntry[];receipts:readonly RequestReceipt[]}
export interface StructuredResult{status:RequestOutcome|'storage_unavailable'|'already_submitted'|'busy'}
interface Options{journal:RequestJournal;uuid:()=>string;now?:()=>number;refreshChannel:RefreshActionChannel}
const sameTarget=(a:NativeTarget,b:NativeTarget)=>a.worktreeId===b.worktreeId&&a.tabId===b.tabId&&a.sessionId===b.sessionId&&a.agent===b.agent&&a.title===b.title;
const sameChannel=(a:ActionChannel,b:ActionChannel)=>a.transport===b.transport&&a.hostId===b.hostId&&a.runtimeId===b.runtimeId&&a.generation===b.generation;
const sameEvidence=(a:RequestEvidence,b:RequestEvidence,itemId:string)=>{
 const x=a.items.find(i=>i.itemId===itemId),y=b.items.find(i=>i.itemId===itemId);
 return sameTarget(a.target,b.target)&&a.fence===b.fence&&JSON.stringify(a.marker)===JSON.stringify(b.marker)&&!!x&&!!y&&x.revision===y.revision&&JSON.stringify(x.body)===JSON.stringify(y.body)&&y.supported;
};
const noEffectCodes=new Set(['structured_agent_session_unsupported','agent_session_checkpoint_stale','agent_session_item_revision_stale','agent_session_already_resolved','agent_session_operation_invalid','agent_session_ownership_unknown','execution_owner_reconciling','agent_session_conflict']);
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(v=>freeze(v));Object.freeze(value);}return value;}
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;

/** Native requests are a separate authority boundary. No terminal signal, TUI answer, voice approval or automatic retry. */
export class StructuredActionClient{
 private state:StructuredState=freeze({inventory:null,asyncEntries:[],asyncUnavailableTargets:[],phase:'idle',journal:'loading',busy:false,refreshing:false,skippedWorktrees:0,unsupportedTargets:[],unavailableTargets:[],unavailableWorktrees:[],entries:[],receipts:[]});
 private listeners=new Set<()=>void>();private loading:Promise<void>;private pending?:{confirmation:StructuredConfirmation|NativeReplyConfirmation;transport:RpcTransport};
 private scan=0;private epoch=0;private readonly now:()=>number;private negotiated?:ActionChannel;private readProviders=new Set(['codex']);private publicationChannel?:ActionChannel;private publications=new Map<string,TabsPublication>();
 constructor(private readonly channel:()=>ActionChannel|null,private readonly options:Options){this.now=options.now??Date.now;this.loading=this.loadJournal();}
 getSnapshot():StructuredState{return this.state;}
 subscribe(fn:()=>void):()=>void{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private publish(patch:Partial<StructuredState>):void{this.state=freeze({...this.state,...copy(patch)});for(const fn of this.listeners){try{fn();}catch{/* views do not control effects */}}}
 private async loadJournal():Promise<void>{this.publish({journal:'loading'});try{this.publish({receipts:await this.options.journal.load(),journal:'ready'});}catch{this.publish({journal:'unavailable'});}}
 async reloadJournal():Promise<void>{await this.loading;if(this.state.busy)return;this.loading=this.loadJournal();await this.loading;}
 private stopScan():void{this.scan++;if(this.state.refreshing||this.state.inventory)this.publish({refreshing:false,inventory:null});}
 invalidate():void{this.stopScan();this.epoch++;this.pending=undefined;this.publish({inventory:null,phase:'idle',entries:[],asyncEntries:[],asyncUnavailableTargets:[],unsupportedTargets:[],unavailableTargets:[],unavailableWorktrees:[],skippedWorktrees:0});}
 private live():ActionChannel|null{const c=this.channel(),transportState=(c?.transport as {state?:unknown}|undefined)?.state;return c&&(transportState===undefined||transportState==='ready')&&typeof c.runtimeId==='string'&&c.runtimeId.length>0&&Number.isSafeInteger(c.generation)&&c.generation>=0?{...c}:null;}
 private fresh(c:ActionChannel){return refreshBoundActionChannel(c,()=>this.live(),this.options.refreshChannel);}
 private current(c:ActionChannel):boolean{const next=this.live();return !!next&&sameChannel(c,next);}
 private async negotiate(c:ActionChannel):Promise<void>{
  if(this.negotiated&&sameChannel(this.negotiated,c))return;
  const requested:string[]=[...STRUCTURED_CAPABILITIES,CLAUDE_READ_CAPABILITY];
  await ensureTransportCapabilities(c,STRUCTURED_CAPABILITIES,requested,()=>this.live());
  if(!this.current(c))throw new Error('target_changed');
  this.readProviders=new Set(['codex',...(requested.includes(CLAUDE_READ_CAPABILITY)?['claude']:[])]);this.negotiated=c;
 }
 private async targets(c:ActionChannel,worktreeId:string):Promise<NativeTarget[]>{
  if(!this.publicationChannel||!sameChannel(this.publicationChannel,c)){this.publicationChannel=c;this.publications.clear();}
  const read=parseNativeTargets(await c.transport.request('session.tabs.list',{worktree:'id:'+worktreeId}),worktreeId);
  if(comparePublication(this.publications.get(worktreeId),read.publication)==='stale')throw new Error('stale_tabs');this.publications.set(worktreeId,read.publication);return read.targets;
 }
 private async evidence(c:ActionChannel,target:NativeTarget):Promise<RequestEvidence>{
  const ps=await c.transport.request('worktree.ps',{limit:200});
  const valid=normalizeWorktreePs(ps,{hostId:c.hostId,generation:c.generation,observedAt:this.now()});
  if(!valid.ok||!isRecord(ps)||!Array.isArray(ps.worktrees))throw new Error('execution_scope');
  const matches=ps.worktrees.filter(row=>isRecord(row)&&row.worktreeId===target.worktreeId);
  if(matches.length!==1||!isRecord(matches[0])||matches[0].hostId!=='local'||!this.current(c))throw new Error('execution_scope');
  const e=await readRequestEvidence(c.transport,target);
  // Inventory is last: no persistence wait may intervene between this binding check and a response.
  const targets=await this.targets(c,target.worktreeId);
  if(!targets.some(t=>sameTarget(t,target))||!this.current(c))throw new Error('changed');return e;
 }
 private blocked(hostId:string,sessionId:string):boolean{return this.state.receipts.filter(unresolvedRequest).length>=16||this.state.receipts.some(r=>unresolvedRequest(r)&&r.hostId===hostId&&r.sessionId===sessionId);}
 async refresh():Promise<void>{
  await this.loading;if(this.state.busy||this.pending||this.state.refreshing)return;const c=this.live();if(!c){this.invalidate();return;}
  const epoch=this.epoch,scan=++this.scan;
  const active=()=>{if(this.scan!==scan||this.epoch!==epoch)return false;if(!this.current(c))throw new Error('changed');return !this.state.busy&&!this.pending;};
  this.publish({inventory:null,refreshing:true,phase:this.state.entries.length?'ready':'loading'});
  try{
   await this.negotiate(c);if(!active())return;
   const observedAt=this.now();
   const ps=await c.transport.request('worktree.ps',{limit:200});if(!active())return;
   const parsed=normalizeWorktreePs(ps,{hostId:c.hostId,generation:c.generation,observedAt:this.now()});
   if(!parsed.ok||!isRecord(ps)||!Array.isArray(ps.worktrees))throw new Error('inventory');
   const supportedTargets:NativeTarget[]=[],unsupportedTargets:NativeTarget[]=[],unavailableTargets:NativeTarget[]=[],unavailableWorktrees:string[]=[];let skippedWorktrees=0;const worktrees=new Set<string>();
   for(const row of ps.worktrees){
    if(!isRecord(row)||typeof row.worktreeId!=='string'||worktrees.has(row.worktreeId))throw new Error('inventory');worktrees.add(row.worktreeId);
    if(row.hostId!=='local'){skippedWorktrees++;continue;}
    let targets:NativeTarget[];
    try{targets=await this.targets(c,row.worktreeId);}catch{if(!active()){if(!this.current(c))throw new Error('changed');return;}unavailableWorktrees.push(row.worktreeId);continue;}
    if(!active())return;
    for(const target of targets)(this.readProviders.has(target.agent)?supportedTargets:unsupportedTargets).push(target);
   }
   if(!active())return;
   // Keep last received cards only for identities still present in this complete scan. Each target is replaced as its read completes.
   for(const target of supportedTargets)if(this.state.unavailableTargets.some(old=>sameTarget(old,target)))unavailableTargets.push(target);
   let asyncEntries=this.state.asyncEntries.filter(e=>e.hostId===c.hostId&&e.runtimeId===c.runtimeId&&e.generation===c.generation&&supportedTargets.some(t=>sameTarget(t,e.target)));
   const asyncUnavailableTargets:NativeTarget[]=[];
   let entries=this.state.entries.filter(e=>e.hostId===c.hostId&&e.runtimeId===c.runtimeId&&e.generation===c.generation&&supportedTargets.some(t=>sameTarget(t,e.target)));
   const publish=()=>{if(active())this.publish({phase:'ready',entries,asyncEntries,asyncUnavailableTargets,skippedWorktrees,unsupportedTargets,unavailableTargets,unavailableWorktrees});};
   publish();
   for(const target of supportedTargets){
    const observedAt=this.now();let evidence:RequestEvidence|undefined;let opening:unknown,reply:NativeAsyncEvidence|null=null;
    try{evidence=await readRequestEvidence(c.transport,target,s=>{opening=s;});
     // Discovery follows only explicit assistant tool metadata; no terminal/prose inference.
     const hint=isRecord(opening)&&isRecord(opening.page)&&Array.isArray(opening.page.items)&&opening.page.items.some(row=>isRecord(row)&&isRecord(row.body)&&row.body.kind==='message'&&row.body.role==='assistant'&&Array.isArray(row.body.blocks)&&row.body.blocks.some(b=>isRecord(b)&&b.type==='tool-call'&&b.name==='request_user_input_async'));
     if(hint&&target.agent==='codex'&&evidence.items.length===0){reply=await readNativeAsyncEvidence(c.transport,target,evidence,opening);if(!reply)asyncUnavailableTargets.push(target);}
    }catch{if(!active()){if(!this.current(c))throw new Error('changed');return;}if(!unavailableTargets.some(old=>sameTarget(old,target)))unavailableTargets.push(target);}
    if(!active()){if(!this.current(c))throw new Error('changed');return;}
    const replyIndex=asyncEntries.findIndex(e=>sameTarget(e.target,target));
    if(reply?.questions.length){const next={...reply,hostId:c.hostId,hostVersion:c.hostVersion||'unknown',runtimeId:c.runtimeId,generation:c.generation,observedAt};asyncEntries=replyIndex<0?[...asyncEntries,next]:asyncEntries.map((e,i)=>i===replyIndex?next:e);}
    else asyncEntries=asyncEntries.filter(e=>!sameTarget(e.target,target));
    const index=entries.findIndex(e=>sameTarget(e.target,target));
    if(evidence){const failure=unavailableTargets.findIndex(old=>sameTarget(old,target));if(failure>=0)unavailableTargets.splice(failure,1);const next={...evidence,hostId:c.hostId,hostVersion:c.hostVersion||'unknown',runtimeId:c.runtimeId,generation:c.generation,observedAt};entries=index<0?[...entries,next]:entries.map((entry,i)=>i===index?next:entry);}
    else entries=entries.filter(e=>!sameTarget(e.target,target));
    publish();
   }
   const age=this.now()-observedAt;
   if(active()&&parsed.inventory.complete&&age>=0&&age<=READ_FRESH_MS&&skippedWorktrees===0&&unsupportedTargets.length===0&&unavailableTargets.length===0&&unavailableWorktrees.length===0&&asyncUnavailableTargets.length===0){
    this.publish({inventory:{...parsed.inventory,observedAt,worktreeIds:[...worktrees]}});
   }
  }catch{if(this.scan===scan&&this.epoch===epoch)this.publish({inventory:null,phase:'unavailable',entries:[],asyncEntries:[],asyncUnavailableTargets:[],unsupportedTargets:[],unavailableTargets:[],unavailableWorktrees:[]});}
  finally{if(this.scan===scan)this.publish({refreshing:false});}
 }
 async prepare(entry:StructuredEntry,itemId:string,optionId:string):Promise<{ok:true;confirmation:StructuredConfirmation}|{ok:false;reason:string}>{
  await this.loading;if(this.state.busy||this.pending)return{ok:false,reason:'busy'};if(this.state.journal!=='ready')return{ok:false,reason:'storage_unavailable'};
  const c=this.live(),item=entry.items.find(i=>i.itemId===itemId),option=item?.body.options.find(o=>o.id===optionId);
  if(!c||c.hostId!==entry.hostId||c.runtimeId!==entry.runtimeId||c.generation!==entry.generation||!item?.supported||!option)return{ok:false,reason:'changed'};
  if(this.blocked(c.hostId,entry.target.sessionId))return{ok:false,reason:'reconciliation_required'};
  this.stopScan();const epoch=this.epoch;this.publish({busy:true});try{
   if(!await this.fresh(c))return{ok:false,reason:'changed'};
   const fresh=await this.evidence(c,entry.target);if(this.epoch!==epoch||!sameEvidence(entry,fresh,itemId)||this.state.journal!=='ready'||this.blocked(c.hostId,entry.target.sessionId))return{ok:false,reason:'changed'};
   const operationId=structuredOperationId(this.options.uuid,this.now());if(this.state.receipts.some(r=>r.operationId===operationId))return{ok:false,reason:'identity_unavailable'};
   const confirmation=freeze(copy({operationId,entry,item,option,preparedAt:this.now()}));this.pending={confirmation,transport:c.transport};return{ok:true,confirmation};
  }catch{return{ok:false,reason:'changed'};}finally{this.publish({busy:false});}
 }
 cancel(c:StructuredConfirmation|NativeReplyConfirmation):void{if(this.pending?.confirmation===c)this.pending=undefined;}
 private async replyEvidence(c:ActionChannel,target:NativeTarget):Promise<NativeAsyncEvidence>{
  const ps=await c.transport.request('worktree.ps',{limit:200});
  const parsed=normalizeWorktreePs(ps,{hostId:c.hostId,generation:c.generation,observedAt:this.now()});
  if(!parsed.ok||!isRecord(ps)||!Array.isArray(ps.worktrees))throw new Error('execution_scope');
  const matches=ps.worktrees.filter(row=>isRecord(row)&&row.worktreeId===target.worktreeId);
  if(matches.length!==1||!isRecord(matches[0])||matches[0].hostId!=='local'||!this.current(c))throw new Error('execution_scope');
  let opening:unknown;
  const requests=await readRequestEvidence(c.transport,target,s=>{opening=s;});
  const evidence=await readNativeAsyncEvidence(c.transport,target,requests,opening);
  if(!evidence||!evidence.questions.length)throw new Error('changed');
  // Final published identity read follows history and all storage waits.
  const targets=await this.targets(c,target.worktreeId);
  if(!targets.some(t=>sameTarget(t,target))||!this.current(c))throw new Error('changed');
  return evidence;
 }
 private sameReply(a:NativeAsyncEvidence,b:NativeAsyncEvidence):boolean{
  return sameTarget(a.target,b.target)&&a.fence===b.fence&&JSON.stringify(a.marker)===JSON.stringify(b.marker)&&a.context===b.context&&JSON.stringify(a.questions)===JSON.stringify(b.questions);
 }
 async prepareReply(entry:NativeReplyEntry,answers:readonly NativeAsyncAnswer[]):Promise<{ok:true;confirmation:NativeReplyConfirmation}|{ok:false;reason:string}>{
  await this.loading;
  if(this.state.busy||this.pending)return{ok:false,reason:'busy'};
  if(this.state.journal!=='ready')return{ok:false,reason:'storage_unavailable'};
  const c=this.live();
  if(!entry||!c||c.hostId!==entry.hostId||c.runtimeId!==entry.runtimeId||c.generation!==entry.generation)return{ok:false,reason:'changed'};
  if(this.blocked(c.hostId,entry.target.sessionId))return{ok:false,reason:'reconciliation_required'};
  let text:string;try{text=formatNativeAsyncReply(entry.questions,answers);}catch{return{ok:false,reason:'invalid_answer'};}
  this.stopScan();const epoch=this.epoch;this.publish({busy:true});
  try{
   if(!await this.fresh(c))return{ok:false,reason:'changed'};
   const fresh=await this.replyEvidence(c,entry.target);
   if(this.epoch!==epoch||!this.sameReply(entry,fresh)||this.state.journal!=='ready'||this.blocked(c.hostId,entry.target.sessionId))return{ok:false,reason:'changed'};
   const operationId=structuredOperationId(this.options.uuid,this.now());
   if(this.state.receipts.some(r=>r.operationId===operationId))return{ok:false,reason:'identity_unavailable'};
   const confirmation:NativeReplyConfirmation=freeze(copy({kind:'async_reply',operationId,entry,text,preparedAt:this.now()}));
   this.pending={confirmation,transport:c.transport};return{ok:true,confirmation};
  }catch{return{ok:false,reason:'changed'};}finally{this.publish({busy:false});}
 }
 async confirmReply(confirmation:NativeReplyConfirmation):Promise<StructuredResult>{
  if(this.state.busy)return{status:'busy'};
  const pending=this.pending;
  if(!pending||pending.confirmation!==confirmation||!('kind' in pending.confirmation))return{status:'already_submitted'};
  this.pending=undefined;const epoch=this.epoch;this.publish({busy:true});
  const e=confirmation.entry,q=e.questions[0];let reserved=false,dispatched=false;
  let receipt:RequestReceipt={operationId:confirmation.operationId,hostId:e.hostId,hostVersion:e.hostVersion,worktreeId:e.target.worktreeId,tabId:e.target.tabId,sessionId:e.target.sessionId,itemId:q.itemId,revision:q.revision,fence:e.fence,kind:'async_reply',at:this.now(),status:'unknown',acknowledged:false};
  const finish=async(status:StructuredResult['status']):Promise<StructuredResult>=>{
   if(reserved){
    if(['accepted','refused','changed'].includes(status))receipt={...receipt,status:status as RequestOutcome};
    try{await this.options.journal.update(receipt);}catch{this.publish({journal:'unavailable'});}
    const others=this.state.receipts.filter(r=>r.operationId!==receipt.operationId);
    this.publish({receipts:[...others.filter(unresolvedRequest),...others.filter(r=>!unresolvedRequest(r)).slice(-31),receipt]});
   }
   this.publish({busy:false,asyncEntries:dispatched?this.state.asyncEntries.filter(entry=>entry.hostId!==e.hostId||entry.generation!==e.generation||!sameTarget(entry.target,e.target)):this.state.asyncEntries});
   return{status};
  };
  const bound=(c:ActionChannel|null)=>!!c&&c.hostId===e.hostId&&c.runtimeId===e.runtimeId&&c.generation===e.generation&&c.transport===pending.transport;
  try{
   if(this.state.journal!=='ready')return await finish('storage_unavailable');
   let c=this.live();
   if(!c||!bound(c)||this.blocked(e.hostId,e.target.sessionId))return await finish('changed');
   await this.options.journal.reserve(receipt);reserved=true;
   c=this.live();if(!c||!bound(c))return await finish('changed');
   if(!await this.fresh(c))return await finish('changed');
   const fresh=await this.replyEvidence(c,e.target);
   if(this.epoch!==epoch||!this.sameReply(e,fresh)||!this.current(c))return await finish('changed');
   const body={kind:'message',role:'user',blocks:[{type:'text',text:confirmation.text}]};
   const fingerprint=structuredFingerprint('agentSession.send',e.target.sessionId,{body});
   const envelope={sessionId:e.target.sessionId,clientOperationId:receipt.operationId,expectedRuntimeFence:fresh.fence,payloadFingerprint:fingerprint};
   // No storage or additional asynchronous work after the final published binding/channel read.
   dispatched=true;let reply:unknown;
   try{reply=await c.transport.request('agentSession.send',{envelope,body});}
   catch(error){const code=isRecord(error)?error.rpcCode:undefined;return await finish(isMethodNotFound(error)||typeof code==='string'&&noEffectCodes.has(code)?'refused':'unknown');}
   if(isRecord(reply)&&reply.ok===false&&isRecord(reply.refusal)&&typeof reply.refusal.code==='string'&&noEffectCodes.has(reply.refusal.code))return await finish('refused');
   return await finish(readAsyncSendOutcome(reply,receipt.operationId,fingerprint));
  }catch{
   if(!reserved){this.publish({journal:'unavailable'});return await finish('storage_unavailable');}
   return await finish('changed');
  }
 }
 async confirm(confirmation:StructuredConfirmation):Promise<StructuredResult>{
  if(this.state.busy)return{status:'busy'};const pending=this.pending;if(!pending||pending.confirmation!==confirmation||'kind' in pending.confirmation)return{status:'already_submitted'};this.pending=undefined;const epoch=this.epoch;this.publish({busy:true});
  const e=confirmation.entry;let reserved=false,dispatched=false;let r:RequestReceipt={operationId:confirmation.operationId,hostId:e.hostId,hostVersion:e.hostVersion,worktreeId:e.target.worktreeId,tabId:e.target.tabId,sessionId:e.target.sessionId,itemId:confirmation.item.itemId,revision:confirmation.item.revision,fence:e.fence,kind:'approval',at:this.now(),status:'unknown',acknowledged:false};
  const finish=async(status:StructuredResult['status']):Promise<StructuredResult>=>{
   if(reserved){if(['accepted','refused','changed'].includes(status))r={...r,status:status as RequestOutcome};
    try{await this.options.journal.update(r);}catch{this.publish({journal:'unavailable'});}
    const others=this.state.receipts.filter(x=>x.operationId!==r.operationId);this.publish({receipts:[...others.filter(unresolvedRequest),...others.filter(x=>!unresolvedRequest(x)).slice(-31),r]});
   }
   this.publish({busy:false,entries:dispatched?this.state.entries.map(entry=>entry.hostId===r.hostId&&entry.runtimeId===e.runtimeId&&entry.generation===e.generation&&sameTarget(entry.target,e.target)?{...entry,items:entry.items.filter(item=>item.itemId!==r.itemId)}:entry):this.state.entries});return{status};
  };
  try{
   if(this.state.journal!=='ready')return await finish('storage_unavailable');
   let c=this.live();
   if(!c||c.hostId!==e.hostId||c.runtimeId!==e.runtimeId||c.generation!==e.generation||c.transport!==pending.transport||this.blocked(e.hostId,e.target.sessionId))return await finish('changed');
   await this.options.journal.reserve(r);reserved=true;
   c=this.live();if(!c||c.transport!==pending.transport||c.hostId!==e.hostId||c.runtimeId!==e.runtimeId||c.generation!==e.generation)return await finish('changed');
   if(!await this.fresh(c))return await finish('changed');
   const fresh=await this.evidence(c,e.target);if(this.epoch!==epoch||!sameEvidence(e,fresh,confirmation.item.itemId)||!this.current(c))return await finish('changed');
   const fields={itemId:r.itemId,expectedRevision:r.revision,optionId:confirmation.option.id};
   const envelope={sessionId:r.sessionId,clientOperationId:r.operationId,expectedRuntimeFence:fresh.fence,payloadFingerprint:structuredFingerprint('agentSession.respondTo:approval',r.sessionId,fields)};
   // No await after the last inventory/channel checks except the original mutation itself.
   let reply:unknown;dispatched=true;try{reply=await c.transport.request('agentSession.respondToApproval',{envelope,...fields});}catch(error){const code=isRecord(error)?error.rpcCode:undefined;return await finish(isMethodNotFound(error)||typeof code==='string'&&noEffectCodes.has(code)?'refused':'unknown');}
   if(isRecord(reply)&&reply.ok===true&&isRecord(reply.value)&&reply.value.itemId===r.itemId&&typeof reply.value.revision==='number'&&Number.isSafeInteger(reply.value.revision)&&reply.value.revision>=r.revision&&isRecord(reply.value.resolution)&&reply.value.resolution.state==='resolved'&&reply.value.resolution.selectedOptionId===confirmation.option.id)return await finish('accepted');
   if(isRecord(reply)&&reply.ok===false&&isRecord(reply.refusal)&&typeof reply.refusal.code==='string'&&noEffectCodes.has(reply.refusal.code))return await finish('refused');
   return await finish('unknown');
  }catch{
   // No request was issued here: only reserve or read failures reach this catch. The RPC has its own uncertainty boundary.
   if(!reserved){this.publish({journal:'unavailable'});return await finish('storage_unavailable');}return await finish('changed');
  }
 }
 /** Read-only owner evidence. It cannot resolve a prompt or change a durable receipt. */
 async inspectHistory(receipt:RequestReceipt):Promise<{title:string;items:unknown[];hasOlder:boolean;hasNewer:boolean}|null>{
  await this.loading;if(this.state.busy)return null;const c=this.live();
  if(!c||c.hostId!==receipt.hostId||!this.state.receipts.some(r=>r.operationId===receipt.operationId&&r.sessionId===receipt.sessionId&&r.tabId===receipt.tabId&&r.worktreeId===receipt.worktreeId))return null;
  this.stopScan();this.publish({busy:true});try{
   await this.negotiate(c);const targets=await this.targets(c,receipt.worktreeId);const target=targets.find(t=>t.sessionId===receipt.sessionId&&t.tabId===receipt.tabId);if(!target||!this.readProviders.has(target.agent))return null;
   const result=await c.transport.request('agentSession.history',{sessionId:receipt.sessionId,direction:'tail',limit:40});
   if(!isRecord(result)||result.ok!==true||!isRecord(result.page)||result.page.sessionId!==receipt.sessionId||!Array.isArray(result.page.items)||result.page.items.length>40||typeof result.page.hasOlder!=='boolean'||typeof result.page.hasNewer!=='boolean'||!this.current(c))return null;
   return freeze(copy({title:target.title,items:result.page.items,hasOlder:result.page.hasOlder,hasNewer:result.page.hasNewer}));
  }catch{return null;}finally{this.publish({busy:false});}
 }
 async acknowledge(operationId:string):Promise<boolean>{
  await this.loading;if(this.state.busy||this.state.journal!=='ready')return false;const r=this.state.receipts.find(r=>r.operationId===operationId&&unresolvedRequest(r));if(!r)return false;
  this.stopScan();this.publish({busy:true});try{const next={...r,acknowledged:true};await this.options.journal.update(next);this.publish({receipts:this.state.receipts.map(x=>x.operationId===operationId?next:x)});return true;}
  catch{this.publish({journal:'unavailable'});return false;}finally{this.publish({busy:false});}
 }
}
