import assert from 'node:assert/strict';
import {createTestActionClient} from './helpers/create-action-client';
import type {ActionChannel} from '../src/adapters/action-client';
import type {AgentSnapshot} from '../src/core/types';
import {FakeJournalStore} from './helpers/action-journal-store';
const at=1_800_000_000_000;
const agent:AgentSnapshot={id:'test',provider:'claude',title:'Test supervisor',summary:'',state:'question',eventType:'user_question',terminalPrompt:{state:'waiting',kind:'question'},updatedAt:new Date(at).toISOString(),target:{hostId:'host',connectionGeneration:4,worktreeId:'wt',terminalId:'tab:leaf'}};
const lines=[' ☐ Test','Choose a harmless result?','❯ 1. Alpha','  2. Beta','  3. Type something.','Enter to select · ↑/↓ to navigate · Esc to cancel'];
const frame=(tail:string[])=>({terminal:{handle:'term-test',source:'screen',limited:false,truncated:false,returnedLineCount:tail.length,tail,tailRows:tail.map(()=>({wrapped:false,trailingSpaces:0}))}});
export function setup(){
 const f={now:at,guard:true,incarnation:'first',rows:lines.slice(),after:['Working on the chosen test.'],reads:0,writes:[] as Record<string,unknown>[],methods:[] as string[],throwSend:false,changeDuringRead:false,leaveWaiting:false,store:new FakeJournalStore()};
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.249',hostId:'host',generation:4,confirmedAt:at,agents:[agent],transport:{acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),request:async(method,params)=>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};
  f.methods.push(method);
  if(method==='terminal.list')return{truncated:false,terminals:[{worktreeId:'wt',tabId:'tab',leafId:'leaf',handle:'term-test',incarnationId:f.incarnation,connected:true,writable:true,orphaned:false,executionHostId:'local'}]};
  if(method==='terminal.read'){assert.deepEqual(params,{terminal:'term-test',screen:true});f.reads++;if(f.changeDuringRead)f.guard=false;return frame(f.writes.length?f.after:f.rows);}
  if(method==='terminal.send'){f.writes.push(params!);if(f.throwSend)throw new Error('PRIVATE_SCREEN_MUST_NOT_ESCAPE');if(f.leaveWaiting)channel.agents=[{...agent,state:'working',eventType:'informational',terminalPrompt:undefined}];return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};}
  throw new Error('Forbidden method');
 }}};return{f,channel,client:createTestActionClient(()=>channel,()=>f.now,async()=>{},f.store)};
}
async function main(){
 {const slow=setup(),p=await slow.client.prepareClaudePrompt(slow.channel.agents[0]);assert.ok(p.ok);slow.f.now+=300000;slow.channel.confirmedAt=slow.f.now;assert.equal((await slow.client.respondClaudePrompt(p.review,1,undefined,()=>true)).status,'accepted','D29 same Claude question after five minutes sends once');assert.equal(slow.f.writes.length,1);}

 const {f,client}=setup();assert.equal(f.reads,0,'no background screen reads');
 const p=await client.prepareClaudePrompt(agent);assert.ok(p.ok);assert.equal(f.reads,1,'opening reads just the selected pane once');assert.equal(f.writes.length,0);
 const result=await client.respondClaudePrompt(p.review,1,undefined,()=>f.guard);assert.equal(result.status,'accepted');assert.equal(f.reads,3,'pre-send and post-send each read once');assert.equal(f.writes.length,1);assert.equal(f.writes[0].text,'2');assert.equal(f.writes[0].enter,undefined);assert.equal(f.writes[0].requireAgentStatus,undefined,'sendable would reject the very permission being answered');
 await client.respondClaudePrompt(p.review,1,undefined,()=>true);assert.equal(f.writes.length,1,'a consumed review cannot resend');assert.equal(JSON.stringify(client.receipts()).includes('Choose a harmless'),false,'journal has no screen content');
 const changed=setup();const c=await changed.client.prepareClaudePrompt(agent);assert.ok(c.ok);changed.f.rows=changed.f.rows.map(x=>x==='  2. Beta'?'  2. Gamma':x);const cr=await changed.client.respondClaudePrompt(c.review,1,undefined,()=>true);assert.equal(cr.status,'changed');assert.equal(changed.f.writes.length,0);assert.ok(cr.review,'changed screen requires a new reviewed ticket');
 const moved=setup();const m=await moved.client.prepareClaudePrompt(agent);assert.ok(m.ok);moved.f.rows=moved.f.rows.map(x=>x==='❯ 1. Alpha'?'  1. Alpha':x==='  2. Beta'?'❯ 2. Beta':x);assert.equal((await moved.client.respondClaudePrompt(m.review,1,undefined,()=>true)).status,'changed');assert.equal(moved.f.writes.length,0);
 const stuck=setup();const s=await stuck.client.prepareClaudePrompt(agent);assert.ok(s.ok);stuck.f.after=lines.map(x=>x==='❯ 1. Alpha'?'  1. Alpha':x==='  2. Beta'?'❯ 2. Beta':x);assert.equal((await stuck.client.respondClaudePrompt(s.review,1,undefined,()=>true)).status,'unknown');await stuck.client.respondClaudePrompt(s.review,1,undefined,()=>true);assert.equal(stuck.f.writes.length,1);assert.equal((await stuck.client.prepareClaudePrompt(agent)).ok,false,'unknown receipt fences another answer');
 const escape=setup();const e=await escape.client.prepareClaudePrompt(agent);assert.ok(e.ok);assert.equal((await escape.client.respondClaudePrompt(e.review,'escape',undefined,()=>true)).status,'accepted');assert.equal(escape.f.writes[0].text,'\u001b');assert.equal(escape.f.writes[0].enter,undefined,'cancel is exactly one Esc');
 const swapped=setup();const sw=await swapped.client.prepareClaudePrompt(agent);assert.ok(sw.ok);swapped.f.incarnation='replacement';assert.equal((await swapped.client.respondClaudePrompt(sw.review,1,undefined,()=>true)).status,'target_changed');assert.equal(swapped.f.writes.length,0);
 const hidden=setup();const h=await hidden.client.prepareClaudePrompt(agent);assert.ok(h.ok);hidden.f.changeDuringRead=true;await hidden.client.respondClaudePrompt(h.review,1,undefined,()=>hidden.f.guard);assert.equal(hidden.f.writes.length,0,'selection/background change while read is pending cancels before input');
 const lost=setup();const l=await lost.client.prepareClaudePrompt(agent);assert.ok(l.ok);lost.f.throwSend=true;assert.equal((await lost.client.respondClaudePrompt(l.review,1,undefined,()=>true)).status,'unknown');assert.equal(JSON.stringify(lost.client.receipts()).includes('PRIVATE_SCREEN'),false);
 const stale=setup();stale.f.now+=30001;assert.equal((await stale.client.prepareClaudePrompt(agent)).ok,true);assert.equal(stale.f.reads,1,'D29 explicit preparation obtains a new selected screen');
 const other=setup();assert.equal((await other.client.prepareClaudePrompt({...agent,provider:'codex'})).ok,false);assert.equal(other.f.reads,0);
 const progressed=setup();const pr=await progressed.client.prepareClaudePrompt(agent);assert.ok(pr.ok);progressed.f.leaveWaiting=true;assert.equal((await progressed.client.respondClaudePrompt(pr.review,1,undefined,()=>true)).status,'accepted','a settled reply may legitimately change waiting to working before the post-read');
 const newer=setup();const nr=await newer.client.prepareClaudePrompt(agent);assert.ok(nr.ok);newer.channel.agents=[{...agent,stateSince:new Date(at+1).toISOString()}];assert.equal((await newer.client.respondClaudePrompt(nr.review,1,undefined,()=>true)).status,'target_changed','an identical-looking newer waiting event is a different question');assert.equal(newer.f.writes.length,0);
 const expiry=setup();const old=await expiry.client.prepareClaudePrompt(agent);assert.ok(old.ok);expiry.f.now+=30001;expiry.channel.confirmedAt=expiry.f.now;
 assert.equal((await expiry.client.respondClaudePrompt(old.review,1,undefined,()=>true)).status,'accepted');assert.equal(expiry.f.writes.length,1,'D29 age does not prevent the new verified send');
 assert.equal((await expiry.client.respondClaudePrompt(old.review,1,undefined,()=>true)).status,'already_submitted');assert.equal(expiry.f.writes.length,1,'D29 does not renew a consumed ticket');
 assert.equal(JSON.stringify([...f.store.values.values()]).includes('harmless result'),false,'persistent values never contain the screen');
 console.log('PASS: Claude terminal opening, exact revalidation, one-shot keys, durable uncertainty and post-read (fake RPC only)');
}
if(require.main===module)void main();
