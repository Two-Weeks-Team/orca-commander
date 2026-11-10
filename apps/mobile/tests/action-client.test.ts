import { createTestActionClient } from './helpers/create-action-client';
import { type ActionChannel } from '../src/adapters/action-client';
import type { AgentSnapshot } from '../src/core/types';

let count=0;
function check(value:unknown,message:string) { count++; if(!value) throw new Error(message); }
const time=Date.parse('2026-11-02T15:00:00Z');
const agent:AgentSnapshot={id:'a',provider:'codex',title:'Owner task',summary:'Ready',state:'idle',eventType:'informational',updatedAt:new Date(time).toISOString(),target:{hostId:'host',connectionGeneration:1,worktreeId:'wt',terminalId:'tab:leaf'}};
const terminal={handle:'term_exact',incarnationId:'incarnation-1',worktreeId:'wt',tabId:'tab',leafId:'leaf',connected:true,writable:true,executionHostId:'local'};
async function main(){
 let now=time;let current:ActionChannel|null;let rows=[{...terminal}];let reply:unknown={send:{accepted:true,writeSettlement:{outcome:'accepted'}}};let sendCount=0;let params:Record<string,unknown>|undefined;const writes:Record<string,unknown>[]=[];
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.245',hostId:'host',generation:1,confirmedAt:time,agents:[agent],transport:{acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),async request(method,p){if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};if(method==='terminal.list')return{terminals:rows,truncated:false};if(method==='terminal.send'){sendCount++;params=p;if(p)writes.push(p);if(reply instanceof Error)throw reply;if(typeof reply==='function')return reply(p);return reply;}throw new Error('Unexpected method');}}};
 current=channel;
 {const slow=createTestActionClient(()=>current,()=>now),p=await slow.prepare(agent,'Slow review');check(p.ok,'D29 prepare slow typed review');if(!p.ok)return;now+=300000;channel.confirmedAt=now;check((await slow.confirm(p.confirmation)).status==='accepted','D29 same typed target after five minutes sends once');check(sendCount===2,'D29 body and Enter once');now=time;channel.confirmedAt=time;sendCount=0;writes.length=0;}

 // A cached getter is not enough: the explicit new-read owner can refuse the same-looking channel.
 {let valid=true,reads=0;const c=createTestActionClient(()=>current,()=>now,async()=>{},undefined,async()=>{reads++;return valid?current:null;});const p=await c.prepare(agent,'Fresh owner test');check(p.ok,'D29 prepares through explicit new-read port');if(!p.ok)return;valid=false;const before=sendCount;check((await c.confirm(p.confirmation)).status==='target_changed'&&sendCount===before,'D29 failed new read sends zero despite identical cached channel');check(reads===2,'D29 preparation and hold both require a new read');check((await c.confirm(p.confirmation)).status==='already_submitted','failed read does not rearm a consumed ticket');}

 // New read changes are authoritative even when the old review was held for five minutes.
 for(const change of ['runtime','generation','state','pane','incarnation'] as const){
  let mutate=false;const c=createTestActionClient(()=>current,()=>now,async()=>{},undefined,async()=>{
   if(mutate){if(change==='incarnation')rows=[{...terminal,incarnationId:'new-incarnation'}];
    else current={...channel,...(change==='runtime'?{runtimeId:'new-runtime'}:change==='generation'?{generation:2}:{agents:[{...agent,...(change==='state'?{stateSince:'new-state'}:{target:{...agent.target,terminalId:'other:leaf'}})}]})};}
   return current;
  });const p=await c.prepare(agent,'Changed fresh target');check(p.ok,'D29 changed target fixture prepares');if(!p.ok)return;
  mutate=true;now+=300000;const before=sendCount;check((await c.confirm(p.confirmation)).status==='target_changed'&&sendCount===before,`D29 fresh ${change} change sends zero`);
  current=channel;rows=[{...terminal}];now=time;
 }
 {let reads=0;const c=createTestActionClient(()=>current,()=>now,async()=>{},undefined,async()=>++reads===4?null:current);const p=await c.prepare(agent,'Partial owner test');check(p.ok,'D29 partial fixture prepares');if(!p.ok)return;
  const before=sendCount;const result=await c.confirm(p.confirmation);check(result.status==='partial'&&result.bodyAccepted&&sendCount===before+1,'D29 failed read after accepted body is partial, Enter zero');check((await c.confirm(p.confirmation)).status==='already_submitted','D29 partial never resends');sendCount=0;writes.length=0;
 }
 {const c=createTestActionClient(()=>current,()=>now),p=await c.prepare(agent,'Stage evidence');check(p.ok,'processing fixture prepares');if(!p.ok)return;
  const phases:Array<string|undefined>=[];const off=c.subscribe(()=>phases.push(c.getSnapshot().progress));const result=await c.confirm(p.confirmation);off();check(result.status==='accepted','stage publication cannot alter accepted input');check(phases.filter((v,i)=>i===0||v!==phases[i-1]).join(',')==='checking,sending,checking,sending,','typed fresh read and body/Enter publish their actual visible stages');sendCount=0;writes.length=0;
 }
 const client=createTestActionClient(()=>current,()=>now);
 const prepared=await client.prepare(agent,'A Korean reply: 확인했습니다');
 check(prepared.ok,'current exact target prepares a confirmation');
 if(!prepared.ok)return;
 check(sendCount===0,'preparing never sends');
 check(prepared.confirmation.text==='A Korean reply: 확인했습니다','owner can review full draft');
 const result=await client.confirm(prepared.confirmation);
 check(result.status==='accepted','only exact host acceptance proves delivery');
 check(params?.expectedIncarnationId==='incarnation-1'&&params?.terminal==='term_exact','write names the exact handle and carries the advisory incarnation field');
 check(writes[0]?.text==='\u001b[200~A Korean reply: 확인했습니다\u001b[201~'&&writes[0]?.enter===undefined&&writes[0]?.requireAgentStatus==='sendable','text is guarded without submitting');
 check(writes[1]?.text===undefined&&writes[1]?.enter===true&&writes[1]?.requireAgentStatus==='sendable','submit is guarded independently after accepted text');
 await client.confirm(prepared.confirmation);
 check(sendCount===2,'double confirm never repeats a write');

 const changed=await client.prepare(agent,'another');check(changed.ok,'prepare second');if(!changed.ok)return;
 rows=[{...terminal,incarnationId:'replacement'}];
 check((await client.confirm(changed.confirmation)).status==='target_changed','replaced process invalidates confirmation');
 check(sendCount===2,'no write to replacement process');rows=[{...terminal}];

 const lost=await client.prepare(agent,'once');check(lost.ok,'prepare timeout');if(!lost.ok)return;
 reply=new Error('raw error must never escape');
 check((await client.confirm(lost.confirmation)).status==='unknown','lost reply reports unknown outcome');
 await client.confirm(lost.confirmation);check(sendCount===3,'unknown outcome cannot auto retry');
 check(!JSON.stringify(client.receipts()).includes('raw error'),'audit has no raw errors');
 check(!JSON.stringify(client.receipts()).includes('A Korean reply'),'audit does not retain message bodies');

 await client.acknowledge(client.receipts().at(-1)!.id);
 reply=(p:Record<string,unknown>)=>({send:{accepted:p.enter!==true,...(p.enter===true?{}:{writeSettlement:{outcome:'accepted'}})}});
 const partial=await client.prepare(agent,'guard flip');check(partial.ok,'prepare guarded partial');if(!partial.ok)return;
 const before=sendCount;check((await client.confirm(partial.confirmation)).status==='partial','submit refusal after accepted text reports partial');check(sendCount===before+2,'each phase observed once');
 await client.acknowledge(client.receipts().at(-1)!.id);
 reply={send:{accepted:false}};const denied=await client.prepare(agent,'denied');check(denied.ok,'prepare host refusal');if(!denied.ok)return;
 const beforeDenied=sendCount;check((await client.confirm(denied.confirmation)).status==='refused','payload refusal is definite refusal');check(sendCount===beforeDenied+1,'refused payload never sends Enter');
 reply={send:{accepted:false,writeSettlement:{outcome:'unverifiable',reason:'partial_write',bytesHandedToTransport:true}}};
 const uncertain=await client.prepare(agent,'partly handed to PTY');check(uncertain.ok,'prepare partial write');if(!uncertain.ok)return;
 check((await client.confirm(uncertain.confirmation)).status==='unknown','unverifiable settlement overrides false acceptance');
 await client.acknowledge(client.receipts().at(-1)!.id);
 reply={send:{accepted:true,writeSettlement:{outcome:'unverifiable',reason:'partial_write',bytesHandedToTransport:true}}};
 const contradiction=await client.prepare(agent,'contradictory reply');check(contradiction.ok,'prepare conflicting settlement');if(!contradiction.ok)return;
 check((await client.confirm(contradiction.confirmation)).status==='unknown','contradictory settlement never claims acceptance');
 await client.acknowledge(client.receipts().at(-1)!.id);
 reply={send:{accepted:true,writeSettlement:{outcome:'accepted'}}};
 let release!:()=>void;let delayMs=0;const gate=new Promise<void>(resolve=>{release=resolve;});let entered!:()=>void;const settling=new Promise<void>(resolve=>{entered=resolve;});
 const paced=createTestActionClient(()=>current,()=>now,async ms=>{delayMs=ms;entered();await gate;});
 const pacedPrompt=await paced.prepare(agent,'한글\nnext');check(pacedPrompt.ok,'prepare paced prompt');if(!pacedPrompt.ok)return;
 const previous=sendCount;const submitting=paced.confirm(pacedPrompt.confirmation);await settling;
 check(sendCount===previous+1&&delayMs>=501,'Enter waits for the source-derived ingestion floor');
 current=null;release();check((await submitting).status==='partial','drop during ingest wait leaves partial without Enter');check(sendCount===previous+1,'no Enter after target loss during settle');current=channel;
 current={...channel,agents:[{...agent,provider:'other'}]};check(!(await client.prepare({...agent,provider:'other'},'other TUI')).ok,'unverified agent input modes remain disabled');
 current={...channel,hostVersion:'1.4.214',transport:{...channel.transport,request:async(m,p)=>m==='status.get'?{runtimeId:channel.runtimeId,capabilities:[]}:channel.transport.request(m,p)}};const legacy=await client.prepare(agent,'legacy');check(!legacy.ok&&legacy.reason==='target_unavailable','legacy host without the terminal.send contract stays closed before mutation');
 current={...channel,hostVersion:'1.4.250'};check((await client.prepare(agent,'future')).ok,'250 uses the same guarded contract');
 current={...channel,hostVersion:'1.4.999'};check((await client.prepare(agent,'future')).ok,'future label uses guarded contract');
 current={...channel,hostVersion:'1.4.247'};check((await client.prepare(agent,'unreviewed release')).ok,'adjacent label uses guarded contract');
 current={...channel,hostVersion:'1.4.248'};
 const client248=createTestActionClient(()=>current,()=>now);
 const prompt248=await client248.prepare(agent,'Reviewed legacy input');
 check(prompt248.ok,'reviewed 248 legacy input prepares without enabling future versions');if(!prompt248.ok)return;
 const before248=sendCount;
 check((await client248.confirm(prompt248.confirmation)).status==='accepted','248 legacy input requires the original accepted settlement for both phases');
 const writes248=writes.slice(-2);
 check(sendCount===before248+2&&writes248.every(p=>p.requireAgentStatus==='sendable'&&p.requireWriteSettlement===true&&!Object.hasOwn(p,'inputSequence')),'248 keeps guarded legacy input and never silently opts into ordered-input');
 reply={send:{accepted:false,writeSettlement:{outcome:'unverifiable',reason:'partial_write',bytesHandedToTransport:true}}};
 const uncertain248=await client248.prepare(agent,'Uncertain legacy write');check(uncertain248.ok,'248 uncertainty fixture prepares');if(!uncertain248.ok)return;
 const beforeUncertain248=sendCount;
 check((await client248.confirm(uncertain248.confirmation)).status==='unknown','248 unverifiable legacy settlement preserves the uncertainty fence');
 await client248.confirm(uncertain248.confirmation);
 check(sendCount===beforeUncertain248+1,'248 uncertain body is never followed by Enter or an automatic retry');
 reply={send:{accepted:true,writeSettlement:{outcome:'accepted'}}};
 current={...channel,hostVersion:'1.4.249'};
 const client249=createTestActionClient(()=>current,()=>now);
 const prompt249=await client249.prepare(agent,'Reviewed legacy input');
 check(prompt249.ok,'reviewed 249 legacy input prepares without enabling future versions');if(!prompt249.ok)return;
 const before249=sendCount;
 check((await client249.confirm(prompt249.confirmation)).status==='accepted','249 legacy input requires the original accepted settlement for both phases');
 const writes249=writes.slice(-2);
 check(sendCount===before249+2&&writes249.every(p=>p.requireAgentStatus==='sendable'&&p.requireWriteSettlement===true&&!Object.hasOwn(p,'inputSequence')),'249 keeps guarded legacy input and never silently opts into ordered-input');
 reply={send:{accepted:false,writeSettlement:{outcome:'unverifiable',reason:'partial_write',bytesHandedToTransport:true}}};
 const uncertain249=await client249.prepare(agent,'Uncertain legacy write');check(uncertain249.ok,'249 uncertainty fixture prepares');if(!uncertain249.ok)return;
 const beforeUncertain249=sendCount;
 check((await client249.confirm(uncertain249.confirmation)).status==='unknown','249 unverifiable legacy settlement preserves the uncertainty fence');
 await client249.confirm(uncertain249.confirmation);
 check(sendCount===beforeUncertain249+1,'249 uncertain body is never followed by Enter or an automatic retry');
 current={...channel,generation:2};check(!(await client.prepare(agent,'stale')).ok,'old generation rejected');
 current=channel;now=time+30_001;check((await client.prepare(agent,'stale')).ok,'D29 old display timestamp is replaced by a new read before preparation');now=time;
 channel.agents=[{...agent,state:'permission',eventType:'permission_request'}];
 check(!(await client.prepare(agent,'yes')).ok,'terminal text cannot answer a permission');
 channel.agents=[agent];
 const beforeDrop=await client.prepare(agent,'drop');check(beforeDrop.ok,'prepare before disconnect');if(!beforeDrop.ok)return;current=null;
 check((await client.confirm(beforeDrop.confirmation)).status==='not_connected','disconnect invalidates confirmation');
 current=channel;rows=[{...terminal,worktreeId:'other'}];check(!(await client.prepare(agent,'wrong')).ok,'same pane in different workspace refused');
 rows=[{...terminal}];check(!(await client.prepare(agent,'\u001b[31m')).ok,'terminal control sequences refused');
 console.log(`PASS: ${count} target-bound action assertions`);
}
void main().catch(error=>{throw error;});
