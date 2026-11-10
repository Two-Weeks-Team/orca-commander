import { DeckActionClient, type ActionChannel } from '../src/adapters/action-client';
import { SecureActionJournal } from '../src/adapters/action-journal';
import { createDurableActionStore } from '../src/adapters/durable-action-store';
import { createTestActionClient } from './helpers/create-action-client';
import { FakeJournalStore } from './helpers/action-journal-store';
import type { AgentSnapshot } from '../src/core/types';
let checks=0;function check(v:unknown,m:string){checks++;if(!v)throw new Error(m);}
const now=1000;
const agent:AgentSnapshot={id:'a',provider:'codex',title:'task',summary:'idle',state:'idle',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:'h',connectionGeneration:1,worktreeId:'w',terminalId:'tab:leaf'}};
type Mode='normal'|'body_lost'|'enter_lost'|'reserve_fail'|'body_checkpoint_fail'|'submit_checkpoint_fail'|'final_fail'|'ack_fail'|'reserve_replace'|'submit_replace';
function fixture(initial:Mode){
 let mode=initial,sends=0,bodyAhead=false,enterAhead=false,incarnation='i';
 const store=new FakeJournalStore();
 store.beforeSet=(_key,raw)=>{const r=JSON.parse(raw).receipt;
  if(mode==='reserve_replace'&&r.status==='unknown'&&!r.bodyAccepted||mode==='submit_replace'&&r.submitAttempted===null)incarnation='replacement';
  if(mode==='reserve_fail'&&r.status==='unknown'&&!r.bodyAccepted||mode==='body_checkpoint_fail'&&r.status==='partial'||mode==='submit_checkpoint_fail'&&r.bodyAccepted&&r.submitAttempted===null||mode==='final_fail'&&r.status==='accepted'||mode==='ack_fail'&&r.acknowledged)throw new Error('NATIVE_RAW');
 };
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.246',hostId:'h',generation:1,confirmedAt:now,agents:[agent],transport:{
  acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),
  request:async(method,params)=>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};
   if(method==='terminal.list')return{truncated:false,terminals:[{handle:'term_fixture',incarnationId:incarnation,worktreeId:'w',tabId:'tab',leafId:'leaf',connected:true,writable:true,executionHostId:'local'}]};
   sends++;const records=await new SecureActionJournal(store).load();const r=records.at(-1)!;
   if(params?.enter===true){enterAhead=r.bodyAccepted&&r.status==='unknown'&&r.submitAttempted===null;if(mode==='enter_lost')throw new Error('lost Enter response');}
   else{bodyAhead=r.status==='unknown'&&!r.bodyAccepted&&r.submitAttempted===false;if(mode==='body_lost')throw new Error('lost body response');}
   return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};
  },
 }};
 const restart=()=>createTestActionClient(()=>channel,()=>now,async()=>{},store);
 return{store,channel,restart,setMode(next:Mode){mode=next;},get sends(){return sends;},get ahead(){return{body:bodyAhead,enter:enterAhead};}};
}
async function run(f:ReturnType<typeof fixture>){const client=f.restart();const p=await client.prepare(agent,'OWNER_DRAFT_MUST_NOT_BE_STORED');if(!p.ok)throw new Error('fixture prepare');return{client,result:await client.confirm(p.confirmation),id:p.confirmation.id};}
async function main(){
 const lost=fixture('body_lost');const first=await run(lost);const after=lost.restart();
 check(first.result.status==='unknown'&&!(await after.prepare(agent,'duplicate')).ok,'process restart preserves unresolved target fence');check(lost.sends===1,'recovery never replays a body or Enter');
 check(![...lost.store.values.values()].join().includes('OWNER_DRAFT_MUST_NOT_BE_STORED'),'write-ahead records never store the draft');
 const normal=fixture('normal');const accepted=await run(normal);
 check(accepted.result.status==='accepted'&&normal.ahead.body&&normal.ahead.enter,'durable body and uncertain-submit intents precede their respective RPCs');
 check((await normal.restart().prepare(agent,'new draft')).ok&&normal.sends===2,'settled acceptance reloads without inventing a resend');
 const missing=new DeckActionClient(()=>normal.channel,()=>now,async()=>{});check(!(await missing.prepare(agent,'no journal')).ok,'omitting persistence never creates a fail-open writer');
 const oldAndroid=fixture('normal');const unsupported=new DeckActionClient(()=>oldAndroid.channel,()=>now,async()=>{},{refreshChannel:async()=>oldAndroid.channel,journal:new SecureActionJournal(createDurableActionStore(oldAndroid.store,'android',undefined)),newId:()=> 'old-native'});
 const unsupportedPrepare=await unsupported.prepare(agent,'cached readback cannot authorize input');
 check(!unsupportedPrepare.ok&&unsupportedPrepare.reason==='storage_unavailable'&&oldAndroid.sends===0,'old or unpatched native Android binaries cannot authorize an input');
 check(oldAndroid.store.values.size===0,'unsupported durability never touches native journal values');
 const bodyReplaced=fixture('reserve_replace');const replacedBody=await run(bodyReplaced);
 check(bodyReplaced.sends===0&&replacedBody.result.status==='target_changed','replacement during durable reservation prevents body RPC');
 const submitReplaced=fixture('submit_replace');const replacedSubmit=await run(submitReplaced);
 check(submitReplaced.sends===1&&replacedSubmit.result.status==='partial'&&!replacedSubmit.result.submitAttempted,'replacement during durable submit intent prevents Enter');
 for(const mode of ['reserve_fail','body_checkpoint_fail','submit_checkpoint_fail','final_fail','enter_lost'] as const){
  const f=fixture(mode);const {client,result}=await run(f);
  if(mode==='reserve_fail')check(result.status==='storage_unavailable'&&f.sends===0,'failed initial reservation writes no input');
  if(mode==='body_checkpoint_fail'||mode==='submit_checkpoint_fail')check(result.status==='partial'&&result.bodyAccepted&&!result.submitAttempted&&f.sends===1,'failed checkpoint after accepted body never sends Enter');
  if(mode==='final_fail')check(result.status==='accepted'&&f.sends===2&&client.getSnapshot().journal==='unavailable','final persistence failure preserves actual host acceptance and blocks new writes');
  if(mode==='enter_lost')check(result.status==='unknown'&&result.bodyAccepted&&result.submitAttempted===true&&f.sends===2,'lost Enter keeps observed body and submission attempt');
  if(mode!=='enter_lost')check(client.getSnapshot().journal==='unavailable'&&!(await client.prepare(agent,'retry')).ok,'storage failure blocks another live write');
  const restored=f.restart();const p=await restored.prepare(agent,'duplicate');
  if(mode!=='reserve_fail')check(!p.ok,'restored unfinished persistence stays fenced');
  if(mode==='final_fail')check(restored.receipts().at(-1)?.submitAttempted===null,'restart never converts write-ahead submit intent into a confirmed attempt');
 }
 const ack=fixture('body_lost');const unfinished=await run(ack);ack.setMode('ack_fail');
 check(!await unfinished.client.acknowledge(unfinished.id)&&!unfinished.client.receipts().at(-1)?.acknowledged,'failed durable ACK never releases a fence');
 check(!(await ack.restart().prepare(agent,'duplicate')).ok,'failed ACK survives another process instance');
 ack.setMode('normal');await unfinished.client.reloadJournal();
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const waiting=new Promise<void>(r=>{entered=r;});
 ack.store.beforeSet=async(_k,raw)=>{if(JSON.parse(raw).receipt.acknowledged){entered();await gate;}};
 const acknowledging=unfinished.client.acknowledge(unfinished.id);await waiting;
 check(!unfinished.client.receipts().at(-1)?.acknowledged&&!(await unfinished.client.prepare(agent,'overlap')).ok,'ACK remains pending until native persistence completes');release();check(await acknowledging,'verified durable ACK completes');
 const reconciled=ack.restart();check((await reconciled.prepare(agent,'after check')).ok&&ack.sends===1,'verified owner reconciliation survives restart without remote resend');
 const nonce=fixture('normal');const sharedJournal=new SecureActionJournal(nonce.store);const fixed=new DeckActionClient(()=>nonce.channel,()=>now,async()=>{},{refreshChannel:async()=>nonce.channel,journal:sharedJournal,newId:()=> 'fixed-id'});
 const n=await fixed.prepare(agent,'first');if(!n.ok)throw new Error('nonce fixture');await fixed.confirm(n.confirmation);
 check(!(await fixed.prepare(agent,'duplicate-id')).ok&&nonce.sends===2,'a repeated action identity cannot create a second confirmation');
 const failingId=new DeckActionClient(()=>nonce.channel,()=>now,async()=>{},{refreshChannel:async()=>nonce.channel,journal:new SecureActionJournal(nonce.store),newId:()=>{throw new Error('NATIVE_RAW');}});
 check(!(await failingId.prepare(agent,'no identity')).ok,'nonce creation failure is coded and never starts a write');
 console.log(`PASS: ${checks} action restart/storage fault assertions (fake store and RPC; no device)`);
}
void main();
