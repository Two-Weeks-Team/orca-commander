import {bindKey,paneKey,type DeckInventory,type DeckState} from './deck-model';
import type {ActionChannel,ActionClientState} from '../adapters/action-client';
import type {StructuredEntry,StructuredState} from '../adapters/structured-action-client';
import type {RequestItem,NativeTarget} from '../adapters/structured-request-wire';

export interface DeckNativeCommandContext {
 deck:DeckState;inventory:DeckInventory&{confirmedAt:number};
 actions:Pick<ActionClientState,'journal'|'busy'|'receipts'>;structured:StructuredState;
 channel:Pick<ActionChannel,'hostId'|'hostVersion'|'runtimeId'|'generation'|'confirmedAt'>|null;now:number;
}
export type DeckNativeCommandLock='no_selection'|'not_present'|'not_native'|'async_reply'|'unknown'|'journal'|'busy'|'expired'|'generation'|'identity'|'duplicate'|'native_unavailable'|'unsupported'|'unresolved'|'uncertainty_limit'|'option_missing';
export interface DeckNativeCommandReference {readonly entry:StructuredEntry;readonly item:RequestItem;readonly option:RequestItem['body']['options'][number]}
export interface DeckNativeCommands {allow:DeckNativeCommandReference|null;reject:DeckNativeCommandReference|null;allowLock:DeckNativeCommandLock|null;rejectLock:DeckNativeCommandLock|null}
const locked=(reason:DeckNativeCommandLock):DeckNativeCommands=>({allow:null,reject:null,allowLock:reason,rejectLock:reason});
// A view reference is not write authority; StructuredActionClient rereads it at hold.
const validObservation=(at:number|null,now:number)=>at!==null&&Number.isFinite(at)&&at>=0&&Number.isFinite(now)&&now>=0;
const positive=(value:number)=>Number.isSafeInteger(value)&&value>0;
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const labels:Readonly<Record<string,string>>={accept:'Allow',decline:'Deny',acceptForSession:'Allow for this session',cancel:'Stop'};
const sameAddress=(a:NativeTarget,b:NativeTarget)=>a.worktreeId===b.worktreeId&&a.tabId===b.tabId&&a.sessionId===b.sessionId;
/** Repeat the current parser's narrow command semantics; a cached supported boolean alone grants nothing. */
function supported(entry:StructuredEntry,item:RequestItem):boolean {
 const body=item.body,resolution=body.resolution,marker=entry.marker;
 return entry.target.agent==='codex'&&item.supported===true&&positive(item.revision)&&positive(entry.fence)&&
  marker.contract==='agent-session.current-requests.v1'&&marker.sessionId===entry.target.sessionId&&Number.isSafeInteger(marker.revision)&&marker.revision>=0&&
  [marker.epoch,marker.publisher,marker.owner,marker.version].every(value=>typeof value==='string'&&value.length>0)&&
  body.kind==='approval'&&body.subject===undefined&&body.title==='Run a command?'&&(body.detail===null||typeof body.detail==='string')&&
  record(resolution)&&resolution.state==='pending'&&resolution.selectedOptionId===null&&resolution.resolvedBy===null&&resolution.resolvedAt===null&&
  Array.isArray(body.options)&&body.options.length>0&&new Set(body.options.map(option=>option.id)).size===body.options.length&&
  body.options.every(option=>Object.hasOwn(labels,option.id)&&labels[option.id]===option.label);
}
/**
 * Pure selected-native-item interpretation. No map lookup, preparation, ticket, journal mutation or RPC.
 * Global completeness is deliberately not required: an unrelated gap does not invalidate positive evidence.
 * References remain subject to StructuredActionClient's original fresh reads and durable confirmation.
 * A local fence comparison is not a host fence CAS or atomic tab-inventory/mutation guarantee.
 */
export function resolveDeckNativeCommands({deck,inventory,actions,structured,channel,now}:DeckNativeCommandContext):DeckNativeCommands {
 const key=deck.selected;
 if(key===null)return locked('no_selection');
 if(!deck.present.includes(key)||deck.validationPending.includes(key))return locked('not_present');
 if(actions.journal!=='ready'||structured.journal!=='ready'||!inventory.uncertaintyKnown||!deck.uncertaintyKnown)return locked('journal');
 if(actions.busy||structured.busy)return locked('busy');
 if(!channel||!inventory.live||!validObservation(inventory.confirmedAt,now)||!validObservation(deck.lastLiveAt,now)||!validObservation(channel.confirmedAt,now))return locked('expired');
 if(!Number.isSafeInteger(channel.generation)||channel.generation<0||deck.generation!==channel.generation||inventory.generation!==channel.generation)return locked('generation');
 const rows=inventory.agents.filter(agent=>bindKey(agent)===key);
 if(rows.length>1)return locked('duplicate');
 if(rows.length!==1)return locked('not_present');
 const agent=rows[0],native=agent.nativeRequest;
 if(!native)return locked('not_native');
 if(agent.target.connectionGeneration!==channel.generation)return locked('generation');
 if(agent.target.hostId!==channel.hostId)return locked('identity');
 const address={worktreeId:agent.target.worktreeId,tabId:native.tabId,sessionId:native.sessionId,agent:agent.provider,title:agent.title};
 // Async projections use a synthetic compound item key. Enumerate their source objects, never parse that key as an approval ID.
 if(structured.asyncEntries.some(entry=>entry.hostId===channel.hostId&&sameAddress(entry.target,address)&&entry.questions.some(question=>JSON.stringify(['async',question.itemId,question.callId])===native.itemId)))return locked('async_reply');
 if(agent.state!=='permission'||agent.eventType!=='permission_request'||agent.permissionEvidence!=='structured_verified'||agent.requestId!==native.itemId)return locked('unknown');
 if(structured.phase!=='ready')return locked('native_unavailable');
 if(structured.unavailableWorktrees.includes(address.worktreeId)||[...structured.unavailableTargets,...structured.unsupportedTargets,...structured.asyncUnavailableTargets].some(target=>sameAddress(target,address)))return locked('native_unavailable');
 // Contradictory providers/generations for the same source address are not resolved by choosing the last row.
 const entries=structured.entries.filter(entry=>entry.hostId===channel.hostId&&sameAddress(entry.target,address));
 if(entries.length>1)return locked('duplicate');
 if(entries.length!==1)return locked('identity');
 const entry=entries[0];
 if(entry.generation!==channel.generation)return locked('generation');
 if(!channel.runtimeId||entry.runtimeId!==channel.runtimeId||entry.target.title!==agent.title)return locked('identity');
 if(!validObservation(entry.observedAt,now))return locked('expired');
 const items=entry.items.filter(item=>item.itemId===native.itemId);
 if(items.length>1)return locked('duplicate');
 if(items.length!==1)return locked('identity');
 const item=items[0];
 if(agent.provider!=='codex'||entry.target.agent!==agent.provider||!supported(entry,item))return locked('unsupported');
 // Terminal partial/unknown receipts remain on their original pane; shared worktree/title is not a native join.
 const unresolved=structured.receipts.filter(receipt=>receipt.status==='unknown'&&!receipt.acknowledged);
 if(unresolved.length>=16)return locked('uncertainty_limit');
 if(inventory.unresolvedPanes.has(paneKey(agent))||unresolved.some(receipt=>receipt.hostId===channel.hostId&&receipt.sessionId===native.sessionId))return locked('unresolved');
 const reference=(id:'accept'|'decline'):DeckNativeCommandReference|null=>{const option=item.body.options.find(candidate=>candidate.id===id);return option?{entry,item,option}:null;};
 const allow=reference('accept'),reject=reference('decline');
 return{allow,reject,allowLock:allow?null:'option_missing',rejectLock:reject?null:'option_missing'};
}
