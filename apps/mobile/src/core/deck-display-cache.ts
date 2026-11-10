import type {AgentSnapshot} from './types';
import {bindKey,reconcileDeck,deckStoreFingerprint,type DeckState,type DeckInventory,type DeckItem} from './deck-model';
import {READ_FRESH_MS} from './read-freshness';
import {presentationPresent} from './project-focus';
import {parseAccountsUsage,parseOrderSettings,type UsageSnapshot,type OrderSnapshot} from '../adapters/usage';

export const DISPLAY_CACHE_MS=180_000;
const MAX_BYTES=262144;
/** Presentation metadata has no target, generation, capability, request body or action authority. */
export type DisplayAgent=Pick<AgentSnapshot,'title'|'provider'|'state'|'updatedAt'|'stateSince'|'monitoring'|'stopping'|'unconfirmed'|'hostOwned'|'livePty'|'dashboard'|'terminalActivity'>;
export interface CachedDisplayRow extends DisplayAgent {key:string;project:string;worktree:string}
export interface CachedFocusInfo {project:string|null;worktree:string|null;following:boolean;synced?:boolean}
export interface DeckDisplayCache {
 format:1;hostId:string;issuedAt:number;rows:CachedDisplayRow[];items:string[];keys:(string|null)[];selectedKey:string|null;
 partial:boolean;unresolved:number|null;focusInfo:CachedFocusInfo;usage?:UsageSnapshot;order?:OrderSnapshot;orderObservedAt?:number;
 desktopFocus?:{worktreeId:string;tabId?:string;observedAt:number};
}
export interface CacheCapture {
 hostId:string;issuedAt:number;agents:readonly DeckItem[];items?:readonly string[];keys:readonly(string|null)[];selectedKey:string|null;
 partial:boolean;unresolved:number|null;focusInfo:CachedFocusInfo;usage?:UsageSnapshot;order?:OrderSnapshot;
 desktopFocus?:DeckDisplayCache['desktopFocus'];
}
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=8.64e15;
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=8192;
const label=(v:unknown):string=>typeof v==='string'&&v.length<=4096&&!/orca:\/\/pair|(?:authorization\s*:\s*bearer\s+\S+)|(?:\b(?:token|api[_ -]?key|password)\s*[:=]\s*\S+)/iu.test(v)?v:'—';
const states=new Set(['working','permission','question','failed','review','done','idle','unknown']);
const providers=new Set(['claude','codex','other']);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000;
function normalize(value:unknown):DeckDisplayCache|null{
 if(!rec(value)||value.format!==1||!id(value.hostId)||!finite(value.issuedAt)||!Array.isArray(value.rows)||value.rows.length>500||!Array.isArray(value.keys)||value.keys.length>64||!rec(value.focusInfo))return null;
 const rows:CachedDisplayRow[]=[];
 for(const r of value.rows){
  if(!rec(r)||!id(r.key)||typeof r.provider!=='string'||!providers.has(r.provider)||typeof r.state!=='string'||!states.has(r.state)||typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))return null;
  const row:CachedDisplayRow={key:r.key,title:label(r.title),provider:r.provider as CachedDisplayRow['provider'],state:r.state as CachedDisplayRow['state'],updatedAt:r.updatedAt,project:label(r.project),worktree:label(r.worktree)};
  if(typeof r.stateSince==='string'&&Number.isFinite(Date.parse(r.stateSince)))row.stateSince=r.stateSince;
  for(const k of ['monitoring','stopping','unconfirmed','hostOwned','livePty'] as const)if(r[k]===true)row[k]=true;
  if(rec(r.dashboard)&&['attention','working','done','idle'].includes(String(r.dashboard.bucket))&&typeof r.dashboard.visible==='boolean'&&(r.dashboard.stateChangedAt===null||finite(r.dashboard.stateChangedAt)))row.dashboard={bucket:r.dashboard.bucket as NonNullable<CachedDisplayRow['dashboard']>['bucket'],visible:r.dashboard.visible,stateChangedAt:r.dashboard.stateChangedAt as number|null};
  if(rec(r.terminalActivity)&&typeof r.terminalActivity.present==='boolean'&&(r.terminalActivity.lastOutputAt===null||finite(r.terminalActivity.lastOutputAt))&&(r.terminalActivity.stateStartedAt===null||finite(r.terminalActivity.stateStartedAt)))row.terminalActivity={present:r.terminalActivity.present,lastOutputAt:r.terminalActivity.lastOutputAt as number|null,stateStartedAt:r.terminalActivity.stateStartedAt as number|null};
  rows.push(row);
 }
 const known=new Set(rows.map(r=>r.key));if(known.size!==rows.length)return null;
 if(!value.keys.every(k=>k===null||id(k)&&known.has(k)))return null;
 if(!Array.isArray(value.items)||!value.items.every(k=>id(k)&&known.has(k))||new Set(value.items).size!==value.items.length)return null;
 const occupied=value.keys.filter(k=>k!==null);if(new Set(occupied).size!==occupied.length)return null;
 if(value.selectedKey!==null&&(!id(value.selectedKey)||!known.has(value.selectedKey)))return null;
 if(typeof value.partial!=='boolean'||value.unresolved!==null&&!count(value.unresolved)||typeof value.focusInfo.following!=='boolean')return null;
 const focusInfo:CachedFocusInfo={project:value.focusInfo.project===null?null:label(value.focusInfo.project),worktree:value.focusInfo.worktree===null?null:label(value.focusInfo.worktree),following:value.focusInfo.following};
 if(typeof value.focusInfo.synced==='boolean')focusInfo.synced=value.focusInfo.synced;
 const result:DeckDisplayCache={format:1,hostId:value.hostId,issuedAt:value.issuedAt,rows,items:value.items as string[],keys:value.keys as (string|null)[],selectedKey:value.selectedKey as string|null,partial:value.partial,unresolved:value.unresolved as number|null,focusInfo};
 if(rec(value.usage)&&finite(value.usage.observedAt)){const usage=parseAccountsUsage({rateLimits:value.usage},value.usage.observedAt);if(usage)result.usage=usage;}
 if(rec(value.order)){const order=value.order;result.order=parseOrderSettings({ui:order},{catalog:{repos:Array.isArray(order.repoOrder)?order.repoOrder.filter(id).map(id=>({id})):[]}});result.orderObservedAt=finite(value.orderObservedAt)?value.orderObservedAt:finite(order.observedAt)?order.observedAt:value.issuedAt;if(finite(order.observedAt))result.order.observedAt=order.observedAt;}
 if(rec(value.desktopFocus)&&id(value.desktopFocus.worktreeId)&&finite(value.desktopFocus.observedAt))result.desktopFocus={worktreeId:value.desktopFocus.worktreeId,observedAt:value.desktopFocus.observedAt,...(id(value.desktopFocus.tabId)?{tabId:value.desktopFocus.tabId}:{})};
 return result;
}
const byteSize=(s:string)=>{let n=0;for(const c of s){const p=c.codePointAt(0)!;n+=p<=127?1:p<=2047?2:p<=65535?3:4;}return n;};
/** A source can be LIVE before React has applied it. Membership and protected metadata must agree first.
 * Generation alone is insufficient: a newly created reader may reuse the same generation after resume. */
export function liveDeckDisplayReady(deck:DeckState,inventory:DeckInventory,now:number,bindingsReady:boolean):boolean{
 const issuedAt=inventory.confirmedAt;
 if(!bindingsReady||!inventory.live||inventory.generation===null||deck.lastLiveAt===null||deck.generation!==inventory.generation||typeof issuedAt!=='number'||!Number.isFinite(issuedAt)||!Number.isFinite(now)||now<issuedAt||now-issuedAt>READ_FRESH_MS)return false;
 const expected=reconcileDeck(deck,inventory,now),present=new Set(deck.present);
 if(expected.present.length!==present.size||expected.present.some(key=>!present.has(key)))return false;
 try{return deckStoreFingerprint(expected,now)===deckStoreFingerprint(deck,now);}catch{return false;}
}
const recentDisplayFact=(at:number|undefined,now:number)=>typeof at==='number'&&Number.isFinite(at)&&Number.isFinite(now)&&now>=at&&now-at<=DISPLAY_CACHE_MS;
export function readableDisplayCache(value:DeckDisplayCache|null,hostId:string|undefined,now:number,liveDisplayReady=false):DeckDisplayCache|null{
 if(liveDisplayReady)return null;
 if(!value||hostId!==value.hostId||!recentDisplayFact(value.issuedAt,now))return null;
 const usage=recentDisplayFact(value.usage?.observedAt,now)?value.usage:undefined;
 const order=recentDisplayFact(value.orderObservedAt,now)?value.order:undefined;
 return usage===value.usage&&order===value.order?value:{...value,usage,order,orderObservedAt:order?value.orderObservedAt:undefined};
}
/** Transient presentation source. Encoding strips this field; neither source restores a live target. */
export type PendingLcdDisplay=DeckDisplayCache&{lcdSource?:'live-row'|'retained'};
/** A fresh inventory can precede explicit selection. Refresh the last LCD from the whole live list when
 * its exact identity is present; otherwise keep only its original, expiring display metadata.
 * Callers without a live projection retain the existing pending-selection behavior.
 */
export function pendingSelectionDisplay(value:DeckDisplayCache|null,hostId:string|undefined,now:number,liveDisplayReady:boolean,selectedKey:string|null,visibleKeys:readonly string[],live?:CacheCapture):PendingLcdDisplay|null{
 if(!liveDisplayReady||selectedKey!==null)return null;
 const previous=readableDisplayCache(value,hostId,now);
 if(!previous?.selectedKey)return null;
 if(!live)return visibleKeys.includes(previous.selectedKey)?previous:null;
 if(live.hostId!==hostId||live.selectedKey!==null||!finite(live.issuedAt)||!Number.isFinite(now)||now<live.issuedAt||now-live.issuedAt>READ_FRESH_MS)return null;
 const exact=live.agents.filter(agent=>presentationPresent(agent)&&bindKey(agent)===previous.selectedKey);
 if(exact.length===1){
  const agent=exact[0];
  const current=captureDisplayCache({...live,selectedKey:previous.selectedKey,focusInfo:{...live.focusInfo,project:agent.place?.repo??null,worktree:agent.place?.worktreeName??null,synced:false}},now,true,previous);
  if(current)return{...current,lcdSource:'live-row'};
 }
 return{...previous,focusInfo:{...previous.focusInfo,synced:false},lcdSource:'retained'};
}
/** Independent metadata reads may finish after tabs. Retain display facts, never live authority.
 * Preserve their source clocks so fresh tab reads cannot keep missing metadata alive forever. */
export function displayMetadata(value:DeckDisplayCache|null,hostId:string|undefined,now:number,usage?:UsageSnapshot,order?:OrderSnapshot):{usage?:UsageSnapshot;order?:OrderSnapshot;orderObservedAt?:number}{
 const previous=readableDisplayCache(value,hostId,now);
 const orderAt=order?.observedAt??now;
 return {
  usage:usage!==undefined?(recentDisplayFact(usage.observedAt,now)?usage:undefined):previous?.usage,
  order:order!==undefined?(recentDisplayFact(orderAt,now)?order:undefined):previous?.order,
  orderObservedAt:order!==undefined?(recentDisplayFact(orderAt,now)?orderAt:undefined):previous?.orderObservedAt,
 };
}
export function captureDisplayCache(input:CacheCapture,now:number,liveDisplayReady=true,previous:DeckDisplayCache|null=null):DeckDisplayCache|null{
 if(!liveDisplayReady)return null;
 if(!finite(input.issuedAt)||!Number.isFinite(now)||now<input.issuedAt||now-input.issuedAt>READ_FRESH_MS)return null;
 const metadata=displayMetadata(previous,input.hostId,now,input.usage,input.order);
 if(metadata.order!==undefined&&input.order!==undefined&&input.order.observedAt===undefined)metadata.orderObservedAt=input.issuedAt;
 const rows=input.agents.filter(presentationPresent).map(a=>({key:bindKey(a),title:a.title,provider:a.provider,state:a.state,updatedAt:a.updatedAt,stateSince:a.stateSince,monitoring:a.monitoring,stopping:a.stopping,unconfirmed:a.unconfirmed,hostOwned:a.hostOwned,livePty:a.livePty,dashboard:a.dashboard,terminalActivity:a.terminalActivity,project:a.place?.repo??'',worktree:a.place?.worktreeName??''}));
 return normalize({format:1,hostId:input.hostId,issuedAt:input.issuedAt,rows,items:input.items??rows.map(r=>r.key),keys:[...input.keys],selectedKey:input.selectedKey,partial:input.partial,unresolved:input.unresolved,focusInfo:input.focusInfo,...metadata,desktopFocus:input.desktopFocus});
}
export function encodeDisplayCache(value:DeckDisplayCache):string|null{
 const clean=normalize(value);if(!clean)return null;const text=JSON.stringify(clean);return byteSize(text)<=MAX_BYTES?text:null;
}
export function decodeDisplayCache(text:string|null,now:number):DeckDisplayCache|null{
 if(text===null||text.length>MAX_BYTES||byteSize(text)>MAX_BYTES)return null;
 try{const clean=normalize(JSON.parse(text));return readableDisplayCache(clean,clean?.hostId,now);}catch{return null;}
}
