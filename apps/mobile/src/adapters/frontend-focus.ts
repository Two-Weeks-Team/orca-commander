import type {DesktopFocus} from '../core/project-focus';
/** Local request times bound the lifetime; host wall clocks are metadata, never freshness authority. */
export interface FrontendFocus extends DesktopFocus {
 tabId:string;observedAt:number;expiresAt:number;activationSequence:number;focusedAt:number;
 source:{clientId:string;windowId:string};
}
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const id=(v:unknown,max=256):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
export function currentFrontendFocus(focus:FrontendFocus|undefined,now:number):FrontendFocus|undefined{
 return focus&&finite(now)&&now>=focus.observedAt&&now<focus.expiresAt?focus:undefined;
}
/** Copies only the identity projection. Unknown/ambiguous/malformed/delayed reads carry no focus. */
export function parseFrontendFocus(value:unknown,issuedAt:number,receivedAt:number):FrontendFocus|undefined{
 if(!rec(value)||value.schema!==1||value.status!=='verified'||!finite(value.observedAt)||!finite(issuedAt)||!finite(receivedAt))return;
 const s=value.selection;if(!rec(s)||!id(s.worktreeId,4096)||!id(s.tabId)||s.tabId.includes(':')||s.leafId!==undefined&&(!id(s.leafId)||s.leafId.includes(':'))||!finite(s.focusedAt)||!Number.isSafeInteger(s.activationSequence)||Number(s.activationSequence)<0||!finite(s.lastSeenAt)||!finite(s.freshForMs)||s.freshForMs<=0||!rec(s.source)||!id(s.source.clientId)||!id(s.source.windowId))return;
 const focus:FrontendFocus={worktreeId:s.worktreeId,tabId:s.leafId?`${s.tabId}:${s.leafId}`:s.tabId,observedAt:issuedAt,expiresAt:issuedAt+Math.min(s.freshForMs,30_000),focusedAt:s.focusedAt,activationSequence:Number(s.activationSequence),source:{clientId:s.source.clientId,windowId:s.source.windowId}};
 return currentFrontendFocus(focus,receivedAt);
}
