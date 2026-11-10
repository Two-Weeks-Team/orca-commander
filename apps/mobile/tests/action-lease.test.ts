import { createTestActionClient } from './helpers/create-action-client';
import { type ActionChannel } from '../src/adapters/action-client';
import type { AgentSnapshot } from '../src/core/types';
let checks=0;function check(v:unknown,m:string){checks++;if(!v)throw new Error(m);}
const time=1000;
const agent:AgentSnapshot={id:'a',provider:'claude',title:'task',summary:'idle',state:'idle',eventType:'informational',updatedAt:new Date(time).toISOString(),target:{hostId:'h',connectionGeneration:1,worktreeId:'w',terminalId:'tab:leaf'}};
function fixture(mode:'normal'|'missing'|'inactive'|'changed'|'lost'){
 let active=true,sends=0,releases=0;let incarnation='old';let releaseGate:Promise<void>|undefined;let onRelease=()=>{};
 const transport={
  acquireTerminalInput:async()=>{if(mode==='missing')throw new Error('no registration');if(mode==='inactive')active=false;if(mode==='changed')incarnation='replacement';return{isActive:()=>active,release:async()=>{active=false;releases++;onRelease();await releaseGate;}};},
  request:async(method:string)=>{if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};if(method==='terminal.list')return{truncated:false,terminals:[{handle:'term_fixture',incarnationId:incarnation,worktreeId:'w',tabId:'tab',leafId:'leaf',connected:true,writable:true,executionHostId:'local'}]};sends++;return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};},
 };
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.246',hostId:'h',generation:1,confirmedAt:time,agents:[agent],transport};
 const client=createTestActionClient(()=>channel,()=>time,async()=>{if(mode==='lost')active=false;});
 return{client,get sends(){return sends;},get releases(){return releases;},blockRelease(gate:Promise<void>,entered:()=>void){releaseGate=gate;onRelease=entered;}};
}
async function main(){
 for(const mode of ['missing','inactive','changed'] as const){
  const f=fixture(mode);const p=await f.client.prepare(agent,'once');if(!p.ok)throw new Error('fixture');const result=await f.client.confirm(p.confirmation);
  check(result.status===(mode==='missing'?'unavailable':'target_changed'),'lease failure has a definite pre-input outcome');check(f.sends===0,`${mode} input lease never writes text`);check(!f.client.getSnapshot().busy,'failed lease preparation releases global writer');
  if(mode!=='missing')check(f.releases===1,'acquired but invalid lease is released');
 }
 const lost=fixture('lost');const p=await lost.client.prepare(agent,'once');if(!p.ok)throw new Error('fixture');const result=await lost.client.confirm(p.confirmation);
 check(result.status==='partial'&&result.bodyAccepted&&!result.submitAttempted&&lost.sends===1,'lease end after body prevents Enter and preserves partial outcome');check(lost.releases===1,'lost lease still receives explicit teardown');
 const normal=fixture('normal');let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const releasing=new Promise<void>(r=>{entered=r;});normal.blockRelease(gate,entered);
 const ready=await normal.client.prepare(agent,'once');if(!ready.ok)throw new Error('fixture');const pending=normal.client.confirm(ready.confirmation);await releasing;
 check(normal.client.getSnapshot().busy&&!(await normal.client.prepare(agent,'overlap')).ok,'global writer remains busy until its input lease cleanup finishes');release();
 check((await pending).status==='accepted'&&normal.sends===2&&normal.releases===1,'two guarded writes finish and release the lease once');
 console.log(`PASS: ${checks} input lease action assertions (injected transport; no device)`);
}
void main();
