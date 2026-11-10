import {sha256} from '../upstream/orca-1.4.245/src/shared/sha256';
import {parseTabsSnapshot,type TabsPublication} from './orca-read-model';
import type {RpcTransport} from './read-only-orca-client';

export const STRUCTURED_CAPABILITIES=['agent-session.structured.v1','agent-session.current-requests.v1'] as const;
export const CLAUDE_READ_CAPABILITY='agent-session.structured.claude.v1';
export interface NativeTarget{worktreeId:string;tabId:string;sessionId:string;agent:string;title:string}
export interface RequestItem{itemId:string;revision:number;body:Record<string,unknown>&{kind:'approval'|'question';options:(Record<string,unknown>&{id:string;label:string})[]};supported:boolean}
export interface RequestMarker{contract:string;sessionId:string;epoch:string;publisher:string;revision:number;owner:string;version:string}
export interface RequestEvidence{target:NativeTarget;fence:number;marker:RequestMarker;items:RequestItem[]}
export class StructuredRequestError extends Error{constructor(readonly code:'invalid_evidence'|'unsupported'){super(code);this.name='StructuredRequestError';}}
const fail=():never=>{throw new StructuredRequestError('invalid_evidence');};
export const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const text=(v:unknown,max=512):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const markerKeys=['contract','sessionId','epoch','publisher','revision','owner','version'] as const;
function parseMarker(v:unknown,id:string,epoch:string):RequestMarker{
 if(!isRecord(v)||v.contract!==STRUCTURED_CAPABILITIES[1]||v.sessionId!==id||v.epoch!==epoch||!['sessionId','epoch','publisher','owner','version'].every(k=>text(v[k]))||!Number.isSafeInteger(v.revision)||(v.revision as number)<0)return fail();
 return {contract:v.contract,sessionId:id,epoch,publisher:v.publisher as string,revision:v.revision as number,owner:v.owner as string,version:v.version as string};
}
export function parseNativeTargets(value:unknown,worktreeId:string):{targets:NativeTarget[];publication:TabsPublication}{
 const parsed=parseTabsSnapshot(value);if(!parsed.ok||parsed.snapshot.worktree!==worktreeId||!parsed.snapshot.complete||!isRecord(value)||!Array.isArray(value.tabs))return fail();
 const ids=new Set<string>(),sessions=new Set<string>(),targets:NativeTarget[]=[];
 for(const row of value.tabs){if(!isRecord(row)||!text(row.id)||ids.has(row.id))return fail();ids.add(row.id);if(row.type!=='agent-session')continue;
  if(!text(row.sessionId)||!text(row.agent,80)||sessions.has(row.sessionId)||typeof row.title!=='string'||row.title.length>64*1024)return fail();sessions.add(row.sessionId);
  targets.push({worktreeId,tabId:row.id,sessionId:row.sessionId,agent:row.agent,title:row.title});
 }
 return {targets,publication:parsed.snapshot.publication};
}
function parseItems(value:unknown,agent:string):RequestItem[]{
 if(!Array.isArray(value)||value.length>128)return fail();const ids=new Set<string>();
 return value.map(row=>{
  if(!isRecord(row)||!text(row.itemId)||!positive(row.revision)||ids.has(row.itemId)||!isRecord(row.body))return fail();ids.add(row.itemId);
  const b=row.body;if(!['approval','question'].includes(String(b.kind))||!isRecord(b.resolution)||b.resolution.state!=='pending'||b.resolution.selectedOptionId!==null||b.resolution.resolvedBy!==null||b.resolution.resolvedAt!==null||!Array.isArray(b.options)||b.options.length>64)return fail();
  if(b.kind==='approval'&&(!text(b.title,2_000_000)||b.detail!==null&&typeof b.detail!=='string')||b.kind==='question'&&!text(b.question,2_000_000))return fail();
  const optionIds=new Set<string>();const options=b.options.map(o=>{if(!isRecord(o)||!text(o.id,1024)||!text(o.label,2_000_000)||optionIds.has(o.id))return fail();optionIds.add(o.id);return {...o,id:o.id,label:o.label};});
  // This slice has live Codex command-approval proof. Plans/unknown subjects and question writes need separate proof.
  const labels:Record<string,string>={accept:'Allow',acceptForSession:'Allow for this session',decline:'Deny',cancel:'Stop'};
  // Pinned command choices differ from MCP elicitation: MCP cancel is Deny, even when its message spoofs the command title.
  const supported=agent==='codex'&&b.kind==='approval'&&b.subject===undefined&&b.title==='Run a command?'&&options.length>0&&options.every(o=>Object.hasOwn(labels,o.id)&&labels[o.id]===o.label);
  return {itemId:row.itemId,revision:row.revision,body:{...b,kind:b.kind as 'approval'|'question',options},supported};
 });
}
/** Bounded, complete original currentRequests read. A replacement marker requires a fresh owner read. */
export async function readRequestEvidence(transport:RpcTransport,target:NativeTarget,onSnapshot?:(snapshot:unknown)=>void):Promise<RequestEvidence>{
 if(!transport.readStructuredSnapshot)throw new StructuredRequestError('unsupported');
 const s=await transport.readStructuredSnapshot(target.sessionId);
 if(!isRecord(s)||s.type!=='snapshot'||s.sessionId!==target.sessionId||!isRecord(s.page)||s.page.sessionId!==target.sessionId||!text(s.page.epoch)||!positive(s.fence))return fail();
 const marker=parseMarker(s.currentRequests,target.sessionId,s.page.epoch);let cursor=0,total=0;const chunks:string[]=[];
 onSnapshot?.(s);
 for(let i=0;i<128;i++){
  const p=await transport.request('agentSession.currentRequests',{sessionId:target.sessionId,version:marker.version,cursor});
  if(!isRecord(p)||p.restart!==undefined||!isRecord(p.marker)||markerKeys.some(k=>(p.marker as Record<string,unknown>)[k]!==marker[k])||typeof p.json!=='string')return fail();
  total+=p.json.length;if(total>2_000_000)return fail();chunks.push(p.json);
  if(p.nextCursor===null){let value:unknown;try{value=JSON.parse(chunks.join(''));}catch{return fail();}return {target:{...target},fence:s.fence,marker,items:parseItems(value,target.agent)};}
  if(!Number.isSafeInteger(p.nextCursor)||(p.nextCursor as number)<=cursor)return fail();cursor=p.nextCursor as number;
 }
 return fail();
}

// Adapted from pinned src/shared/structured-agent-session-mutation.ts (MIT, Lovecast Inc.).
// Exact original wire canonicalization and operation ID format; sha256 itself is a byte-for-byte vendor copy.
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value??null);
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 return `{${Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
export function structuredFingerprint(method:string,sessionId:string,fields:Record<string,unknown>):string{
 return Array.from(sha256(new TextEncoder().encode(canonical({method,sessionId,fields}))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function structuredOperationId(uuid:()=>string,now=Date.now()):string{
 const timestamp=Math.trunc(now).toString(),entropy=uuid().replaceAll('-','').toLowerCase();
 if(!/^\d{13}$/.test(timestamp)||!/^[0-9a-f]{32}$/.test(entropy))return fail();return `${timestamp}-${entropy}`;
}
