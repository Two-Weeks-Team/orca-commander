import { createTestActionClient } from './helpers/create-action-client';
import { type ActionChannel } from '../src/adapters/action-client';
import { describeActionOutcome, actionOutcomeKey } from '../src/ui/action-outcome';
import type { AgentSnapshot } from '../src/core/types';
let checks=0;function check(v:unknown,m:string){checks++;if(!v)throw new Error(m);}
const t=Date.parse('2026-11-03T00:00:00Z');
const agent:AgentSnapshot={id:'a',provider:'claude',title:'task',summary:'ready',state:'idle',eventType:'informational',updatedAt:new Date(t).toISOString(),target:{hostId:'h',connectionGeneration:1,worktreeId:'w',terminalId:'tab:leaf'}};
const row={handle:'term_fixture',incarnationId:'i',worktreeId:'w',tabId:'tab',leafId:'leaf',connected:true,writable:true,executionHostId:'local'};
async function main(){
 let clock=t,sends=0;let mode:'normal'|'read_lost'|'enter_lost'|'body_lost'='normal';
 const channel=():ActionChannel=>({runtimeId:'runtime-fixture',hostVersion:'1.4.246',hostId:'h',generation:1,confirmedAt:clock,agents:[agent],transport});
 const transport={acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),async request(method:string,p?:Record<string,unknown>):Promise<unknown>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};
  if(method==='terminal.list'){if(mode==='read_lost'&&sends===1)throw new Error('read lost');return{terminals:[row],truncated:false};}
  if(method==='terminal.send'){sends++;if(mode==='body_lost'||mode==='enter_lost'&&p?.enter===true)throw new Error('lost response');return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};}
  throw new Error('unexpected');
 }};
 const client=createTestActionClient(channel,()=>clock,async ms=>{clock+=ms;});
 const long=await client.prepare(agent,Array.from({length:100},()=> 'line').join('\n'));check(long.ok,'long prompt prepares');if(!long.ok)return;
 clock+=25000;
 const late=await client.confirm(long.confirmation);
 check(late.status==='accepted','valid human confirm near expiry completes under separate execution window');
 check(sends===2&&late.bodyAccepted&&late.submitAttempted,'late normal confirm delivers both guarded phases once');
 mode='read_lost';sends=0;
 const readLost=await client.prepare(agent,'read lost');check(readLost.ok,'prepare post-body read failure');if(!readLost.ok)return;
 const readResult=await client.confirm(readLost.confirmation);
 check(readResult.status==='partial'&&readResult.bodyAccepted&&!readResult.submitAttempted,'failed read before Enter preserves known body acceptance');
 check(sends===1,'no Enter after failed revalidation');
 mode='normal';
 check(!(await client.prepare(agent,'duplicate')).ok,'unreconciled partial blocks another input to that target');
 const partialReceipt=client.receipts().at(-1)!;check(await client.acknowledge(partialReceipt.id),'owner can acknowledge checking current terminal');
 mode='enter_lost';sends=0;
 const enterLost=await client.prepare(agent,'enter lost');check(enterLost.ok,'prepare ambiguous submit');if(!enterLost.ok)return;
 const enterResult=await client.confirm(enterLost.confirmation);
 check(enterResult.status==='unknown'&&enterResult.bodyAccepted&&enterResult.submitAttempted,'lost Enter keeps body and submit-attempt facts');
 await client.acknowledge(client.receipts().at(-1)!.id);
 mode='body_lost';sends=0;
 const unknown=await client.prepare(agent,'once');check(unknown.ok,'prepare uncertain body');if(!unknown.ok)return;

 let busyObserved=false;const unsubscribe=client.subscribe(()=>{if(client.getSnapshot().busy)busyObserved=true;});
 const pending=client.confirm(unknown.confirmation);check(!(await client.prepare(agent,'concurrent')).ok,'global writer excludes another composer while a write is pending');
 const unknownResult=await pending;unsubscribe();
 check(unknownResult.status==='unknown'&&!unknownResult.bodyAccepted,'unacknowledged body remains unknown');
 check(busyObserved,'parent observer sees in-flight write');
 const retained=client.getSnapshot();check(!retained.busy&&retained.receipts.at(-1)?.id===unknown.confirmation.id,'result survives editor listener removal');
 check(!(await client.prepare(agent,'duplicate')).ok,'unknown body blocks re-entry until explicit reconciliation');
 await client.acknowledge(unknown.confirmation.id);
 mode='normal';sends=0;check((await client.prepare(agent,'line1\r\nline2')).ok,'normal Windows line endings remain editable and sendable');
 check(actionOutcomeKey(enterResult)==='outcome.submitUnknown', 'lost Enter presentation preserves accepted body and uncertain submit');
 check(actionOutcomeKey(unknownResult)==='outcome.bodyUnknown', 'unknown body presentation states Enter was not attempted');
 check(!JSON.stringify(client.receipts()).includes('read lost'),'global receipts retain no prompt bodies');
 let currentHost='original',lostBody=true;
 const target=()=>({...agent,target:{...agent.target,hostId:currentHost}});
 const historyTransport={acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),async request(method:string):Promise<unknown>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};if(method==='terminal.list')return{terminals:[row],truncated:false};if(lostBody)throw new Error('lost');return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};}};
 const historyChannel=():ActionChannel=>({runtimeId:'runtime-fixture',hostVersion:'1.4.246',hostId:currentHost,generation:1,confirmedAt:t,agents:[target()],transport:historyTransport});
 const history=createTestActionClient(historyChannel,()=>t,async()=>{});
 const firstUnknown=await history.prepare(target(),'once');if(!firstUnknown.ok)throw new Error('history setup');await history.confirm(firstUnknown.confirmation);
 lostBody=false;
 for(let i=0;i<50;i++){currentHost=`unrelated-${i}`;const p=await history.prepare(target(),'other');if(!p.ok)throw new Error('unrelated prepare');await history.confirm(p.confirmation);}
 currentHost='original';check(!(await history.prepare(target(),'duplicate')).ok,'unrelated successful writes cannot evict the uncertainty fence');
 check(history.receipts().some(r=>r.id===firstUnknown.confirmation.id&&!r.acknowledged),'unresolved outcome remains visible beyond the recent history limit');
 const bounded=createTestActionClient(historyChannel,()=>t,async()=>{});lostBody=true;
 for(let i=0;i<50;i++){currentHost=`unknown-${i}`;const p=await bounded.prepare(target(),'once');if(!p.ok)throw new Error('uncertain setup');await bounded.confirm(p.confirmation);}
 currentHost='new-host';const full=await bounded.prepare(target(),'over limit');check(!full.ok&&full.reason==='reconciliation_required','a full unresolved journal blocks new writes instead of forgetting an outcome');
 await bounded.acknowledge(bounded.receipts()[0]!.id);check((await bounded.prepare(target(),'after checking')).ok,'explicit owner reconciliation releases bounded journal capacity');
 check(actionOutcomeKey({status:'unknown',bodyAccepted:true,submitAttempted:null})==='outcome.submitIntentUnknown','restored submit intent never claims the request was attempted');
 console.log(`PASS: ${checks} action outcome and reconciliation assertions`);
}
void main();
