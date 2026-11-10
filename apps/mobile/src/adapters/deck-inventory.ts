import {READ_FRESH_MS} from '../core/read-freshness';
import type {LiveSnapshot} from './live-session';
import type {StructuredState,StructuredEntry,NativeReplyEntry} from './structured-action-client';
import type {RequestItem} from './structured-request-wire';
import type {NativeAsyncQuestion} from './native-async-reply';
import type {ActionClientState} from './action-client';
import {bindKey,indexAgents,type DeckInventory,type DeckItem} from '../core/deck-model';

export type NativeDeckTarget={kind:'request';entry:StructuredEntry;item:RequestItem}|{kind:'async_reply';entry:NativeReplyEntry;question:NativeAsyncQuestion};
export interface CombinedDeckInventory extends DeckInventory {confirmedAt:number;gaps:readonly string[];nativeTargets:ReadonlyMap<string,NativeDeckTarget>;unresolvedCount:number|null}
const fresh=(at:number,now:number)=>Number.isFinite(at)&&at>=0&&Number.isFinite(now)&&now>=at&&now-at<=READ_FRESH_MS;
const sameScope=(a:readonly string[],b:readonly string[])=>a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(id=>b.includes(id));
const provider=(name:string):DeckItem['provider']=>name==='codex'||name==='claude'?name:'other';
/** Pure projection of explicitly completed original reads. Performs no RPC and never upgrades a basic LIVE badge to completeness. */
export function combineDeckInventory(snapshot:LiveSnapshot,native:StructuredState,now:number,actions?:Pick<ActionClientState,'journal'|'receipts'>):CombinedDeckInventory {
 const c=snapshot.connection,confirmedAt=Date.parse(c?.lastConfirmedAt??'');
 const live=snapshot.phase==='live'&&c?.online===true&&c.paired&&!!snapshot.host&&snapshot.host.hostId===c.hostId&&Number.isSafeInteger(c.generation)&&fresh(confirmedAt,now);
 const hostId=c?.hostId,generation=c?.generation??null,pane=snapshot.inventory,proof=native.inventory;
 const gaps:string[]=[];
 if(!live)gaps.push('read_unconfirmed');
 const paneIdentityFresh=!!pane&&pane.hostId===hostId&&pane.generation===generation&&pane.observedAt===confirmedAt&&fresh(pane.observedAt,now);
 const paneReady=paneIdentityFresh&&pane.complete;
 if(!paneReady)gaps.push('pane_coverage');
 const nativeReady=!!proof&&proof.complete&&proof.hostId===hostId&&proof.generation===generation&&fresh(proof.observedAt,now)&&!!pane&&sameScope(pane.worktreeIds,proof.worktreeIds)&&native.phase==='ready'&&!native.refreshing;
 if(!nativeReady)gaps.push('native_coverage');
 if(native.skippedWorktrees||native.unsupportedTargets.length||native.unavailableTargets.length||native.unavailableWorktrees.length||native.asyncUnavailableTargets.length)gaps.push('scoped_read_gap');
 const agents:DeckItem[]=[];
 if(live&&paneIdentityFresh)for(const a of snapshot.agents){
  if(a.target.hostId!==hostId||a.target.connectionGeneration!==generation||!pane?.worktreeIds.includes(a.target.worktreeId)){gaps.push('pane_identity');continue;}
  if(pane?.ambiguousPanes?.includes(JSON.stringify([a.target.worktreeId,a.target.terminalId])))continue;
  agents.push({...a,target:{...a.target}});
 }
 const targets=new Map<string,NativeDeckTarget>();
 const current=(e:StructuredEntry)=>live&&paneIdentityFresh&&e.hostId===hostId&&e.generation===generation&&fresh(e.observedAt,now)&&!!pane&&pane.worktreeIds.includes(e.target.worktreeId);
 const append=(e:StructuredEntry,itemId:string,summary:string,state:'permission'|'question',source:NativeDeckTarget,verified:boolean)=>{
  const item:DeckItem={id:JSON.stringify(['native',e.hostId,e.target.worktreeId,e.target.tabId,e.target.sessionId,itemId]),provider:provider(e.target.agent),title:e.target.title,summary,state,eventType:state==='permission'?'permission_request':'user_question',updatedAt:new Date(e.observedAt).toISOString(),target:{hostId:e.hostId,connectionGeneration:e.generation,worktreeId:e.target.worktreeId},requestId:itemId,permissionEvidence:verified?'structured_verified':'missing',nativeRequest:{tabId:e.target.tabId,sessionId:e.target.sessionId,itemId}};
  const key=bindKey(item);if(targets.has(key))gaps.push('duplicate_identity');targets.set(key,source);agents.push(item);
 };
 if(live&&native.phase==='ready'){
  for(const entry of native.entries){
   if(!current(entry)){gaps.push('stale_native_entry');continue;}
   for(const item of entry.items)append(entry,item.itemId,JSON.stringify(item.body,null,2),item.body.kind==='approval'?'permission':'question',{kind:'request',entry,item},item.supported);
  }
  for(const entry of native.asyncEntries){
   if(!current(entry)){gaps.push('stale_native_entry');continue;}
   for(const question of entry.questions)append(entry,JSON.stringify(['async',question.itemId,question.callId]),JSON.stringify(question.questions,null,2),'question',{kind:'async_reply',entry,question},false);
  }
 }
 const indexed=indexAgents(agents);
 if(indexed.duplicates.size)gaps.push('duplicate_identity');
 const duplicateSource=(nativeSource:boolean)=>[...indexed.duplicates].some(key=>!!indexed.rows.get(key)?.nativeRequest===nativeSource);
 // Positive rows retain their individual fresh identity even while a different source is partial.
 const sourceCoverage={pane:live&&paneReady&&!duplicateSource(false),native:live&&nativeReady&&!duplicateSource(true)&&!gaps.includes('scoped_read_gap')&&!gaps.includes('stale_native_entry')};
 // Exact fresh positive identity validates an existing binding without claiming global absence.
 const validatedKeys=new Set([...indexed.rows.keys()].filter(key=>paneIdentityFresh&&!indexed.duplicates.has(key)&&(!indexed.rows.get(key)?.nativeRequest||targets.has(key))));
 const unresolvedPanes=new Set<string>(),unresolvedIds=new Set<string>();
 for(const r of actions?.receipts??[])if(!r.acknowledged&&(r.status==='partial'||r.status==='unknown')){unresolvedPanes.add(JSON.stringify([r.hostId,r.worktreeId,r.paneKey??null]));unresolvedIds.add('prompt:'+r.id);}
 for(const r of native.receipts)if(!r.acknowledged&&r.status==='unknown'){unresolvedPanes.add(JSON.stringify([r.hostId,r.worktreeId,['native',r.tabId,r.sessionId]]));unresolvedIds.add('native:'+r.operationId);}
 return {live,complete:gaps.length===0,sourceCoverage,validatedKeys,scopeIdentity:pane?.scopeIdentity,uncertaintyKnown:actions?.journal==='ready'&&native.journal==='ready',agents,generation,unresolvedPanes,confirmedAt,gaps:[...new Set(gaps)],nativeTargets:targets,unresolvedCount:actions?.journal==='ready'&&native.journal==='ready'?unresolvedIds.size:null};
}
