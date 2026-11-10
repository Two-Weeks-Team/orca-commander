export interface TerminalReplyTarget {worktreeId:string;paneKey:string;handle:string;incarnationId:string}
export interface TerminalReplyEvidence {publication:{epoch:string;version:number};target:TerminalReplyTarget;state:string;stateStartedAt:number;updatedAt:number;body:string|null;knownToolOutput:boolean;turnEndedAt?:number;turnEndDisposition?:'identified'|'ambiguous';interrupted:boolean;sessionBoundary:boolean;unconfirmed?:true;stopping?:true}
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const date=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=8.64e15;
/** Exact, read-only pane evidence only. A missing tool flag is not positive proof of a new message. */
export function parseTerminalReply(raw:unknown,target:TerminalReplyTarget):TerminalReplyEvidence|undefined{
 if(!rec(raw)||raw.worktree!==target.worktreeId||typeof raw.publicationEpoch!=='string'||!raw.publicationEpoch||raw.publicationEpoch==='none'||raw.publicationEpoch.startsWith('none:')||!Number.isSafeInteger(raw.snapshotVersion)||Number(raw.snapshotVersion)<0||!Array.isArray(raw.tabs))return;
 const matches=raw.tabs.filter(t=>rec(t)&&t.type==='terminal'&&typeof t.parentTabId==='string'&&typeof t.leafId==='string'&&`${t.parentTabId}:${t.leafId}`===target.paneKey);
 if(matches.length!==1)return;
 const tab=matches[0];if(!rec(tab)||tab.terminal!==target.handle||tab.incarnationId!==target.incarnationId||!rec(tab.agentStatus))return;
 const a=tab.agentStatus;
 const main=a.mainAgent;
 if(main!==undefined&&(!rec(main)||!['idle','working','waiting','done'].includes(String(main.state))||!date(main.stateStartedAt)))return;
 if(rec(main)&&main.stopping!==undefined&&typeof main.stopping!=='boolean')return;
 const own=rec(main)?main:undefined,outcome=own?.state==='done'?own.outcome:undefined;
 if(outcome!==undefined&&!['success','failure','cancellation','unconfirmed'].includes(String(outcome)))return;
 if(a.restoredUnconfirmed!==undefined&&typeof a.restoredUnconfirmed!=='boolean')return;
 if(a.paneKey!==target.paneKey||a.terminalHandle!==undefined&&a.terminalHandle!==target.handle||a.worktreeId!==undefined&&a.worktreeId!==target.worktreeId||!['idle','working','waiting','done'].includes(String(a.state))||!date(a.stateStartedAt)||!date(a.updatedAt))return;
 if(a.lastAssistantMessage!==undefined&&(typeof a.lastAssistantMessage!=='string'||a.lastAssistantMessage.length>65536)||a.lastAssistantMessageIsToolOutput!==undefined&&typeof a.lastAssistantMessageIsToolOutput!=='boolean'||a.turnEndedAt!==undefined&&!date(a.turnEndedAt)||a.turnEndDisposition!==undefined&&!['identified','ambiguous'].includes(String(a.turnEndDisposition))||a.interrupted!==undefined&&typeof a.interrupted!=='boolean'||a.sessionBoundary!==undefined&&typeof a.sessionBoundary!=='boolean')return;
 return{publication:{epoch:raw.publicationEpoch,version:Number(raw.snapshotVersion)},target:{worktreeId:target.worktreeId,paneKey:target.paneKey,handle:target.handle,incarnationId:target.incarnationId},state:String(own?.state??a.state),stateStartedAt:own?Number(own.stateStartedAt):a.stateStartedAt,updatedAt:a.updatedAt,body:typeof a.lastAssistantMessage==='string'?a.lastAssistantMessage:null,knownToolOutput:a.lastAssistantMessageIsToolOutput===true,interrupted:a.interrupted===true||outcome==='cancellation',sessionBoundary:a.sessionBoundary===true,...(a.restoredUnconfirmed===true||outcome==='unconfirmed'?{unconfirmed:true as const}:{}),...(own?.stopping===true?{stopping:true as const}:{}),...(date(a.turnEndedAt)?{turnEndedAt:a.turnEndedAt}:{}),...(a.turnEndDisposition==='identified'||a.turnEndDisposition==='ambiguous'?{turnEndDisposition:a.turnEndDisposition}:{})};
}
