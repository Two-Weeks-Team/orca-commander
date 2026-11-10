import {ensureTransportCapabilities,CapabilityNegotiationError,refreshBoundActionChannel,type RefreshActionChannel} from './transport-capabilities';
import {claudeScreenLines,parseClaudePrompt,claudePromptKeys,sameClaudePrompt,sameClaudePromptContent,claudeInputVisible,isClaudeTerminalWaiting,type ClaudeTerminalPrompt} from '../core/claude-terminal-prompt';
import { wrapTerminalBracketedPasteText } from '../upstream/orca-1.4.245/src/shared/terminal-bracketed-paste-text';
import type { AgentSnapshot } from '../core/types';
import type { ActionJournal } from './action-journal';
import {isMethodNotFound,type RpcTransport,type TerminalInputLease } from './read-only-orca-client';

/** Current authenticated connection; writes must obtain a new read through refreshChannel. */
export interface ActionChannel { runtimeId:string; hostVersion?:string; hostId:string; generation:number; confirmedAt:number; agents:AgentSnapshot[]; transport:RpcTransport }
export interface PromptConfirmation { readonly id:string; readonly text:string; readonly title:string; readonly worktreeId:string; readonly paneKey:string; readonly hostId:string; readonly hostVersion:string; readonly runtimeId:string; readonly generation:number; readonly handle:string; readonly incarnationId:string; readonly preparedAt:number }
export type ActionStatus='accepted'|'partial'|'unknown'|'cursor_required'|'target_changed'|'not_connected'|'expired'|'already_submitted'|'refused'|'unavailable'|'storage_unavailable'|'busy';
export interface ActionResult { status:ActionStatus;bodyAccepted:boolean;submitAttempted:boolean|null }
export type ActionJournalPhase='loading'|'ready'|'unavailable';
export type ActionProgress='checking'|'sending'|'observing';
export interface ActionClientState { progress?:ActionProgress; busy:boolean;operation:'send'|'reconcile'|null;journal:ActionJournalPhase;receipts:readonly ActionReceipt[] }
export interface ActionClientOptions { journal:ActionJournal;newId:()=>string;refreshChannel:RefreshActionChannel }
export interface ActionReceipt extends ActionResult { acknowledged:boolean;hostId:string;hostVersion:string;handle:string;incarnationId:string;id:string;at:number;worktreeId:string;paneKey:string }
export type PrepareResult={ok:true;confirmation:PromptConfirmation}|{ok:false;reason:string};
export interface ClaudePromptReview {readonly id:string;readonly title:string;readonly location:string;readonly toolName?:string;readonly worktreeId:string;readonly paneKey:string;readonly hostId:string;readonly hostVersion:string;readonly runtimeId:string; readonly generation:number;readonly handle:string;readonly incarnationId:string;readonly preparedAt:number;readonly responseMode:'digit'|'cursor';readonly prompt:ClaudeTerminalPrompt}
export type ClaudePromptPreparation={ok:true;review:ClaudePromptReview}|{ok:false;reason:string};
export type ClaudePromptResponse={status:ActionStatus|'changed';review?:ClaudePromptReview;nextPrompt?:boolean;cursorMoved?:boolean};
type TerminalResolution={handle:string;incarnationId:string}|{unowned:true};
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const sameTarget=(a:AgentSnapshot,b:AgentSnapshot)=>a.id===b.id&&a.target.hostId===b.target.hostId&&a.target.connectionGeneration===b.target.connectionGeneration&&a.target.worktreeId===b.target.worktreeId&&a.target.terminalId===b.target.terminalId&&a.target.dispatchId===b.target.dispatchId;
const blocked=(a:AgentSnapshot)=>a.state==='unknown'||a.state==='permission'||a.state==='question'||a.eventType==='permission_request'||a.eventType==='user_question'||Boolean(a.requestId)||a.permissionEvidence==='structured_verified';
const unresolved=(r:ActionReceipt)=>!r.acknowledged&&(r.status==='partial'||r.status==='unknown');

// Conservative upper bound from pinned shared/agent-prompt-injection.ts and tui-agent-config.ts:
// Windows is the slowest transport (64B/ms);45ms/line covers every configured TUI. The12 bytes
// account for the original bracketed-paste framing applied below.
function submitDelayMs(text:string):number{
 let bytes=12;for(const char of text){const cp=char.codePointAt(0)!;bytes+=cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4;}
 return 500+Math.ceil(bytes/64)+text.split(/\r\n|\r|\n/).length*45;
}

function writeOutcome(reply:unknown):'accepted'|'refused'|'unknown'{
 if(!record(reply)||!record(reply.send))return'unknown';
 const send=reply.send;const settlement=send.writeSettlement;
 if(typeof send.bytesWritten==='number'&&send.bytesWritten>0&&send.accepted!==true)return'unknown';
 if(settlement!==undefined){
  if(!record(settlement)||settlement.bytesHandedToTransport===true||settlement.outcome==='unverifiable')return'unknown';
  if(settlement.outcome==='accepted')return send.accepted===true?'accepted':'unknown';
  if(settlement.outcome==='refused')return send.accepted===false&&typeof settlement.reason==='string'?'refused':'unknown';
  return'unknown';
 }
 // Every current raw send requesting settlement carries proof; legacy accepted alone is uncertain.
 return send.accepted===false?'refused':'unknown';
}

export class DeckActionClient {
 private readonly claudePending=new Map<string,{review:ClaudePromptReview;agent:AgentSnapshot;transport:RpcTransport}>();
 private readonly pending=new Map<string,{confirmation:PromptConfirmation;agent:AgentSnapshot;transport:RpcTransport}>();
 private audit:ActionReceipt[]=[];
 private writing=false;
 private progress:ActionProgress='checking';
 private reconciling=false;
 private journalPhase:ActionJournalPhase='loading';
 private initialized:Promise<void>=Promise.resolve();
 private snapshot:ActionClientState=Object.freeze({busy:false,operation:null,journal:'loading',receipts:Object.freeze([])});
 private listeners=new Set<()=>void>();
 getSnapshot():ActionClientState{return this.snapshot;}
 subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private publish():void{
  this.snapshot=Object.freeze({busy:this.writing||this.reconciling,progress:this.writing?this.progress:undefined,operation:this.writing?'send':this.reconciling?'reconcile':null,journal:this.journalPhase,receipts:Object.freeze(this.audit.map(r=>Object.freeze({...r})))});
  for(const listener of this.listeners){try{listener();}catch{/* an observer never controls a write */}}
 }
 async acknowledge(id:string):Promise<boolean>{
  await this.initialized;
  if(this.writing||this.reconciling||this.journalPhase!=='ready'||!this.options)return false;
  const found=this.audit.find(r=>r.id===id&&!r.acknowledged&&(r.status==='partial'||r.status==='unknown'));
  if(!found)return false;
  this.reconciling=true;this.publish();
  try{
   await this.options.journal.update({...found,acknowledged:true});
   this.audit=this.audit.map(r=>r.id===id?{...r,acknowledged:true}:r);return true;
  }catch{this.journalPhase='unavailable';return false;}
  finally{this.reconciling=false;this.publish();}
 }
 private async loadJournal():Promise<void>{
  this.journalPhase='loading';this.publish();
  try{if(!this.options)throw new Error('journal_required');this.audit=await this.options.journal.load();this.journalPhase='ready';}
  catch{this.journalPhase='unavailable';}
  this.publish();
 }
 async reloadJournal():Promise<void>{
  if(this.writing||this.reconciling||this.journalPhase==='loading')return;
  this.initialized=this.loadJournal();await this.initialized;
 }
 private unreconciled(c:ActionChannel,agent:AgentSnapshot):boolean{
  const pending=this.audit.filter(unresolved);
  return pending.length>=50||pending.some(r=>r.hostId===c.hostId&&r.worktreeId===agent.target.worktreeId&&r.paneKey===agent.target.terminalId);
 }
 constructor(private readonly channel:()=>ActionChannel|null,private readonly now=Date.now,private readonly delay:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>{setTimeout(resolve,ms);}),private readonly options?:ActionClientOptions){this.initialized=this.loadJournal();}
 private live():ActionChannel|null {
  const c=this.channel(),state=(c?.transport as {state?:unknown}|undefined)?.state;
  return c&&(state===undefined||state==='ready')&&typeof c.runtimeId==='string'&&c.runtimeId.length>0&&Number.isSafeInteger(c.generation)&&c.generation>=0?{...c}:null;
 }
 private setProgress(progress:ActionProgress){if(this.writing&&this.progress!==progress){this.progress=progress;this.publish();}}
 private fresh(c:ActionChannel){if(this.progress!=='observing')this.setProgress('checking');return refreshBoundActionChannel(c,()=>this.live(),this.options?.refreshChannel);}
 /** This capability explicitly contracts terminal.send prompt receipts, not an atomic incarnation CAS. */
 private terminalContract(c:ActionChannel):Promise<void>{return ensureTransportCapabilities(c,['terminal.prompt-delivery.v1'],[],()=>this.live());}
 private current(c:ActionChannel,agent:AgentSnapshot):boolean {
  const rows=c.agents.filter(a=>sameTarget(a,agent));
  return agent.target.hostId===c.hostId&&agent.target.connectionGeneration===c.generation&&!!agent.target.worktreeId&&!!agent.target.terminalId&&rows.length===1&&!blocked(rows[0])&&rows[0].provider===agent.provider&&rows[0].state===agent.state&&rows[0].stateSince===agent.stateSince;
 }
 private async terminal(c:ActionChannel,agent:AgentSnapshot,handle?:string,strict=false):Promise<TerminalResolution|null>{
  const reply=await c.transport.request('terminal.list',{worktree:`id:${agent.target.worktreeId}`,requireFreshPtyLiveness:true,includeVisualLayouts:false,...(strict?{includePreview:false}:{}),...(handle?{handles:[handle]}:{})});
  if(!record(reply)||reply.truncated!==false||!Array.isArray(reply.terminals))return null;
  if(strict&&reply.terminals.filter((r:unknown)=>record(r)&&r.worktreeId===agent.target.worktreeId&&`${r.tabId}:${r.leafId}`===agent.target.terminalId).length!==1)return null;
  const matches=reply.terminals.filter((r:unknown)=>record(r)&&r.orphaned!==true&&r.worktreeId===agent.target.worktreeId&&`${r.tabId}:${r.leafId}`===agent.target.terminalId&&r.connected===true&&r.writable===true&&(r.verdict==='live'||(r.verdict===undefined&&r.executionHostId==='local'))&&typeof r.handle==='string'&&r.handle.length>0&&typeof r.incarnationId==='string'&&r.incarnationId.length>0);
  if(matches.length!==1){
   // A historical claim can explain refusal, never supply a writable target.
   const unowned=matches.length===0&&reply.terminals.some((r:unknown)=>record(r)&&r.worktreeId===agent.target.worktreeId&&r.orphaned===true&&(r.recordedPaneKey===agent.target.terminalId||`${r.tabId}:${r.leafId}`===agent.target.terminalId));
   return unowned?{unowned:true}:null;
  }
  const row=matches[0] as Record<string,unknown>;
  if(strict&&row.orphaned!==false)return null;
  return{handle:row.handle as string,incarnationId:row.incarnationId as string};
 }
 private claudeCurrent(c:ActionChannel,agent:AgentSnapshot):boolean{
  const rows=c.agents.filter(a=>sameTarget(a,agent));
  return isClaudeTerminalWaiting(agent)&&agent.target.hostId===c.hostId&&agent.target.connectionGeneration===c.generation&&rows.length===1&&isClaudeTerminalWaiting(rows[0])&&rows[0].terminalPrompt.kind===agent.terminalPrompt.kind&&rows[0].stateSince===agent.stateSince&&rows[0].terminalActivity?.present!==false;
 }
 canAnswerClaude(agent:AgentSnapshot):boolean{const c=this.live();return !!c&&this.journalPhase==='ready'&&!!this.options&&!this.writing&&!this.reconciling&&!!c.transport.acquireTerminalInput&&this.claudeCurrent(c,agent)&&!this.unreconciled(c,agent);}
 private makeClaudeReview(c:ActionChannel,agent:AgentSnapshot,terminal:{handle:string;incarnationId:string},prompt:ClaudeTerminalPrompt,responseMode:'digit'|'cursor'='digit'):ClaudePromptReview|null{
  let id:string;try{id=`claude_${this.options!.newId()}`;}catch{return null;}
  if(id.length>80||this.audit.some(r=>r.id===id)||this.claudePending.has(id))return null;
  const immutable=Object.freeze({...prompt,options:Object.freeze(prompt.options.map(option=>Object.freeze({...option})))});
  const review=Object.freeze({id,title:agent.title,location:[agent.place?.repo,agent.place?.worktreeName].filter(Boolean).join(' › '),...(agent.terminalPrompt?.toolName?{toolName:agent.terminalPrompt.toolName}:{}),worktreeId:agent.target.worktreeId,paneKey:agent.target.terminalId!,hostId:c.hostId,hostVersion:c.hostVersion||'unknown',runtimeId:c.runtimeId,generation:c.generation,...terminal,preparedAt:this.now(),responseMode,prompt:immutable});
  this.claudePending.clear();this.claudePending.set(id,{review,agent:{...agent,target:{...agent.target},terminalPrompt:agent.terminalPrompt?{...agent.terminalPrompt}:undefined},transport:c.transport});return review;
 }
 /** Explicit UI opening only. No polling, subscription, cache, disk or diagnostic screen text. */
 async prepareClaudePrompt(agent:AgentSnapshot):Promise<ClaudePromptPreparation>{
  await this.initialized;if(!this.canAnswerClaude(agent))return{ok:false,reason:'unavailable'};
  const original=this.live()!;
  try{
   const c=await this.fresh(original);if(!c||!this.claudeCurrent(c,agent))return{ok:false,reason:'target_changed'};
   await this.terminalContract(c);
   const terminal=await this.terminal(c,agent,undefined,true);if(!terminal||'unowned'in terminal)return{ok:false,reason:'target_changed'};
   const raw=await c.transport.request('terminal.read',{terminal:terminal.handle,screen:true});const latest=this.live();
   if(!latest||latest.transport!==c.transport||latest.runtimeId!==c.runtimeId||latest.generation!==c.generation||!this.canAnswerClaude(agent))return{ok:false,reason:'target_changed'};
   const parsed=parseClaudePrompt(raw,terminal.handle,agent.terminalPrompt!.kind);if(!parsed.ok)return parsed;
   const review=this.makeClaudeReview(c,agent,terminal,parsed.prompt);return review?{ok:true,review}:{ok:false,reason:'unavailable'};
  }catch{return{ok:false,reason:'unavailable'};}
 }
 dismissClaudePrompt(review:ClaudePromptReview):void{if(this.claudePending.get(review.id)?.review===review)this.claudePending.delete(review.id);}
 /** One consumed ticket, one raw response, one post-read. Unknown outcomes retain the existing durable pane fence. */
 async respondClaudePrompt(review:ClaudePromptReview,choice:number|'escape',text:string|undefined,isPresented:()=>boolean):Promise<ClaudePromptResponse>{
  const owned=this.claudePending.get(review.id);
  if(this.writing||this.reconciling)return{status:'busy'};
  if(!owned||owned.review!==review)return{status:'already_submitted'};
  this.claudePending.delete(review.id);this.progress='checking';this.writing=true;this.publish();
  const presented=()=>{try{return isPresented();}catch{return false;}};
  let reserved=false,attempted=false,definitiveRefusal=false,accepted=false,submitted=false,nextPrompt=false,cursorMoved=false,replacement:ClaudePromptReview|undefined,lease:TerminalInputLease|undefined;
  const receipt=(status:ActionStatus):ActionReceipt=>({id:review.id,status,bodyAccepted:accepted,submitAttempted:submitted,acknowledged:false,hostId:review.hostId,hostVersion:review.hostVersion,handle:review.handle,incarnationId:review.incarnationId,at:this.now(),worktreeId:review.worktreeId,paneKey:review.paneKey});
  const current=(waiting=true)=>{const c=this.live();return c&&c.transport===owned.transport&&c.hostId===review.hostId&&c.runtimeId===review.runtimeId&&c.generation===review.generation&&(waiting?this.claudeCurrent(c,owned.agent):c.agents.filter(a=>sameTarget(a,owned.agent)&&a.provider==='claude'&&a.terminalActivity?.present!==false).length===1)&&presented()?c:null;};
  const execute=async():Promise<ActionStatus>=>{
   let c=current();if(!c||!await this.fresh(c))return'target_changed';c=current();if(!c)return'target_changed';
   if(this.journalPhase!=='ready'||!this.options)return'storage_unavailable';
   const plan=choice==='escape'?null:claudePromptKeys(review.prompt,choice,text,review.responseMode);if((choice!=='escape'&&!plan)||!review.prompt.canSend)return'refused';
   if(this.unreconciled(c,owned.agent)||!c.transport.acquireTerminalInput)return'unavailable';
   try{await this.terminalContract(c);}catch(error){return error instanceof CapabilityNegotiationError&&error.reason==='target_changed'?'target_changed':'unavailable';}
   lease=await c.transport.acquireTerminalInput(review.handle);if(!lease.isActive()||!current())return'target_changed';
   try{await this.options.journal.reserve(receipt('unknown'));reserved=true;}catch{this.journalPhase='unavailable';return'storage_unavailable';}
   c=current();if(!c||!await this.fresh(c))return'target_changed';c=current();if(!c||!lease.isActive())return'target_changed';
   const target=await this.terminal(c,owned.agent,undefined,true);
   if(!target||'unowned'in target||target.handle!==review.handle||target.incarnationId!==review.incarnationId||!current())return'target_changed';
   const raw=await c.transport.request('terminal.read',{terminal:review.handle,screen:true});
   c=current();if(!c||!lease.isActive())return'target_changed';
   const parsed=parseClaudePrompt(raw,review.handle,review.prompt.kind);
   if(!parsed.ok||!sameClaudePrompt(parsed.prompt,review.prompt)){
    if(parsed.ok)replacement=this.makeClaudeReview(c,owned.agent,target,parsed.prompt)??undefined;
    return'target_changed';
   }
   const send=async(payload:Record<string,unknown>,submit=false)=>{
    const live=current();if(!live||!lease!.isActive())return false;
    this.setProgress('sending');attempted=true;cursorMoved ||= typeof payload.text==='string'&&/^\u001b\[[AB]$/.test(payload.text);
    let reply:unknown;try{reply=await live.transport.request('terminal.send',{terminal:review.handle,expectedIncarnationId:review.incarnationId,requireWriteSettlement:true,...payload});}catch(error){definitiveRefusal=!accepted&&isMethodNotFound(error);throw error;}
    const result=writeOutcome(reply);
    if(result!=='accepted')return false;accepted=true;if(submit)submitted=true;return true;
   };
   const read=async(waiting=true)=>{
    const opening=current(waiting);if(!opening||!lease!.isActive()||!await this.fresh(opening))return null;
    const live=current(waiting);if(!live||!lease!.isActive())return null;
    const row=await this.terminal(live,owned.agent,undefined,true);
    if(!row||'unowned'in row||row.handle!==review.handle||row.incarnationId!==review.incarnationId||!current(waiting))return null;
    const frame=await live.transport.request('terminal.read',{terminal:review.handle,screen:true});return current(waiting)&&lease!.isActive()?frame:null;
   };
   const settlement=(after:unknown,before:ClaudeTerminalPrompt):ActionStatus=>{
    const lines=claudeScreenLines(after,review.handle);if(!lines)return'unknown';
    for(const kind of ['permission','question'] as const){const menu=parseClaudePrompt(after,review.handle,kind);if(menu.ok){if(sameClaudePromptContent(before,menu.prompt))return'unknown';nextPrompt=true;return'accepted';}}
    return lines.some(line=>/^\s*❯\s*\d+\./.test(line)||/Make the terminal taller/i.test(line))?'unknown':'accepted';
   };
   if(choice==='escape')return await send({text:'\u001b'},true)?settlement(await read(false),review.prompt):'unknown';
   if(plan!.kind==='digit'){
    if(!await send({text:plan!.text},true))return'unknown';
    this.setProgress('observing');
    // Accepted input and a stale renderer frame can overlap. Observe state, not
    // elapsed time. Only a second independent bound read may offer a new hold.
    for(let observation=0;observation<2;observation++){
     const after=await read(false),live=current(false);if(after===null||!live)return'unknown';
     if(!this.claudeCurrent(live,owned.agent)){settlement(after,review.prompt);return'accepted';}
     const same=parseClaudePrompt(after,review.handle,review.prompt.kind);
     if(!same.ok||!sameClaudePrompt(same.prompt,review.prompt))return settlement(after,review.prompt);
     if(observation===0)continue;
     submitted=false;replacement=this.makeClaudeReview(live,owned.agent,target,same.prompt,'cursor')??undefined;
     return replacement?'cursor_required':'unknown';
    }
    return'unknown';
   }
   const cursor=plan! as Extract<NonNullable<typeof plan>,{kind:'cursor'}>;let shown=review.prompt;
   for(let step=0;step<cursor.steps;step++){
    if(!await send({text:cursor.direction<0?'\u001b[A':'\u001b[B'}))return'unknown';
    const moved=parseClaudePrompt(await read(),review.handle,review.prompt.kind);
    if(!moved.ok||!sameClaudePromptContent(review.prompt,moved.prompt)||moved.prompt.currentIndex!==review.prompt.currentIndex+cursor.direction*(step+1))return'unknown';shown=moved.prompt;
   }
   if(shown.currentIndex!==choice)return'unknown';
   if(cursor.paste!==undefined){
    if(!await send({text:cursor.paste}))return'unknown';const pasted=parseClaudePrompt(await read(),review.handle,review.prompt.kind);
    if(!pasted.ok||!claudeInputVisible(review.prompt,pasted.prompt,Number(choice),text!))return'unknown';shown=pasted.prompt;
   }
   if(!await send({enter:true},true))return'unknown';return settlement(await read(false),shown);
  };
  let status:ActionStatus;
  try{status=await execute();}catch{status=definitiveRefusal?'refused':attempted?'unknown':'target_changed';}
  finally{try{await lease?.release();}catch{try{owned.transport.close?.();}catch{/* retain uncertainty */}}}
  const value=receipt(status);
  try{if(reserved)await this.options!.journal.update(value);}catch{this.journalPhase='unavailable';}
  this.audit=[...this.audit.filter(unresolved),...this.audit.filter(r=>!unresolved(r)).slice(-49),value];this.writing=false;this.publish();
  return replacement?{status:status==='cursor_required'?'cursor_required':'changed',review:replacement}:{status,...(nextPrompt?{nextPrompt:true}:{}),...(cursorMoved?{cursorMoved:true}:{})};
 }
 async prepare(agent:AgentSnapshot,text:string):Promise<PrepareResult>{
  if(this.writing||this.reconciling)return{ok:false,reason:'busy'};
  await this.initialized;
  if(this.journalPhase!=='ready'||!this.options)return{ok:false,reason:'storage_unavailable'};
  // oxlint-disable-next-line no-control-regex -- reject raw terminal controls before applying original paste framing.
  if(!text.trim()||text.length>32768||text.split(/\r\n|\r|\n/).length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))return{ok:false,reason:'invalid_text'};
  const original=this.live();if(!original)return{ok:false,reason:'not_connected'};
  const c=await this.fresh(original);if(!c)return{ok:false,reason:'target_changed'};
  if(!c.transport.acquireTerminalInput)return{ok:false,reason:'input_lease_unavailable'};
  if(this.unreconciled(c,agent))return{ok:false,reason:'reconciliation_required'};
  if((agent.provider!=='codex'&&agent.provider!=='claude')||blocked(agent)||!this.current(c,agent))return{ok:false,reason:'target_unavailable'};
  try{await this.terminalContract(c);}catch(error){return{ok:false,reason:error instanceof CapabilityNegotiationError&&error.reason==='target_changed'?'target_changed':'target_unavailable'};}
  let terminal;try{terminal=await this.terminal(c,agent);}catch{return{ok:false,reason:'target_unavailable'};}
  const current=this.live();if(!current||current.transport!==c.transport||current.runtimeId!==c.runtimeId||current.generation!==c.generation||!this.current(current,agent))return{ok:false,reason:'target_changed'};
  if(terminal&&'unowned'in terminal)return{ok:false,reason:'target_not_on_desktop'};
  if(!terminal)return{ok:false,reason:'target_changed'};
  if(this.writing||this.reconciling)return{ok:false,reason:'busy'};
  if(this.journalPhase!=='ready')return{ok:false,reason:'storage_unavailable'};
  if(this.unreconciled(current,agent))return{ok:false,reason:'reconciliation_required'};
  let id:string;try{id=this.options.newId();}catch{return{ok:false,reason:'confirmation_unavailable'};}
  if(typeof id!=='string'||!id||this.audit.some(r=>r.id===id)||this.pending.has(id))return{ok:false,reason:'confirmation_unavailable'};
  const confirmation=Object.freeze({id,text,title:agent.title,worktreeId:agent.target.worktreeId,paneKey:agent.target.terminalId!,hostId:c.hostId,hostVersion:c.hostVersion||'unknown',runtimeId:c.runtimeId,generation:c.generation,...terminal,preparedAt:this.now()});
  // One on-screen confirmation at a time; bodies never enter the audit trail.
  this.pending.clear();this.pending.set(confirmation.id,{confirmation,agent:{...agent,target:{...agent.target}},transport:c.transport});
  return{ok:true,confirmation};
 }
 cancel(confirmation:PromptConfirmation):void {if(this.pending.get(confirmation.id)?.confirmation===confirmation)this.pending.delete(confirmation.id);}
 async confirm(confirmation:PromptConfirmation):Promise<ActionResult>{
  const owned=this.pending.get(confirmation.id);
  if(this.reconciling)return{status:'busy',bodyAccepted:false,submitAttempted:false};
  if(this.writing||!owned||owned.confirmation!==confirmation)return{status:'already_submitted',bodyAccepted:false,submitAttempted:false};
  this.pending.delete(confirmation.id); // Consume before the first await: double taps and unknown outcomes cannot retry.
  this.progress='checking';this.writing=true;this.publish();
  let bodyAccepted=false;let submitAttempted=false;let reserved=false;
  const receipt=(status:ActionStatus):ActionReceipt=>({id:confirmation.id,status,bodyAccepted,submitAttempted,acknowledged:false,hostId:confirmation.hostId,hostVersion:confirmation.hostVersion,handle:confirmation.handle,incarnationId:confirmation.incarnationId,at:this.now(),worktreeId:confirmation.worktreeId,paneKey:confirmation.paneKey});
  const persist=async(value:ActionReceipt,create=false):Promise<boolean>=>{
   if(this.journalPhase!=='ready'||!this.options)return false;
   try{if(create)await this.options.journal.reserve(value);else await this.options.journal.update(value);return true;}
   catch{this.journalPhase='unavailable';return false;}
  };
  const done=async(status:ActionStatus):Promise<ActionResult>=>{
   const result=receipt(status);
   if(this.journalPhase==='ready')await persist(result,!reserved);
   // History rotation must never remove an uncertainty fence. At most50 unresolved results
   // are admitted; reaching that limit blocks preparation until explicit reconciliation.
   const pending=this.audit.filter(unresolved);
   const settled=this.audit.filter(r=>!unresolved(r)).slice(-49);
   this.audit=[...pending,...settled,result];
   this.writing=false;this.publish();return{status,bodyAccepted,submitAttempted};
  };
  if(this.journalPhase!=='ready')return done('storage_unavailable');
  const opening=this.live();if(!opening)return done('not_connected');
  let c=await this.fresh(opening);if(!c)return done('target_changed');
  if(c.runtimeId!==confirmation.runtimeId||c.hostId!==confirmation.hostId||c.generation!==confirmation.generation||c.transport!==owned.transport||!this.current(c,owned.agent))return done('target_changed');
  let terminal;try{terminal=await this.terminal(c,owned.agent,confirmation.handle);}catch{return done('target_changed');}
  c=this.live();
  if(!c)return done('not_connected');
  if(!terminal||'unowned'in terminal||terminal.handle!==confirmation.handle||terminal.incarnationId!==confirmation.incarnationId||c.runtimeId!==confirmation.runtimeId||c.hostId!==confirmation.hostId||c.generation!==confirmation.generation||c.transport!==owned.transport||!this.current(c,owned.agent))return done('target_changed');
  let lease:TerminalInputLease;
  try{
   if(!c.transport.acquireTerminalInput)return done('unavailable');
   lease=await c.transport.acquireTerminalInput(confirmation.handle);
  }catch{return done('unavailable');}
  let bodyAttempted=false;
  const execute=async():Promise<ActionStatus>=>{
   try{await this.terminalContract(c!);}catch(error){return error instanceof CapabilityNegotiationError&&error.reason==='target_changed'?'target_changed':'unavailable';}
   const leased=this.live();
   if(!lease.isActive()||!leased||leased.transport!==owned.transport||leased.runtimeId!==confirmation.runtimeId||leased.hostId!==confirmation.hostId||leased.generation!==confirmation.generation||!this.current(leased,owned.agent))return 'target_changed';
   const guard={terminal:confirmation.handle,expectedIncarnationId:confirmation.incarnationId,requireAgentStatus:'sendable',requireWriteSettlement:true};
   // Original mobile presence owns input, with no viewport/output stream. Guard payload and
   // Enter separately; loss of that lease after typing leaves an explicit partial outcome.
   if(!await persist(receipt('unknown'),true))return 'storage_unavailable';
   reserved=true;
   // Persist first, then make the final PTY inventory read. No storage await may
   // separate this incarnation check from the non-idempotent input request.
   const refreshedBody=await this.fresh(leased);if(!refreshedBody)return 'target_changed';
   const beforeBody=await this.terminal(refreshedBody,owned.agent,confirmation.handle);
   const durable=this.live();
   if(!lease.isActive()||!beforeBody||'unowned'in beforeBody||beforeBody.handle!==confirmation.handle||beforeBody.incarnationId!==confirmation.incarnationId||!durable||durable.transport!==owned.transport||durable.runtimeId!==confirmation.runtimeId||durable.hostId!==confirmation.hostId||durable.generation!==confirmation.generation||!this.current(durable,owned.agent))return 'target_changed';
   this.setProgress('sending');bodyAttempted=true;
   let typed:unknown;try{typed=await durable.transport.request('terminal.send',{...guard,text:wrapTerminalBracketedPasteText(confirmation.text)});}catch(error){if(isMethodNotFound(error))return 'refused';throw error;}
   const typedOutcome=writeOutcome(typed);if(typedOutcome!=='accepted')return typedOutcome;
   bodyAccepted=true;
   if(!await persist(receipt('partial')))return 'partial';
   await this.delay(submitDelayMs(confirmation.text));
   const latest=this.live();
   if(!lease.isActive()||!latest||latest.transport!==owned.transport||latest.generation!==confirmation.generation||latest.runtimeId!==confirmation.runtimeId||latest.hostId!==confirmation.hostId||!this.current(latest,owned.agent))return 'partial';
   if(!await persist({...receipt('unknown'),submitAttempted:null}))return 'partial';
   const refreshedSubmit=await this.fresh(latest);if(!refreshedSubmit)return 'partial';
   const submitTarget=await this.terminal(refreshedSubmit,owned.agent,confirmation.handle);
   const durableSubmit=this.live();
   if(!lease.isActive()||!submitTarget||'unowned'in submitTarget||submitTarget.handle!==confirmation.handle||submitTarget.incarnationId!==confirmation.incarnationId||!durableSubmit||durableSubmit.transport!==owned.transport||durableSubmit.runtimeId!==confirmation.runtimeId||durableSubmit.hostId!==confirmation.hostId||durableSubmit.generation!==confirmation.generation||!this.current(durableSubmit,owned.agent))return 'partial';
   this.setProgress('sending');submitAttempted=true;
   const submitted=await durableSubmit.transport.request('terminal.send',{...guard,enter:true});
   const submitOutcome=writeOutcome(submitted);return submitOutcome==='refused'?'partial':submitOutcome;
  };
  let status:ActionStatus;
  try{status=await execute();}catch{status=bodyAccepted&&!submitAttempted?'partial':bodyAttempted?'unknown':'target_changed';}
  finally{try{await lease.release();}catch{try{owned.transport.close?.();}catch{/* preserve the observed write result */}}}
  return done(status);

 }
 receipts():ActionReceipt[]{return this.audit.map(r=>({...r}));}
}
