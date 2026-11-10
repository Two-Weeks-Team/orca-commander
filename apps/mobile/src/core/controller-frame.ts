import {READ_FRESH_MS} from './read-freshness';
import type {AgentSnapshot} from './types';
import type {LinkKind} from './deck-model';

interface BaseIdentity {hostId:string;generation:number;worktreeId:string}
export interface PaneFocus extends BaseIdentity {kind:'pane';paneKey:string}
export interface NativeFocus extends BaseIdentity {kind:'native';tabId:string;sessionId:string;itemId:string;revision:number}
export type FrameFocus=(PaneFocus|NativeFocus)&{provider:string;title:string;state:AgentSnapshot['state'];position:{n:number;m:number}|null};
export type FullIdentity=(PaneFocus&{hostVersion:string;handle:string;incarnationId:string})|(NativeFocus&{hostVersion:string;fence:number;publisher:string;epoch:string});
export type ControllerPhase='idle'|'listening'|'transcribing'|'draft'|'armed'|'refused'|'outcome';
export interface FrameSemantic {
 link:LinkKind;phase:ControllerPhase;focus:FrameFocus|null;
 counts:{attention:number;working:number;done:number;unknown:number}|null;
 voice:{phase:'idle'|'listening'|'transcribing'|'draft'|'failed'|'unavailable';modelLabel?:string;local?:boolean};
 outcome:{unresolved:number|null;focusedUnresolved:number|null;status?:string};
 draft?:{text:string;origin:'typed'|'voice';target:FrameFocus|null};
 armed?:{action:'input'|'native_reply'|'allow'|'reject'|'allow_session'|'stop';target:FullIdentity;content:string;openedAt:number;origin:'typed'|'voice'};
}
export interface ControllerFrame extends FrameSemantic {
 id:string;issuedAt:number;channelConfirmedAt:number;
 /** Memory-only comparison value; neither frames nor this value may be persisted or logged. */
 semanticKey:string;
}
const canonical=(v:unknown):string=>{
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>JSON.stringify(key)+':'+canonical(value)).join(',')+'}';
};
/** Per-field preview budgets are code points. Full identity, draft, request and armed content have no clipping API. */
export const FRAME_PREVIEW_LIMITS={title:80,summary:240} as const;
export function previewField(field:keyof typeof FRAME_PREVIEW_LIMITS,value:string){
 const points=Array.from(value),limit=FRAME_PREVIEW_LIMITS[field];
 return {text:points.length>limit?points.slice(0,limit).join('')+'…':value,fullLength:points.length,truncated:points.length>limit};
}
const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** Read freshness controls display; semantic identity controls this frame. Writes need new host evidence in their action owner. */
export function deriveControllerFrame(previous:ControllerFrame|null,input:FrameSemantic,clock:{now:number;confirmedAt:number;channelConfirmedAt:number},nextId:()=>string):ControllerFrame {
 const age=clock.now-clock.confirmedAt,live=input.link==='LIVE'&&Number.isFinite(age)&&age>=0&&age<=READ_FRESH_MS;
 const semantic:FrameSemantic=JSON.parse(JSON.stringify(input));
 if(!live){semantic.link=input.link==='LIVE'?'STALE':input.link;semantic.focus=null;semantic.counts=null;semantic.voice={phase:'unavailable'};semantic.armed=undefined;semantic.phase='idle';}
 const semanticKey=canonical(semantic);
 return freeze({...semantic,id:previous?.semanticKey===semanticKey?previous.id:nextId(),issuedAt:clock.now,channelConfirmedAt:clock.channelConfirmedAt,semanticKey});
}
export type FrameCheck={ok:true}|{ok:false;reason:'target_changed'|'not_connected'|'channel_stale'|'unresolved'|'journal_unavailable'};
export function checkFrame(frame:ControllerFrame,shownFrameId:string,now:number,write=false):FrameCheck {
 if(frame.id!==shownFrameId)return{ok:false,reason:'target_changed'};
 if(!Number.isFinite(now)||now<0)return{ok:false,reason:'target_changed'};
 if(frame.link!=='LIVE')return{ok:false,reason:'not_connected'};
 if(write){
  if(frame.phase!=='armed'||!frame.armed)return{ok:false,reason:'target_changed'};
  if(frame.outcome.unresolved===null||frame.outcome.focusedUnresolved===null)return{ok:false,reason:'journal_unavailable'};
  if(frame.outcome.focusedUnresolved>0)return{ok:false,reason:'unresolved'};
 }
 return{ok:true};
}
export interface VerifiedNativeFocus extends NativeFocus {verified:boolean;supported:boolean}
/** There is no pane/native-session join in the validated current fields. Matching a title or worktree is insufficient. */
export function resolveNativeTarget(focus:PaneFocus|NativeFocus,inventory:readonly VerifiedNativeFocus[]):VerifiedNativeFocus|null {
 if(focus.kind!=='native')return null;
 const matches=inventory.filter(row=>row.kind==='native'&&row.hostId===focus.hostId&&row.generation===focus.generation&&row.worktreeId===focus.worktreeId&&row.tabId===focus.tabId&&row.sessionId===focus.sessionId&&row.itemId===focus.itemId&&row.revision===focus.revision);
 return matches.length===1&&matches[0].verified&&matches[0].supported?matches[0]:null;
}
