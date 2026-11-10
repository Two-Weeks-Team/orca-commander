import {isRecord} from './structured-request-wire';

/** Diagnostic metadata only; release labels never authorize a write. */
export type HostDefaultAgentVersion=string;

/** Verified original launch routing, not a generic background text-generation API. */
export const HOST_DEFAULT_AGENT_CAPABILITIES=Object.freeze([
 'agent.launch.v2','agent.launch.replay-required.v1','agent.launch.prompt-carry.v1','agent.launch.surface.v1',
 'agent-session.structured.v1','agent-session.current-requests.v1','agent-session.structured.client-launch-mode.v1',
] as const);
export interface HostDefaultSelection{agent:'codex';hostId:string;hostVersion:HostDefaultAgentVersion;generation:number}
export type DefaultSelectionResult={ok:true;agent:'codex'}|{ok:false;reason:'automatic'|'none'|'disabled'|'unsupported'|'unavailable'};

/** Project only the selection. Other settings can contain custom command/argument/environment text. */
export function readHostDefaultSelection(value:unknown):DefaultSelectionResult{
 if(!isRecord(value)||!isRecord(value.settings))return{ok:false,reason:'unavailable'};
 const settings=value.settings,agent=settings.defaultTuiAgent,disabled=settings.disabledTuiAgents;
 if(!Array.isArray(disabled)||!disabled.every(v=>typeof v==='string')||agent===undefined)return{ok:false,reason:'unavailable'};
 if(agent===null)return{ok:false,reason:'automatic'};
 if(agent==='blank')return{ok:false,reason:'none'};
 if(typeof agent!=='string')return{ok:false,reason:'unavailable'};
 if(disabled.includes(agent))return{ok:false,reason:'disabled'};
 return agent==='codex'?{ok:true,agent}:{ok:false,reason:'unsupported'};
}

export function hasHostDefaultAgentLaunchSupport(value:unknown,_hostVersion?:string):boolean{
 if(!isRecord(value)||!Array.isArray(value.capabilities))return false;
 const capabilities=value.capabilities;
 return capabilities.every(v=>typeof v==='string')&&HOST_DEFAULT_AGENT_CAPABILITIES.every(v=>capabilities.includes(v));
}

export interface HostDefaultLaunchParams{
 agent:'codex';operationId:string;target:{kind:'existing';worktree:string};surface:'chat';prompt:{text:string;delivery:'submit'};
}
/** Full prompt stays verbatim; this builder alone grants no host/target/confirmation authority. */
export function buildHostDefaultAgentLaunch(input:{worktreeId:string;operationId:string;prompt:string}):HostDefaultLaunchParams|null{
 if(typeof input.worktreeId!=='string'||!input.worktreeId||input.worktreeId.startsWith('id:')||input.worktreeId.length>4096||
  typeof input.operationId!=='string'||!/^\d{13}-[0-9a-f]{32}$/.test(input.operationId)||typeof input.prompt!=='string'||!input.prompt.trim())return null;
 const prompt={text:input.prompt,delivery:'submit' as const};
 if(new TextEncoder().encode(JSON.stringify(prompt)).byteLength>256*1024)return null;
 return{agent:'codex',operationId:input.operationId,target:{kind:'existing',worktree:'id:'+input.worktreeId},surface:'chat',prompt};
}

export type HostDefaultLaunchResult={kind:'journaled';sessionId:string;messageId:string;reason:string;warning?:string}|{kind:'unknown'};
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=4096;
/** RPC correlation is original transport-owned. The result does not echo an operation ID or prove completion. */
export function readHostDefaultAgentLaunchResult(value:unknown,worktreeId:string):HostDefaultLaunchResult{
 if(!isRecord(value)||value.worktreeId!==worktreeId||!isRecord(value.outcome)||!isRecord(value.receipt)||!isRecord(value.prompt))return{kind:'unknown'};
 const outcome=value.outcome,receipt=value.receipt,prompt=value.prompt;
 if(outcome.kind!=='structured'||!nonempty(outcome.handle)||!nonempty(outcome.sessionId)||!outcome.sessionId.startsWith('codex_')||outcome.sessionId.length<=6||
  receipt.mode!=='structured'||receipt.preferred!=='structured'||typeof receipt.reason!=='string'||typeof receipt.detail!=='string'||
  prompt.delivery!=='submit'||prompt.outcome!=='journaled'||!nonempty(prompt.messageId)||value.warning!==undefined&&typeof value.warning!=='string')return{kind:'unknown'};
 return{kind:'journaled',sessionId:outcome.sessionId,messageId:prompt.messageId,reason:receipt.reason,...(typeof value.warning==='string'?{warning:value.warning}:{})};
}
