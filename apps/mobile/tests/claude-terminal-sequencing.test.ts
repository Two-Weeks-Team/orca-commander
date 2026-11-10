import assert from 'node:assert/strict';
import {createTestActionClient} from './helpers/create-action-client';
import type {ActionChannel} from '../src/adapters/action-client';
import type {AgentSnapshot} from '../src/core/types';
const now=1_800_000_000_000;
const agent:AgentSnapshot={id:'test',provider:'claude',title:'Test supervisor',summary:'',state:'question',eventType:'user_question',terminalPrompt:{state:'waiting',kind:'question'},updatedAt:new Date(now).toISOString(),target:{hostId:'host',connectionGeneration:4,worktreeId:'wt',terminalId:'tab:leaf'}};
export function engine(){
 let progress=():unknown=>undefined;
 const f={sendProgress:[] as unknown[],readProgress:[] as unknown[],postReads:0,delayedClose:false,stateChange:false,nextState:false,refreshes:0,cursor:0,digit:'honor',arrow:'honor',arrowCalls:0,enterCalls:0,typedDigit:false,closed:false,text:'',ignorePaste:false,next:false,keep:false,writes:[] as Record<string,unknown>[],choices:[] as number[]};
 const rows=()=>f.closed?f.next?[' ☐ Next','Choose the next harmless result?','❯ 1. Delta','  2. Epsilon','Esc to cancel']:['Working on the chosen test.']:[' ☐ Test','Choose a harmless result?',...[ 'Alpha','Beta',f.text||'Type something.'].map((label,i)=>`${f.cursor===i?'❯':' '} ${i+1}. ${label}`),'Enter to select · ↑/↓ to navigate · Esc to cancel'];
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.249',hostId:'host',generation:4,confirmedAt:now,agents:[agent],transport:{acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),request:async(method,p)=>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};
  if(method==='terminal.list')return{truncated:false,terminals:[{worktreeId:'wt',tabId:'tab',leafId:'leaf',handle:'term-test',incarnationId:'first',connected:true,writable:true,orphaned:false,executionHostId:'local'}]};
  if(method==='terminal.read'){if(f.writes.length){f.readProgress.push(progress());f.postReads++;if(f.delayedClose&&f.postReads>1)f.closed=true;}const tail=rows();return{terminal:{handle:'term-test',source:'screen',limited:false,returnedLineCount:tail.length,tail,tailRows:tail.map(()=>({wrapped:false,trailingSpaces:0}))}};}
  if(method==='terminal.send'){
   assert.ok(p);f.sendProgress.push(progress());f.writes.push(p);const text=String(p.text??'');
   if(/^[1-9]$/.test(text)){if(f.cursor===2)f.typedDigit=true;else if(f.digit==='honor'){f.choices.push(Number(text));f.closed=!f.keep;}}
   if(text==='\u001b[A'||text==='\u001b[B'){f.arrowCalls++;if(f.arrow==='honor'||f.arrow==='partial'&&f.arrowCalls===1)f.cursor=Math.max(0,Math.min(2,f.cursor+(text.endsWith('A')?-1:1)));}
   if(text.startsWith('\u001b[200~')&&!f.ignorePaste)f.text=text.slice(6,-6);
   if(p.enter){f.enterCalls++;f.choices.push(f.cursor+1);f.closed=!f.keep;}
   return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};
  }
  throw Error('Unexpected method');
 }}};const client=createTestActionClient(()=>channel,()=>now,async()=>{},undefined,async()=>{f.refreshes++;if(f.stateChange&&f.postReads>0||f.nextState&&f.writes.length>0)channel.agents=[{...agent,stateSince:'changed-after-digit'}];return channel;});progress=()=>client.getSnapshot().progress;return{f,channel,client};
}
async function main(){
 const following=engine();following.f.next=true;following.f.nextState=true;const followingReview=await following.client.prepareClaudePrompt(agent);assert.ok(followingReview.ok);const followingResult=await following.client.respondClaudePrompt(followingReview.review,1,undefined,()=>true);assert.equal(followingResult.status,'accepted');assert.equal(followingResult.nextPrompt,true,'D29 R2 changed stateSince with a different question reports the following prompt');

 // D29: the first stale rendered menu after accepted numeric input is not proof of ignored input.
 const delayed=engine();delayed.f.keep=true;delayed.f.delayedClose=true;const dp=await delayed.client.prepareClaudePrompt(agent);assert.ok(dp.ok);
 const dr=await delayed.client.respondClaudePrompt(dp.review,1,undefined,()=>true);
 assert.equal(dr.status,'accepted','D29 next independent read observes question disappearance, not cursor_required');assert.equal(dr.review,undefined);assert.equal(delayed.f.postReads,2);assert.equal(delayed.f.writes.length,1);assert.equal(delayed.f.enterCalls,0);assert.equal(delayed.f.arrowCalls,0);assert.ok(delayed.f.refreshes>=5,'D29 each independent observation rereads bound inventory');
 const stayed=engine();stayed.f.digit='ignore';const sp=await stayed.client.prepareClaudePrompt(agent);assert.ok(sp.ok);const sr=await stayed.client.respondClaudePrompt(sp.review,1,undefined,()=>true);assert.equal(sr.status,'cursor_required');assert.equal(stayed.f.postReads,2,'D29 fallback requires two independent same-question observations');assert.equal(stayed.f.writes.length,1);assert.equal(stayed.f.enterCalls,0);assert.equal(stayed.f.arrowCalls,0);
 assert.ok(sr.review);stayed.channel.agents=[{...agent,stateSince:'changed-before-next-hold'}];assert.equal((await stayed.client.respondClaudePrompt(sr.review,1,undefined,()=>true)).status,'target_changed');assert.equal(stayed.f.writes.length,1,'changed stateSince stops the new fallback hold before any arrow');
 const state=engine();state.f.keep=true;state.f.stateChange=true;const cp=await state.client.prepareClaudePrompt(agent);assert.ok(cp.ok);assert.equal((await state.client.respondClaudePrompt(cp.review,1,undefined,()=>true)).status,'accepted','D29 changed waiting stateSince submits even if screen still shows old menu');assert.equal(state.f.writes.length,1);

 const numeric=engine(),n=await numeric.client.prepareClaudePrompt(agent);assert.ok(n.ok);assert.equal((await numeric.client.respondClaudePrompt(n.review,1,undefined,()=>true)).status,'accepted');assert.deepEqual(numeric.f.writes.map(x=>({text:x.text,enter:x.enter})),[{text:'2',enter:undefined}],'default is one digit, never Enter');assert.deepEqual(numeric.f.choices,[2]);assert.deepEqual(numeric.f.sendProgress,['sending']);assert.deepEqual(numeric.f.readProgress,['observing']);
 const ignored=engine();ignored.f.digit='ignore';const ig=await ignored.client.prepareClaudePrompt(agent);assert.ok(ig.ok);const first=await ignored.client.respondClaudePrompt(ig.review,1,undefined,()=>true);assert.equal(first.status,'cursor_required');assert.equal(ignored.f.enterCalls,0);assert.equal(ignored.f.arrowCalls,0,'ignored digits never trigger automatic arrows');assert.ok(first.review,'a second explicit hold owns the cursor fallback');assert.equal((await ignored.client.respondClaudePrompt(first.review,1,undefined,()=>true)).status,'accepted');assert.equal(ignored.f.arrowCalls,1);assert.equal(ignored.f.enterCalls,1);assert.deepEqual(ignored.f.choices,[2]);
 const input=engine();input.f.cursor=2;const ip=await input.client.prepareClaudePrompt(agent);assert.ok(ip.ok);await input.client.respondClaudePrompt(ip.review,0,undefined,()=>true);assert.equal(input.f.typedDigit,false);assert.deepEqual(input.f.writes.map(x=>x.text).filter(Boolean),['\u001b[A','\u001b[A']);assert.equal(input.f.enterCalls,1);
 for(const mode of ['ignore','partial']){const bad=engine();bad.f.cursor=2;bad.f.arrow=mode;const bp=await bad.client.prepareClaudePrompt(agent);assert.ok(bp.ok);assert.equal((await bad.client.respondClaudePrompt(bp.review,0,undefined,()=>true)).status,'unknown');assert.equal(bad.f.enterCalls,0,'ignored or partially applied arrows must never submit');}
 const typed=engine();const tp=await typed.client.prepareClaudePrompt(agent);assert.ok(tp.ok);assert.equal((await typed.client.respondClaudePrompt(tp.review,2,'An explicit answer',()=>true)).status,'accepted');assert.equal(typed.f.enterCalls,1);assert.equal(typed.f.typedDigit,false);assert.equal(typed.f.text,'An explicit answer');
 const missing=engine();missing.f.ignorePaste=true;const mp=await missing.client.prepareClaudePrompt(agent);assert.ok(mp.ok);assert.equal((await missing.client.respondClaudePrompt(mp.review,2,'An explicit answer',()=>true)).status,'unknown');assert.equal(missing.f.enterCalls,0,'unverified paste must not be submitted');
 const next=engine();next.f.next=true;const np=await next.client.prepareClaudePrompt(agent);assert.ok(np.ok);const nr=await next.client.respondClaudePrompt(np.review,1,undefined,()=>true);assert.equal(nr.status,'accepted');assert.equal(Reflect.get(nr,'nextPrompt'),true,'a different following menu is not an unresolved old answer');
 console.log('PASS D27 numeric default, manual fallback, per-arrow cursor proof, paste proof and next-menu settlement (fake terminal engine)');
}
if(require.main===module)void main();
