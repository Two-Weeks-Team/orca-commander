import assert from 'node:assert/strict';
import {createScopedVoiceAnswer} from '../src/adapters/scoped-voice-answer';
import type {DictationSnapshot} from '../src/adapters/host-dictation';
let count=0;const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function fixture(){
 let snapshot:DictationSnapshot={phase:'idle',availability:'ready_local',text:''},starts=0,finishes=0,cancels=0;
 const listeners=new Set<(s:DictationSnapshot)=>void>(),timers=new Map<number,{ms:number;fn:()=>void}>();let next=0;
 const publish=(patch:Partial<DictationSnapshot>)=>{snapshot={...snapshot,...patch};for(const f of [...listeners])f(snapshot);};
 const voice={getSnapshot:()=>snapshot,subscribe:(f:(s:DictationSnapshot)=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},start:async()=>{starts++;publish({phase:'loading',text:'',error:undefined});},finish:async()=>{finishes++;publish({phase:'finishing'});},cancel:async()=>{cancels++;publish({phase:'draft'});}};
 const scoped=createScopedVoiceAnswer(voice,{set:(fn:()=>void,ms:number)=>{const id=++next;timers.set(id,{ms,fn});return id;},clear:(id:number)=>{timers.delete(id);}});
 const fire=(ms:number)=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}};
 return{scoped,publish,fire,counts:()=>({starts,finishes,cancels,listeners:listeners.size,timers:timers.size})};
}
async function main(){
 const f=fixture(),answer=f.scoped.listen();same(f.counts().starts,1);
 f.publish({phase:'recording',text:'yes'});await flush();same(f.counts().finishes,0);
 f.publish({phase:'recording',text:'yes no'});await flush();same(f.counts().finishes,0);
 f.fire(3500);same(f.counts().finishes,1);f.fire(3500);same(f.counts().finishes,1);
 f.publish({phase:'draft',text:'no'});same(await answer,{kind:'final',text:'no'});same(f.counts().listeners,0);same(f.counts().timers,0);
 // HostDictation fail() synchronously publishes a retained partial draft before its error.
 const error=fixture(),failed=error.scoped.listen();error.publish({phase:'draft',text:'yes'});error.publish({phase:'error',error:'connection_lost'});same(await failed,{kind:'canceled'});
 const timeout=fixture(),expired=timeout.scoped.listen();timeout.fire(8000);same(await expired,{kind:'timeout'});same(timeout.counts().cancels,1);same(timeout.counts().listeners,0);
 const stop=fixture(),canceled=stop.scoped.listen();stop.publish({phase:'recording',text:'yes'});stop.scoped.cancel();stop.publish({phase:'draft',text:'yes'});same(await canceled,{kind:'canceled'});same(stop.counts().cancels,1);
 const busy=fixture(),first=busy.scoped.listen();same(await busy.scoped.listen(),{kind:'canceled'});same(busy.counts().starts,1);busy.scoped.cancel();same(await first,{kind:'canceled'});
 const phases:string[]=[],timed=fixture(),heard=timed.scoped.listen(phase=>phases.push(phase));
 await flush();same(phases,['preparing']);timed.fire(3500);same(timed.counts().finishes,0);same(phases,['preparing']);
 timed.publish({phase:'recording'});timed.publish({phase:'recording',text:'partial'});same(phases,['preparing','recording']);
 timed.fire(3500);same(phases,['preparing','recording','finishing']);same(timed.counts().finishes,1);
 timed.publish({phase:'draft',text:'send'});same(await heard,{kind:'final',text:'send'});same(phases,['preparing','recording','finishing','idle']);
 const observerFailure=fixture(),unaffected=observerFailure.scoped.listen(()=>{throw Error('synthetic display observer');});
 await flush();observerFailure.publish({phase:'recording'});observerFailure.fire(3500);observerFailure.publish({phase:'draft',text:'cancel'});same(await unaffected,{kind:'final',text:'cancel'});
 console.log(`PASS: ${count} scoped final-only voice answer assertions (fake dictation/timers, no microphone or host)`);
}
void main();
