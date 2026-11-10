import assert from 'node:assert/strict';
import {HostDictation,type Microphone} from '../src/adapters/host-dictation';
import type {ActionChannel} from '../src/adapters/action-client';
let count=0;const check=(value:unknown,message:string)=>{count++;assert.ok(value,message);};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(){
 let elapsed=0;const timers=new Map<number,{fn:()=>void;at:number}>();let timerId=0;
 const time={now:()=>elapsed,set:(fn:()=>void,ms:number)=>{const id=++timerId;timers.set(id,{fn,at:elapsed+ms});return id;},clear:(id:unknown)=>{timers.delete(id as number);}};
 const controls:{permission?:Promise<boolean>;open?:Promise<boolean>;chunk?:Promise<unknown>;early?:Uint8Array}={};
 const models=deferred<unknown>(),start=deferred<unknown>();
 const model={enabled:true,selectedModelId:'local',models:[{id:'local',provider:'local',status:'ready'}]};
 const calls:{method:string;params?:Record<string,unknown>}[]=[];let data=(b:Uint8Array)=>{},interrupt=()=>{},opens=0,closes=0;
 const mic:Microphone={permission:async()=>controls.permission??true,open:async(d,i)=>{opens++;data=d;interrupt=i;if(controls.early)d(controls.early);return controls.open??true;},close:()=>{closes++;}};
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostId:'fixture',generation:1,confirmedAt:1000,agents:[],transport:{async request(method,params){calls.push({method,params});if(method==='speech.models.list')return models.promise;if(method==='speech.dictation.start')return start.promise;if(method==='speech.dictation.chunk')return controls.chunk??{dictationId:'capture',text:'synthetic partial'};if(method==='speech.dictation.finish')return{dictationId:'capture',text:'synthetic final'};if(method==='speech.dictation.cancel')return{};throw new Error('unexpected synthetic method');}}};
 const voice=new HostDictation(()=>channel,mic,()=> 'capture',()=>1000,time);
 return{voice,model,models,start,calls,mic,channel,controls,timers,advance:(ms:number)=>{elapsed+=ms;for(const [id,t] of timers)if(t.at<=elapsed){timers.delete(id);t.fn();}},feed:(b:Uint8Array)=>data(b),interrupt:()=>interrupt(),opens:()=>opens,closes:()=>closes};
}
async function main(){
 const f=fixture();const starting=f.voice.start();await flush();
 check(f.opens()===1,'microphone opens before the model roundtrip resolves');
 const first=Uint8Array.from({length:16002},(_,i)=>i%251);const original=first.slice();f.feed(first);first.fill(0);
 check(!f.calls.some(c=>c.method==='speech.dictation.chunk'),'unverified host start cannot receive buffered PCM');
 f.models.resolve(f.model);await flush();check(f.calls.filter(c=>c.method==='speech.dictation.start').length===1,'one original host start');
 const ending=f.voice.finish();check(f.closes()===1,'release while start is pending closes microphone synchronously');
 f.start.resolve({dictationId:'capture',modelId:'local'});await starting;await ending;await flush();
 const chunks=f.calls.filter(c=>c.method==='speech.dictation.chunk');
 check(chunks.length===2,'one complete chunk and one short tail flush exactly once');
 const decoded=Buffer.concat(chunks.map(c=>Buffer.from(c.params!.audioBase64 as string,'base64')));
 check(decoded.equals(Buffer.from(original)),'all first PCM bytes survive in original order without mutable event aliasing');
 check(chunks.every((c,i)=>c.params?.seq===i&&c.params.sampleRate===16000),'one sequential original PCM stream');
 check(f.calls.filter(c=>c.method==='speech.dictation.finish').length===1&&f.voice.getSnapshot().phase==='draft','finish once after verified start and drain');
 const g=fixture();const pending=g.voice.start();await flush();g.feed(new Uint8Array(320000));g.feed(new Uint8Array(2));
 check(g.voice.getSnapshot().error==='audio_overflow'&&g.closes()===1,'pending buffer overflow closes instead of dropping the first word');
 g.models.resolve(g.model);g.start.resolve({dictationId:'capture',modelId:'local'});await pending;
 check(!g.calls.some(c=>c.method==='speech.dictation.start'||c.method==='speech.dictation.chunk'),'overflow never starts or replays buffered speech');
 const h=fixture();const unknown=h.voice.start();await flush();h.feed(new Uint8Array(16000));h.models.resolve(h.model);await flush();h.start.reject(new Error('synthetic timeout'));await unknown;
 check(h.voice.getSnapshot().phase==='error'&&!h.calls.some(c=>c.method==='speech.dictation.chunk'),'unknown start drops PCM with no retry');
 check(h.calls.filter(c=>c.method==='speech.dictation.start').length===1,'unknown start is never automatically retried');

 for(const boundary of [320000,320002]){
  const b=fixture();const begun=b.voice.start();await flush();b.feed(new Uint8Array(boundary));
  check(boundary===320000?b.voice.getSnapshot().phase==='recording':b.voice.getSnapshot().error==='audio_overflow','exact pending byte limit');
  await b.voice.cancel();b.models.resolve(b.model);await begun;
 }
 for(const stage of ['permission','open'] as const){
  const b=fixture(),wait=deferred<boolean>();b.controls[stage]=wait.promise;const begun=b.voice.start();await flush();
  await b.voice.finish();wait.resolve(true);await begun;
  check(!b.calls.length&&b.voice.getSnapshot().phase==='idle','finish during permission/native opening prevents late host start');
 }
 {
  const b=fixture();b.controls.permission=Promise.resolve(false);await b.voice.start();check(b.opens()===0&&b.calls.length===0&&b.voice.getSnapshot().error==='microphone_denied','permission denied has no native capture or host call');
 }
 {
  const b=fixture();b.controls.early=new Uint8Array([9,8]);const begun=b.voice.start();await flush();b.models.resolve(b.model);b.start.resolve({dictationId:'capture',modelId:'local'});await begun;await b.voice.finish();
  const sent=b.calls.find(c=>c.method==='speech.dictation.chunk');check(Buffer.from(sent!.params!.audioBase64 as string,'base64').equals(Buffer.from([9,8])),'callback before open resolution keeps the first bytes');
 }
 for(const elapsed of [119999,120000]){
  const b=fixture();const begun=b.voice.start();await flush();b.advance(elapsed);check(elapsed<120000?b.voice.getSnapshot().phase==='recording':b.voice.getSnapshot().error==='audio_overflow','capture deadline works without new PCM events');await b.voice.cancel();b.models.resolve(b.model);await begun;
 }
 {
  const b=fixture();const begun=b.voice.start();await flush();b.feed(new Uint8Array([0,127]));const high=b.voice.getSnapshot().level!;b.advance(100);b.feed(new Uint8Array(2));check(high>0&&b.voice.getSnapshot().level===0,'volume falls back to silence rather than keeping the heard latch');
  const frozen=b.voice.getSnapshot();b.feed(new Uint8Array(2));check(b.voice.getSnapshot()===frozen,'same quiet audio cannot publish more than ten levels per second');await b.voice.cancel();check(b.voice.getSnapshot().level===0&&b.timers.size===0,'cancel clears level and timer');b.models.resolve(b.model);await begun;
 }
 for(const interrupted of ['background','odd','malformed','chunkunknown'] as const){
  const b=fixture();const begun=b.voice.start();await flush();
  if(interrupted==='background'){b.voice.handleAppState('background');b.models.resolve(b.model);await begun;check(!b.calls.some(c=>c.method==='speech.dictation.start'),'background cannot start late host session');continue;}
  if(interrupted==='odd'){b.feed(new Uint8Array(3));b.models.resolve(b.model);await begun;check(b.voice.getSnapshot().error==='audio_overflow','odd PCM bytes fail instead of changing the format');continue;}
  b.models.resolve(b.model);b.start.resolve({dictationId:interrupted==='malformed'?'wrong':'capture',modelId:'local'});await begun;
  if(interrupted==='malformed'){check(b.voice.getSnapshot().error==='host_failed'&&!b.calls.some(c=>c.method==='speech.dictation.chunk'),'mismatched original start identity never flushes');continue;}
  const pending=deferred<unknown>();b.controls.chunk=pending.promise;b.feed(new Uint8Array(16000));b.feed(new Uint8Array(304000));b.feed(new Uint8Array(2));check(b.voice.getSnapshot().error==='audio_overflow','in-flight PCM counts toward the same 320KB cap');pending.reject(new Error('synthetic chunk unknown'));await flush();check(b.calls.filter(c=>c.method==='speech.dictation.chunk').length===1&&!b.calls.some(c=>c.method==='speech.dictation.finish'),'unknown in-flight chunk never retries or finishes');
 }
 {
  const b=fixture(),oldPermission=deferred<boolean>();b.controls.permission=oldPermission.promise;const old=b.voice.start();await flush();await b.voice.cancel();
  b.controls.permission=Promise.resolve(true);const current=b.voice.start();await flush();b.voice.handleAppState('inactive');
  check(b.voice.getSnapshot().phase==='idle','a canceled old permission dialog cannot exempt a new actual capture from inactive cancellation');oldPermission.resolve(true);b.models.resolve(b.model);await old;await current;
 }
 {
  const b=fixture();const begun=b.voice.start();await flush();await b.voice.cancel();await b.voice.cancel();
  check(b.closes()===2,'explicit repeated cancellation can retry the exact native teardown without reviving capture');b.models.resolve(b.model);await begun;
 }
 console.log(`PASS: ${count} microphone-first buffer assertions (synthetic PCM and controlled host only)`);
}
void main();
