import type {ActionChannel} from './action-client';
import type {RpcTransport} from './read-only-orca-client';
export type ActionConnection=Pick<ActionChannel,'transport'|'hostId'|'runtimeId'|'generation'>;
export type RefreshActionChannel=(expected:ActionConnection)=>Promise<ActionChannel|null>;
export const sameActionConnection=(a:ActionConnection,b:ActionConnection)=>a.transport===b.transport&&a.hostId===b.hostId&&a.runtimeId===b.runtimeId&&a.generation===b.generation;
/** A captured connection owns the new read; a cache getter alone can never supply it. */
export async function refreshBoundActionChannel(c:ActionChannel,current:()=>ActionChannel|null,refresh:RefreshActionChannel|undefined):Promise<ActionChannel|null>{
 const expected:ActionConnection={transport:c.transport,hostId:c.hostId,runtimeId:c.runtimeId,generation:c.generation};
 const before=current();if(!refresh||!before||!sameActionConnection(expected,before))return null;
 try{const fresh=await refresh(expected),after=current();return fresh&&after&&sameActionConnection(expected,fresh)&&sameActionConnection(expected,after)?{...fresh}:null;}catch{return null;}
}
export class CapabilityNegotiationError extends Error{constructor(readonly reason:'target_changed'|'capability_unavailable'){super(reason);this.name='CapabilityNegotiationError';}}
interface Negotiation {runtimeId:string;generation:number;hostId:string;wanted:Set<string>;confirmed:Set<string>;queue:Promise<unknown>}
const transports=new WeakMap<RpcTransport,Negotiation>();
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** One monotonic implemented-capability union per authenticated connection, never restored from a release label. */
export function ensureTransportCapabilities(channel:ActionChannel,required:readonly string[],advertised:readonly string[],current:()=>ActionChannel|null):Promise<void>{
 const {transport,runtimeId,generation,hostId}=channel;
 const bound=()=>{const next=current();return typeof runtimeId==='string'&&runtimeId.length>0&&Number.isSafeInteger(generation)&&generation>=0&&!!next&&next.transport===transport&&next.runtimeId===runtimeId&&next.generation===generation&&next.hostId===hostId;};
 const assertBound=()=>{try{if(bound())return;}catch{/* A closed or superseded owner is a target change. */}throw new CapabilityNegotiationError('target_changed');};
 let state=transports.get(transport);
 if(!state||state.runtimeId!==runtimeId||state.generation!==generation||state.hostId!==hostId){state={runtimeId,generation,hostId,wanted:new Set(state?.wanted),confirmed:new Set(),queue:state?.queue??Promise.resolve()};transports.set(transport,state);}
 for(const value of advertised)state.wanted.add(value);
 const shared=state;
 const result=shared.queue.catch(()=>undefined).then(async()=>{
  assertBound();
  const status=await transport.request('status.get',{});
  assertBound();
  if(record(status)&&typeof status.runtimeId==='string'&&status.runtimeId!==runtimeId)throw new CapabilityNegotiationError('target_changed');
  if(!record(status)||status.runtimeId!==runtimeId||!Array.isArray(status.capabilities)||!status.capabilities.every(value=>typeof value==='string')||!required.every(value=>(status.capabilities as string[]).includes(value)))throw new CapabilityNegotiationError('capability_unavailable');
  if([...shared.wanted].every(value=>shared.confirmed.has(value)))return;
  const clientCapabilities=[...shared.wanted].sort();
  const echo=await transport.request('runtime.clientCapabilities.update',{clientCapabilities});
  assertBound();
  if(!record(echo)||!Array.isArray(echo.clientCapabilities)||echo.clientCapabilities.length!==clientCapabilities.length||!clientCapabilities.every(value=>(echo.clientCapabilities as unknown[]).includes(value)))throw new CapabilityNegotiationError('capability_unavailable');
  shared.confirmed=new Set(clientCapabilities);
 });
 shared.queue=result.catch(()=>undefined);return result;
}
