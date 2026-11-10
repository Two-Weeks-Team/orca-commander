import assert from 'node:assert/strict';
import {fixture as native} from './structured-action-client.test';
import {fixture as asyncReply} from './native-async-client.test';
import {makeFixture as launch} from './host-default-agent-client.test';
import {engine as claudeEngine} from './claude-terminal-sequencing.test';
import {setup as claude} from './claude-terminal-client.test';
import {createTestActionClient} from './helpers/create-action-client';
import {DirectTransportError} from '../src/adapters/direct-e2ee-transport';
import {ensureTransportCapabilities} from '../src/adapters/transport-capabilities';
import type {ActionChannel} from '../src/adapters/action-client';
import type {AgentSnapshot} from '../src/core/types';

const versions=['1.4.249','1.4.250','1.4.251','1.4.252','2.0','v1.4.251',undefined];
const at=1_800_000_000_000;
const a:AgentSnapshot={id:'a',provider:'claude',title:'Owned',summary:'',state:'idle',eventType:'informational',updatedAt:new Date(at).toISOString(),target:{hostId:'h',worktreeId:'w',terminalId:'t:l',connectionGeneration:1}};
function typed(version:string|undefined,error?:unknown,afterBody=false){
 let calls=0;const c={runtimeId:'r',hostVersion:version,hostId:'h',generation:1,confirmedAt:at,agents:[a],transport:{acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),request:async(method:string):Promise<unknown>=>{
  if(method==='status.get')return{runtimeId:'r',capabilities:['terminal.prompt-delivery.v1']};
  if(method==='terminal.list')return{terminals:[{handle:'handle',incarnationId:'inc',tabId:'t',leafId:'l',worktreeId:'w',connected:true,writable:true,orphaned:false,executionHostId:'local'}],truncated:false};
  if(method==='terminal.send'){calls++;if(error&&(!afterBody||calls===2))throw error;return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};}throw new Error('unexpected');
 }}};
 return{c,client:createTestActionClient(()=>c,()=>at,async()=>{}),get calls(){return calls;}};
}
async function main(){
 if(!process.env.D28_CASE||process.env.D28_CASE==='terminal-contract'){
  const t=typed('1.4.251'),base=t.c.transport.request;t.c.transport.request=async(m)=>{const result=await base(m);return m==='terminal.send'?{send:{accepted:true}}:result;};
  const p=await t.client.prepare(a,'once');assert.ok(p.ok);assert.equal((await t.client.confirm(p.confirmation)).status,'unknown','missing requested settlement never proves body acceptance');assert.equal(t.calls,1,'no Enter or resend after unproven body');
  const d=claude(),db=d.channel.transport.request;d.channel.transport.request=async(m,p)=>{const result=await db(m,p);return m==='terminal.send'?{send:{accepted:true}}:result;};const dp=await d.client.prepareClaudePrompt(d.channel.agents[0]);assert.ok(dp.ok);assert.equal((await d.client.respondClaudePrompt(dp.review,1,undefined,()=>true)).status,'unknown','D27 also requires settled acceptance');assert.equal(d.f.writes.length,1);
  const missing=typed('1.4.214'),mb=missing.c.transport.request;missing.c.transport.request=async(m)=>m==='status.get'?{runtimeId:missing.c.runtimeId,capabilities:[]}:mb(m);assert.equal((await missing.client.prepare(a,'once')).ok,false,'a legacy host without the terminal method contract stays closed');assert.equal(missing.calls,0);
  const md=claude(),mdb=md.channel.transport.request;md.channel.transport.request=async(m,p)=>m==='status.get'?{runtimeId:md.channel.runtimeId,capabilities:[]}:mdb(m,p);assert.equal((await md.client.prepareClaudePrompt(md.channel.agents[0])).ok,false);assert.equal(md.f.writes.length,0);
 }
 if(!process.env.D28_CASE||process.env.D28_CASE==='generation-reason'){
  const f=launch(),base=f.channel!.transport.request;f.channel!.transport.request=async(m,p)=>{const value=await base(m,p);if(m==='status.get')f.changeGeneration();return value;};const result=await f.create().prepare({worktreeId:'wt-one',prompt:'once'});assert.ok(!result.ok&&result.reason==='target_changed','generation lost during negotiation is target change, not unsupported host');assert.equal(f.launches,0);
 }

 if(!process.env.D28_CASE||process.env.D28_CASE==='versions')for(const version of versions){
  const t=typed(version),p=await t.client.prepare(a,'synthetic');assert.ok(p.ok,'typed contract opens independently of '+version);
  assert.equal((await t.client.confirm(p.confirmation)).status,'accepted');assert.equal(t.calls,2);
  const n=native();n.channel!.hostVersion=version;const nc=n.create();await nc.refresh();const e=nc.getSnapshot().entries[0];assert.ok(e,'native contract opens independently of '+version);
  const np=await nc.prepare(e,'request','accept');assert.ok(np.ok);assert.equal((await nc.confirm(np.confirmation)).status,'accepted');
  const r=asyncReply();r.channel!.hostVersion=version;const rc=r.create();await rc.refresh();const re=rc.getSnapshot().asyncEntries[0];assert.ok(re,'async contract opens independently of '+version);
  const rp=await rc.prepareReply(re,[{option:0}]);assert.ok(rp.ok);assert.equal((await rc.confirmReply(rp.confirmation)).status,'accepted');
  const h=launch();h.channel!.hostVersion=version;const hc=h.create();const hp=await hc.prepare({worktreeId:'wt-one',prompt:'synthetic'});assert.ok(hp.ok,'H1 contract opens independently of '+version);
  assert.equal((await hc.confirm(hp.confirmation)).status,'journaled');assert.equal(h.launches,1);const restored=h.create();await restored.reloadJournal();assert.equal(restored.getSnapshot().journal,'ready','v1 journal reload accepts actual diagnostic label');
  const d=claude();d.channel.hostVersion=version;const dp=await d.client.prepareClaudePrompt(d.channel.agents[0]);assert.ok(dp.ok,'D27 contract opens independently of '+version);assert.equal((await d.client.respondClaudePrompt(dp.review,1,undefined,()=>true)).status,'accepted');
 }
 if(!process.env.D28_CASE||process.env.D28_CASE==='admission')for(const code of ['method_not_found','forbidden','-32601']){
  const error=new DirectTransportError('rpc_error',code),t=typed('1.4.249',error),p=await t.client.prepare(a,'once');assert.ok(p.ok);
  assert.equal((await t.client.confirm(p.confirmation)).status,code==='method_not_found'?'refused':'unknown');assert.equal(t.calls,1);await t.client.confirm(p.confirmation);assert.equal(t.calls,1,'no automatic or reused-ticket retry');
  const later=typed('1.4.249',error,true),lp=await later.client.prepare(a,'once');assert.ok(lp.ok);assert.equal((await later.client.confirm(lp.confirmation)).status,'unknown','prior accepted body retains uncertainty');assert.equal(later.calls,2);
  const n=native(),base=n.channel!.transport.request;n.channel!.transport.request=async(m,p)=>{if(m==='agentSession.respondToApproval')throw error;return base(m,p);};const nc=n.create();await nc.refresh();const np=await nc.prepare(nc.getSnapshot().entries[0],'request','accept');assert.ok(np.ok);assert.equal((await nc.confirm(np.confirmation)).status,code==='method_not_found'?'refused':'unknown');
  const h=launch(),hb=h.channel!.transport.request;h.channel!.transport.request=async(m,p)=>{if(m==='agent.launchReplay')throw error;return hb(m,p);};const hc=h.create(),hp=await hc.prepare({worktreeId:'wt-one',prompt:'synthetic'});assert.ok(hp.ok);assert.equal((await hc.confirm(hp.confirmation)).status,code==='method_not_found'?'refused':'unknown');
  const d=claude(),db=d.channel.transport.request;d.channel.transport.request=async(m,p)=>{if(m==='terminal.send')throw error;return db(m,p);};const dp=await d.client.prepareClaudePrompt(d.channel.agents[0]);assert.ok(dp.ok);assert.equal((await d.client.respondClaudePrompt(dp.review,1,undefined,()=>true)).status,code==='method_not_found'?'refused':'unknown');
 }
 if(!process.env.D28_CASE||process.env.D28_CASE==='negotiation'){
 // Runtime change invalidates every captured path even if host and generation match.
 for(const path of ['typed','claude','native','async','h1']){
  if(path==='typed'){const f=typed('1.4.251'),p=await f.client.prepare(a,'once');assert.ok(p.ok);f.c.runtimeId='replacement';assert.equal((await f.client.confirm(p.confirmation)).status,'target_changed');assert.equal(f.calls,0);}
  if(path==='claude'){const f=claude(),p=await f.client.prepareClaudePrompt(f.channel.agents[0]);assert.ok(p.ok);f.channel.runtimeId='replacement';assert.equal((await f.client.respondClaudePrompt(p.review,1,undefined,()=>true)).status,'target_changed');assert.equal(f.f.writes.length,0);}
  if(path==='native'){const f=native(),c=f.create();await c.refresh();const p=await c.prepare(c.getSnapshot().entries[0],'request','accept');assert.ok(p.ok);f.channel!.runtimeId='replacement';assert.equal((await c.confirm(p.confirmation)).status,'changed');assert.equal(f.sends,0);}
  if(path==='async'){const f=asyncReply(),c=f.create();await c.refresh();const p=await c.prepareReply(c.getSnapshot().asyncEntries[0],[{option:0}]);assert.ok(p.ok);f.channel!.runtimeId='replacement';assert.equal((await c.confirmReply(p.confirmation)).status,'changed');assert.equal(f.sends,0);}
  if(path==='h1'){const f=launch(),c=f.create(),p=await c.prepare({worktreeId:'wt-one',prompt:'once'});assert.ok(p.ok);f.channel!.runtimeId='replacement';assert.equal((await c.confirm(p.confirmation)).status,'changed');assert.equal(f.launches,0);}
 }
 {
  const f=native(),c=f.create();await c.refresh();assert.equal(c.getSnapshot().entries.length,1);
  const channel=f.channel!,base=channel.transport.request;channel.generation++;
  channel.transport.request=async(m,p)=>m==='status.get'?{runtimeId:channel.runtimeId,capabilities:[]}:base(m,p);
  await c.refresh();assert.equal(c.getSnapshot().entries.length,0,'same transport with a new generation cannot reuse old capability evidence');
 }
 // D27 must preserve unknown after an accepted arrow or paste, never retry or submit past refusal.
 for(const failAt of [1,2,3,4]){
  const f=claudeEngine();let calls=0;const base=f.channel.transport.request;
  f.channel.transport.request=async(m,p)=>{if(m==='terminal.send'&&++calls===failAt)throw new DirectTransportError('rpc_error','method_not_found');return base(m,p);};
  const p=await f.client.prepareClaudePrompt(f.channel.agents[0]);assert.ok(p.ok);
  const result=await f.client.respondClaudePrompt(p.review,2,'Explicit test answer',()=>true);
  assert.equal(result.status,failAt===1?'refused':'unknown');assert.equal(calls,failAt);assert.equal(f.f.enterCalls,0);
  await f.client.respondClaudePrompt(p.review,2,'Explicit test answer',()=>true);assert.equal(calls,failAt);
 }
 for(const code of ['method_not_found','forbidden','-32601']){
  const f=asyncReply(),base=f.channel!.transport.request;let calls=0;
  f.channel!.transport.request=async(m,p)=>{if(m==='agentSession.send'){calls++;throw new DirectTransportError('rpc_error',code);}return base(m,p);};
  const c=f.create();await c.refresh();const p=await c.prepareReply(c.getSnapshot().asyncEntries[0],[{option:0}]);assert.ok(p.ok);
  assert.equal((await c.confirmReply(p.confirmation)).status,code==='method_not_found'?'refused':'unknown');await c.confirmReply(p.confirmation);assert.equal(calls,1);
 }
 // Status version is diagnostic; authenticated runtime and current owner generation are authority.
 let owner=1,updates=0,lastEcho:string[]=[];const c={runtimeId:'runtime',hostVersion:'2.0',hostId:'h',generation:1,confirmedAt:at,agents:[],transport:{request:async(m:string,p?:Record<string,unknown>)=>m==='status.get'?{runtimeId:'runtime',appVersion:'different',capabilities:['cap']}:(updates++,lastEcho=p?.clientCapabilities as string[],{clientCapabilities:lastEcho})}};
 const current=()=>({...c,generation:owner});
 const negotiate=ensureTransportCapabilities;
 await negotiate(c,['cap'],['cap'],current);assert.equal(updates,1);
 owner=2;await assert.rejects(negotiate(c,['cap'],['new'],current));assert.equal(updates,1,'superseded generation cannot advertise');
 await negotiate({...c,generation:owner},['cap'],['next'],current);assert.equal(updates,2,'new generation rechecks status and echo instead of borrowing confirmation');assert.ok(lastEcho.includes('cap')&&lastEcho.includes('next'),'new generation preserves other implemented client declarations');
 const wrong={...c,transport:{request:async()=>({runtimeId:'other',capabilities:['cap']})}};await assert.rejects(negotiate(wrong,['cap'],['cap'],()=>wrong));
 }
 console.log('PASS host release-independent contracts and admission boundaries (synthetic only)');
}
void main();
