import {READ_FRESH_MS} from './read-freshness';
export {READ_FRESH_MS} from './read-freshness';
import {agentDisplay,type AgentDisplayKind} from './agent-display';
import {attentionScore} from './attention';
import type {AgentSnapshot} from './types';

export const SLOT_COUNT=6, ROW_SIZE=3, ABSENT_FREE_MS=600_000, FLASH_IGNORE_MS=800, CLEAR_COOLDOWN_MS=3_000;
export interface DeckItem extends AgentSnapshot {nativeRequest?:{tabId:string;sessionId:string;itemId:string}}
export type ItemKey=string;
export type PaneKey=string;
export const bindKey=(a:DeckItem):ItemKey=>JSON.stringify([a.provider,a.target.hostId,a.target.worktreeId,a.nativeRequest?['native',a.nativeRequest.tabId,a.nativeRequest.sessionId,a.nativeRequest.itemId]:a.target.terminalId??null]);
export const paneKey=(a:Pick<DeckItem,'target'|'nativeRequest'>):PaneKey=>JSON.stringify([a.target.hostId,a.target.worktreeId,a.nativeRequest?['native',a.nativeRequest.tabId,a.nativeRequest.sessionId]:a.target.terminalId??null]);
const paneOfKey=(key:ItemKey):PaneKey=>{const [,host,worktree,item]=JSON.parse(key) as unknown[];return JSON.stringify([host,worktree,Array.isArray(item)?item.slice(0,3):item]);};
export interface SlotEntry {key:ItemKey;ignoreUntil:number}
export interface DeckState {
 slots:readonly(SlotEntry|null)[];order:readonly ItemKey[];reassignAfter:readonly number[];selected:ItemKey|null;
 missingSince:Readonly<Record<ItemKey,number>>;lastLiveAt:number|null;generation:number|null;dismissed:readonly ItemKey[];
 present:readonly ItemKey[];validationPending:readonly ItemKey[];scopeIdentity:string|null;complete:boolean;uncertaintyKnown:boolean;restore:'ready'|'waiting'|'blocked';
}
export const emptyDeckState=():DeckState=>({slots:Array.from({length:6},()=>null),order:[],reassignAfter:Array.from({length:6},()=>0),selected:null,missingSince:{},lastLiveAt:null,generation:null,dismissed:[],present:[],validationPending:[],scopeIdentity:null,complete:false,uncertaintyKnown:false,restore:'ready'});
export interface DeckInventory {live:boolean;complete:boolean;agents:readonly DeckItem[];generation:number|null;unresolvedPanes:ReadonlySet<PaneKey>;uncertaintyKnown:boolean;sourceCoverage?:{pane:boolean;native:boolean};validatedKeys?:ReadonlySet<ItemKey>;scopeIdentity?:string;/** Successful tab request issue time, independent of render/reconcile time. */confirmedAt?:number}
const unknown=(a:DeckItem):DeckItem=>({...a,target:{...a.target},state:'unknown',eventType:'informational',requestId:undefined,permissionEvidence:'missing'});
export function indexAgents(agents:readonly DeckItem[]){
 const rows=new Map<ItemKey,DeckItem>(),duplicates=new Set<ItemKey>();
 for(const a of agents){const key=bindKey(a);if(rows.has(key))duplicates.add(key);rows.set(key,duplicates.has(key)?unknown(a):a);}
 return {rows,duplicates};
}
/** Only consecutive complete live observations may establish continuous absence. No elapsed time is accumulated across gaps. */
export function reconcileDeck(prev:DeckState,input:DeckInventory,now:number):DeckState {
 const validClock=Number.isFinite(now)&&now>=0;
 const indexed=indexAgents(input.agents);
 const complete=input.live&&input.complete&&indexed.duplicates.size===0&&validClock&&input.generation!==null;
 const generation=input.generation??prev.generation;
 const sourceComplete=(key:ItemKey)=>input.sourceCoverage?.[Array.isArray((JSON.parse(key) as unknown[])[3])?'native':'pane']??input.complete;
 // Restart/reconnect validation belongs to each binding's own source, independently of unrelated gaps.
 const pending=new Set(prev.validationPending);
 if(generation!==prev.generation)for(const slot of prev.slots)if(slot)pending.add(slot.key);
 const observed=input.live&&validClock&&input.generation!==null?[...indexed.rows.keys()].filter(k=>!indexed.duplicates.has(k)):[];
 for(const key of observed)if(input.validatedKeys?.has(key)||sourceComplete(key))pending.delete(key);
 const present=observed.filter(k=>!pending.has(k));
 const presentSet=new Set(present);
 const uncertaintyKnown=input.uncertaintyKnown===true;
 const continuous=complete&&uncertaintyKnown&&prev.uncertaintyKnown&&prev.complete&&prev.generation===input.generation&&input.scopeIdentity!==undefined&&prev.scopeIdentity===input.scopeIdentity&&prev.lastLiveAt!==null&&now>=prev.lastLiveAt&&now-prev.lastLiveAt<=READ_FRESH_MS;
 const slots=prev.slots.map(s=>s?{...s}:null),reassignAfter=[...prev.reassignAfter];
 const missingSince:Record<ItemKey,number>={},dropped=new Set<ItemKey>();
 if(complete&&uncertaintyKnown)for(const key of prev.order){
  if(presentSet.has(key))continue;
  missingSince[key]=continuous?(prev.missingSince[key]??now):now;
  if(input.scopeIdentity!==undefined&&now-missingSince[key]>=ABSENT_FREE_MS&&!input.unresolvedPanes.has(paneOfKey(key)))dropped.add(key);
 }
 slots.forEach((s,i)=>{if(s&&dropped.has(s.key)){slots[i]=null;reassignAfter[i]=now+CLEAR_COOLDOWN_MS;}});
 for(const key of dropped)delete missingSince[key];
 const order=prev.order.filter(k=>!dropped.has(k)),known=new Set(order);
 for(const key of present)if(!known.has(key)){known.add(key);order.push(key);}
 const dismissed=prev.dismissed.filter(k=>!dropped.has(k)&&!(complete&&presentSet.has(k)&&attentionScore(indexed.rows.get(k)!)>0));
 const slotted=()=>new Set(slots.flatMap(s=>s?[s.key]:[]));
 if(input.live&&validClock&&input.generation!==null&&uncertaintyKnown&&prev.restore!=='blocked'){
  for(const key of order){
   if(!presentSet.has(key)||slotted().has(key)||dismissed.includes(key))continue;
   const free=slots.findIndex((s,i)=>s===null&&reassignAfter[i]<=now);if(free<0)continue;
   slots[free]={key,ignoreUntil:0};
  }
  const attention=complete?order.filter(k=>presentSet.has(k)&&!slotted().has(k)&&attentionScore(indexed.rows.get(k)!)>0):[];
  for(const key of attention){
   if(slots.some(s=>s===null))break;
   let victim=-1,oldest=Infinity;
   slots.forEach((s,i)=>{
    if(!s||s.ignoreUntil>now||input.unresolvedPanes.has(paneOfKey(s.key)))return;
    const a=indexed.rows.get(s.key);if(!a||!['done','idle'].includes(a.state))return;
    const parsed=Date.parse(a.updatedAt),at=Number.isFinite(parsed)?parsed:Infinity;
    if(victim<0||at<oldest){victim=i;oldest=at;}
   });
   if(victim<0)break;slots[victim]={key,ignoreUntil:now+FLASH_IGNORE_MS};
  }
 }
 const selected=generation!==prev.generation||complete&&prev.selected!==null&&!presentSet.has(prev.selected)?null:prev.selected;
 return {slots,order,reassignAfter,selected,missingSince,lastLiveAt:input.live&&validClock&&input.generation!==null?(input.confirmedAt??now):null,generation,dismissed,present,validationPending:[...pending].filter(k=>!dropped.has(k)),scopeIdentity:input.scopeIdentity??null,complete,uncertaintyKnown,restore:prev.restore==='blocked'?'blocked':pending.size===0?'ready':prev.restore};
}
const positions=(s:DeckState):(ItemKey|null)[]=>{
 const keyed=new Set(s.slots.flatMap(k=>k?[k.key]:[]));
 return [...s.slots.map(k=>k&&s.present.includes(k.key)?k.key:null),...s.order.filter(k=>!keyed.has(k)&&s.present.includes(k))];
};
export const itemsInOrder=(s:DeckState)=>positions(s).filter((k):k is ItemKey=>k!==null);
export function moveSelection(s:DeckState,direction:'left'|'right'|'up'|'down'):ItemKey|null {
 const pos=positions(s),at=s.selected===null?-1:pos.indexOf(s.selected);
 if(at<0)return pos.find(k=>k!==null)??null;
 const step=direction==='left'?-1:direction==='right'?1:direction==='up'?-ROW_SIZE:ROW_SIZE;
 for(let i=at+step;i>=0&&i<pos.length;i+=step)if(pos[i]!==null)return pos[i];
 return s.selected;
}
export function stepAttention(s:DeckState,agents:readonly DeckItem[],direction:'prev'|'next'):ItemKey|null {
 const {rows,duplicates}=indexAgents(agents);
 const list=s.order.filter(k=>s.present.includes(k)&&!duplicates.has(k)&&rows.has(k)&&attentionScore(rows.get(k)!)>0);
 if(!list.length)return s.selected;const at=s.selected===null?-1:list.indexOf(s.selected);
 return at<0?list[direction==='next'?0:list.length-1]:list[(at+(direction==='next'?1:list.length-1))%list.length];
}
export function pressKey(s:DeckState,slot:number,now:number){
 const entry=s.slots[slot];const accepted=Number.isInteger(slot)&&Number.isFinite(now)&&s.lastLiveAt!==null&&now>=s.lastLiveAt&&now-s.lastLiveAt<=READ_FRESH_MS&&s.restore!=='blocked'&&!!entry&&entry.ignoreUntil<=now&&s.present.includes(entry.key);
 return {state:accepted?{...s,selected:entry!.key}:s,accepted};
}
export function clearSlot(s:DeckState,slot:number,unresolved:ReadonlySet<PaneKey>,now:number,uncertaintyKnown=false):{state:DeckState;cleared:boolean;reason?:'empty'|'unresolved'|'unavailable'|'capacity'}{
 const entry=s.slots[slot];if(!entry)return{state:s,cleared:false,reason:'empty'};
 if(unresolved.has(paneOfKey(entry.key)))return{state:s,cleared:false,reason:'unresolved'};
 if(!Number.isInteger(slot)||!Number.isFinite(now)||now<0||!uncertaintyKnown||!s.uncertaintyKnown||s.restore==='blocked')return{state:s,cleared:false,reason:'unavailable'};
 const candidate={...s,slots:s.slots.map((v,i)=>i===slot?null:v),reassignAfter:s.reassignAfter.map((v,i)=>i===slot?now+CLEAR_COOLDOWN_MS:v),dismissed:[...new Set([...s.dismissed,entry.key])]};
 // Refuse the operation before mutating state; never discard old dismissals to make room.
 try{serializeDeck(candidate,now);}catch(error){return{state:s,cleared:false,reason:error instanceof Error&&error.message==='deck_store_overflow'?'capacity':'unavailable'};}
 return {state:candidate,cleared:true};
}
/** Counts by what each row shows (Orca's row display): monitoring apart from working, unproven rows with unknown. */
function countKinds(kinds:readonly AgentDisplayKind[],attention:number){
 const n=(...wanted:AgentDisplayKind[])=>kinds.filter(kind=>wanted.includes(kind)).length;
 return{attention,working:n('working','stopping'),monitoring:n('monitoring'),done:n('done'),unknown:n('unknown','unconfirmed','stale')};
}
export type LinkKind='LIVE'|'STALE'|'OFFLINE'|'UNPAIRED';
export interface DeckContext extends DeckInventory {now:number;confirmedAt:number;link:LinkKind;journalReady:boolean;busy:boolean;caps:{input:boolean;approve:boolean;speech:boolean};unresolvedCount:number|null;confirmationOpen?:boolean}
/** Optional project layout: keys and stepping order come from the focused Orca project instead of global slots. */
export interface DeckLayout {keys:readonly(ItemKey|null)[];items:readonly ItemKey[]}
/**
 * Counts are this host's rows whenever the deck is online; `partial` says another host was omitted (or the listing is
 * not proven complete), and the face marks the counts as a lower bound instead of hiding them. Absence decisions still
 * require completeness (reconcileDeck), never these counts.
 */
export function deriveDeckView(s:DeckState,c:DeckContext,layout?:DeckLayout){
 const age=c.now-c.confirmedAt;
 const online=c.live&&s.generation===c.generation&&c.link==='LIVE'&&Number.isFinite(age)&&age>=0&&age<=READ_FRESH_MS;
 const {rows,duplicates}=indexAgents(c.agents),readable=new Set(online?s.present.filter(k=>rows.has(k)&&!duplicates.has(k)):[]),items=online?(layout?[...layout.items]:itemsInOrder(s)).filter(k=>readable.has(k)):[],selected=online&&s.selected&&readable.has(s.selected)?rows.get(s.selected):undefined;
 const attention=online?s.order.filter(k=>readable.has(k)&&rows.has(k)&&attentionScore(rows.get(k)!)>0):[];
 const slots=layout?layout.keys.map(key=>key?{key,ignoreUntil:0}:null):s.slots;
 const keyed=new Set(slots.flatMap(v=>v?[v.key]:[])),keyless=items.filter(k=>!keyed.has(k));
 const unresolved=!!selected&&c.unresolvedPanes.has(paneKey(selected));
 const inputLocks:string[]=[];
 if(!online)inputLocks.push('offline');if(!selected||selected.state==='unknown')inputLocks.push('unknown');
 if(selected){if(!selected.target.terminalId)inputLocks.push('target');if(!['codex','claude'].includes(selected.provider))inputLocks.push('provider');if(selected.state==='permission'||selected.eventType==='permission_request'||selected.permissionEvidence==='structured_verified')inputLocks.push('permission');if(selected.state==='question'||selected.eventType==='user_question')inputLocks.push('question');if(selected.requestId)inputLocks.push('request');}
 if(unresolved)inputLocks.push('unresolved');if(c.busy)inputLocks.push('busy');if(!c.journalReady||!c.uncertaintyKnown||!s.uncertaintyKnown)inputLocks.push('journal');
 const at=s.selected?items.indexOf(s.selected):-1,dial=s.selected?attention.indexOf(s.selected):-1;
 return {
  keys:slots.map((entry,slot)=>{const agent=online&&entry&&readable.has(entry.key)?rows.get(entry.key):undefined;return{slot,index:slot+1,key:entry?.key??null,assigned:!!entry,agent:agent??null,state:agent?.state??'unknown',selected:!!entry&&entry.key===s.selected&&online,unresolved:!!entry&&c.unresolvedPanes.has(paneOfKey(entry.key)),ignoring:!!entry&&entry.ignoreUntil>c.now,absent:!!entry&&!s.present.includes(entry.key)};}),
  display:{agent:selected??null,monitoring:selected?.monitoring===true,updatedAt:selected?.updatedAt,name:selected?.title??null,provider:selected?.provider??null,state:selected?.state??'unknown',position:at<0?null:{n:at+1,m:items.length},dial:dial<0?null:{n:dial+1,m:attention.length},partial:online&&!(c.complete&&s.complete),counts:online?countKinds(items.map(k=>{const a=rows.get(k);return a?agentDisplay(a,c.now).kind:'unknown';}),attention.length):null,unresolved:c.uncertaintyKnown&&s.uncertaintyKnown?c.unresolvedCount:null,link:c.link,keyless:keyless.length,keylessAttention:keyless.filter(k=>attention.includes(k)).length},
  // worktree.ps cannot prove a terminal-pane to native-request join. Approval stays unavailable here.
  commands:{allow:false,reject:false,content:!!selected,input:c.caps.input&&inputLocks.length===0,inputLocks,nextDecision:{lit:online&&attention.length>0,count:online?attention.length:null},list:{lit:online&&items.length>0,count:online?items.length:null},reconnect:c.link==='STALE'||c.link==='OFFLINE',scanQr:c.link==='UNPAIRED',voice:online&&c.journalReady&&c.uncertaintyKnown&&s.uncertaintyKnown&&c.caps.speech&&!c.confirmationOpen}
 };
}
export type DeckView=ReturnType<typeof deriveDeckView>;
const utf8Size=(text:string)=>{let bytes=0;for(const ch of text){const cp=ch.codePointAt(0)!;bytes+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;}return bytes;};
/** Only identity/quarantine/dismissal metadata is encoded. Never serialize the view, agents or drafts. */
export function serializeDeck(s:DeckState,now:number):string {
 if(s.restore==='blocked'||!Number.isFinite(now)||now<0)throw new Error('deck_store_unavailable');
 const value=JSON.stringify({format:1,slots:s.slots.map(k=>k?.key??null),quarantine:s.reassignAfter.map(t=>Math.min(CLEAR_COOLDOWN_MS,Math.max(0,t-now))),dismissed:s.dismissed});
 if(utf8Size(value)>65536)throw new Error('deck_store_overflow');
 if(restoreDeck(value,now).restore==='blocked')throw new Error('deck_store_invalid');return value;
}
/** Memory-only store ACK identity: stable during quarantine, with one final transition at expiry. */
export function deckStoreFingerprint(s:DeckState,now:number):string {
 serializeDeck(s,now); // Keep the exact persisted metadata validation and size boundary first.
 if(!s.reassignAfter.every(Number.isFinite))throw new Error('deck_store_invalid');
 return JSON.stringify({slots:s.slots.map(k=>k?.key??null),dismissed:s.dismissed,quarantine:s.reassignAfter.map(t=>t>now?t:0)});
}
export function restoreDeck(raw:string|null,now:number):DeckState {
 const blocked=():DeckState=>({...emptyDeckState(),restore:'blocked'});
 if(raw===null)return emptyDeckState();if(typeof raw!=='string'||raw.length>65536||!Number.isFinite(now)||now<0)return blocked();
 const validKey=(value:unknown):value is ItemKey=>{if(typeof value!=='string'||value.length>8192)return false;try{const a=JSON.parse(value);return Array.isArray(a)&&a.length===4&&['codex','claude','other'].includes(a[0])&&a.slice(1,3).every(v=>typeof v==='string'&&v.length>0&&v.length<=2048)&&(a[3]===null||typeof a[3]==='string'&&a[3].length>0&&a[3].length<=2048||Array.isArray(a[3])&&a[3].length===4&&a[3][0]==='native'&&a[3].slice(1).every((part:unknown)=>typeof part==='string'&&part.length>0&&part.length<=2048))&&JSON.stringify(a)===value;}catch{return false;}};
 try{
  if(utf8Size(raw)>65536)return blocked();const v=JSON.parse(raw);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='dismissed,format,quarantine,slots'||v.format!==1||!Array.isArray(v.slots)||v.slots.length!==6||!v.slots.every((k:unknown)=>k===null||validKey(k))||!Array.isArray(v.quarantine)||v.quarantine.length!==6||!v.quarantine.every((t:unknown)=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<=CLEAR_COOLDOWN_MS)||!Array.isArray(v.dismissed)||!v.dismissed.every(validKey))return blocked();
  const order=v.slots.filter((k:unknown)=>k!==null);if(new Set(order).size!==order.length||new Set(v.dismissed).size!==v.dismissed.length)return blocked();
  return {...emptyDeckState(),slots:v.slots.map((key:ItemKey|null)=>key?{key,ignoreUntil:now+FLASH_IGNORE_MS}:null),order,validationPending:order,reassignAfter:v.quarantine.map((t:number)=>now+t),dismissed:v.dismissed,restore:'waiting'};
 }catch{return blocked();}
}
