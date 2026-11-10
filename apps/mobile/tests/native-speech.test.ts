import {createNativeSpeech, type NativeSpeechModule, type SpeechScheduler} from '../src/adapters/native-speech';
import {createAudioArbiter} from '../src/adapters/audio-arbiter';
let checks=0;function check(value:unknown,message:string){checks++;if(!value)throw new Error(message);}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function harness(){
 const arbiter=createAudioArbiter();
 const timers=new Map<number,()=>void>(),durations=new Map<number,number>();const requested:number[]=[];let timerID=0;
 const scheduler:SpeechScheduler={setTimeout(callback,ms){check([32_000,2_000,100].includes(ms),'only the original deadline and bounded preparation timers are scheduled');requested.push(ms);const id=++timerID;durations.set(id,ms);timers.set(id,()=>{timers.delete(id);durations.delete(id);callback();});return id;},clearTimeout(id){timers.delete(id as number);durations.delete(id as number);}};
 const listeners=new Set<(event:{id:string;reason:string})=>void>();
 const state={loaded:0,prepares:0,speaks:0,stops:0,id:'',
  prepare:async()=>({ready:true}),speak:async()=>({accepted:true}),stop:async()=>true,
  listenerThrows:false,
 };
 const module={prepare:()=>{state.prepares++;return state.prepare();},speak:(id:string)=>{state.id=id;state.speaks++;return state.speak();},stop:()=>{state.stops++;return state.stop();},
  addListener:(_name:string,listener:(event:{id:string;reason:string})=>void)=>{if(state.listenerThrows)throw new Error('listener');listeners.add(listener);return{remove(){listeners.delete(listener);}};},
 } as NativeSpeechModule;
 let serial=0;
 const speech=createNativeSpeech(()=>{state.loaded++;return module;},arbiter,()=>`speech-${++serial}`,scheduler);
 const emit=(reason:string,id=state.id)=>{for(const listener of [...listeners])listener({id,reason});};
 return{arbiter,state,listeners,timers,durations,requested,speech,emit,fire(ms:number){const entry=[...timers].find(([id])=>durations.get(id)===ms);if(!entry)return false;entry[1]();return true;},timeout(){for(const [id,callback] of [...timers])if(durations.get(id)===32_000)callback();}};
}
async function main(){
 const h=harness();check(h.state.loaded===0,'constructing adapter never loads native speech');
 const result=h.speech.speak('synthetic','en-US');await flush();
 check(h.arbiter.getSnapshot().kind==='speech'&&h.state.speaks===1,'submission holds an exclusive speech lease');
 check(h.arbiter.acquire('mic')===null,'microphone cannot overlap submitted speech');
 check(await h.speech.speak('replacement','en-US')==='unavailable'&&h.state.speaks===1,'active speech never queues a replacement utterance');
 h.emit('finished');check(await result==='finished','accepted exact native completion reports finished');
 check(h.arbiter.getSnapshot().kind===null&&h.listeners.size===0,'confirmed native completion releases lease and listener');
 {
  const h=harness();const pending=deferred<{ready:boolean}>();h.state.prepare=()=>pending.promise;
  const result=h.speech.speak('synthetic','ko-KR');
  check(h.arbiter.getSnapshot().kind===null,'preparation holds no audio lease');
  h.speech.cancel();check(await result==='interrupted','cancel during prepare settles without native audio');
  const mic=h.arbiter.acquire('mic');check(mic!==null,'microphone remains available after canceled preparation');
  pending.resolve({ready:true});await flush();
  check(h.state.speaks===0&&h.listeners.size===0,'late canceled preparation never submits or registers playback');h.arbiter.release(mic!);
 }
 {
  const h=harness();const mic=h.arbiter.acquire('mic')!;
  const result=h.speech.speak('synthetic','en-US');
  check(await result==='unavailable'&&h.state.speaks===0,'microphone ownership blocks speech after preparation');
  check(h.arbiter.getSnapshot().kind==='mic','speech failure does not release another owner');h.arbiter.release(mic);
 }
 for(const accepted of [true,false]){
  const h=harness();const pending=deferred<{accepted:boolean}>();h.state.speak=()=>pending.promise;
  let settled=false;const result=h.speech.speak('synthetic','en-US');void result.then(()=>{settled=true;});await flush();
  h.emit('finished');await flush();
  check(h.arbiter.getSnapshot().kind===null&&!settled,'native terminal releases audio but waits for submission acceptance');
  pending.resolve({accepted});check(await result===(accepted?'finished':'unavailable'),'early finished event requires accepted true to report success');
 }
 {
  const h=harness();const pending=deferred<{accepted:boolean}>();h.state.speak=()=>pending.promise;
  const result=h.speech.speak('synthetic','en-US');await flush();h.emit('finished');h.speech.cancel();
  check(await result==='interrupted','cancel before acceptance prevents early native finished from becoming success');
  pending.resolve({accepted:true});await flush();
  check(await result==='interrupted'&&h.state.stops===0,'late acceptance cannot rewrite cancellation after confirmed native end');
 }
 {
  const h=harness();const submission=deferred<{accepted:boolean}>();const stop=deferred<boolean>();
  h.state.speak=()=>submission.promise;h.state.stop=()=>stop.promise;
  const first=h.speech.speak('synthetic','en-US');await flush();
  const idA=h.state.id,oldCallback=[...h.listeners][0],oldTimer=[...h.timers.values()][0];
  h.speech.cancel();check(h.state.stops===1&&h.arbiter.acquire('mic')===null,'cancel waits for native stop acknowledgement');
  h.emit('stopped');check(await first==='interrupted','exact native stop settles canceled submission before speak Promise');
  h.state.speak=async()=>({accepted:true});h.state.stop=async()=>true;
  const second=h.speech.speak('different synthetic','en-US');await flush();
  const idB=h.state.id;
  stop.resolve(false);submission.resolve({accepted:true});oldCallback({id:idA,reason:'finished'});oldTimer();h.emit('finished',idA);await flush();
  check(idA!==idB&&h.arbiter.getSnapshot().kind==='speech'&&h.speech.getSnapshot().phase==='speaking','late old stop/submission/event/timer cannot retire a new run');
  h.emit('finished',idB);check(await second==='finished','new exact owner completes independently');
 }
 for(const failure of ['rejected','throw','cancel','timeout','stop-throw'] as const){
  const h=harness();h.state.stop=async()=>false;
  if(failure==='stop-throw')h.state.stop=async()=>{throw new Error('stop');};
  if(failure==='rejected')h.state.speak=async()=>({accepted:false});
  if(failure==='throw')h.state.speak=async()=>{throw new Error('submission');};
  const result=h.speech.speak('synthetic','en-US');await flush();
  if(failure==='cancel'||failure==='stop-throw')h.speech.cancel();
  if(failure==='timeout')h.timeout();
  check(await result==='uncertain','unconfirmed stop reports uncertainty');
  check(h.speech.getSnapshot().phase==='uncertain'&&h.arbiter.acquire('mic')===null&&h.listeners.size===1,'uncertain result retains exact native listener and exclusive lease');
  h.emit('finished','foreign');check(h.arbiter.getSnapshot().kind==='speech','wrong terminal ID cannot release quarantine');
  check(await h.speech.speak('replacement','en-US')==='unavailable','quarantine refuses replacement speech');
  const stops=h.state.stops;h.speech.cancel();await flush();
  check(h.state.stops===stops&&h.arbiter.getSnapshot().kind==='speech','repeated cancel never clears or retries quarantined native ownership');
  h.emit('finished');await flush();
  check(h.arbiter.getSnapshot().kind===null&&h.listeners.size===0&&h.speech.getSnapshot().phase==='idle','late exact terminal finally releases quarantine');
  check(await result==='uncertain','late cleanup never rewrites the already returned uncertain result');
 }
 for(const failure of ['rejected','throw'] as const){
  const h=harness();h.state.speak=async()=>{if(failure==='throw')throw new Error('submission');return{accepted:false};};
  const result=h.speech.speak('synthetic','en-US');
  check(await result==='unavailable'&&h.state.stops===1&&h.arbiter.getSnapshot().kind===null,'failed submission releases only after confirmed native stop');
 }
 {
  const h=harness();const stop=deferred<boolean>();h.state.stop=()=>stop.promise;
  const result=h.speech.speak('synthetic','en-US');await flush();h.speech.cancel();
  check(h.speech.getSnapshot().phase==='stopping'&&h.listeners.size===1,'pending stop retains callback and ownership');
  stop.resolve(true);check(await result==='interrupted'&&h.arbiter.getSnapshot().kind===null,'confirmed explicit stop releases canceled speech');
 }
 {
  const h=harness();h.state.prepare=async()=>({ready:false});
  check(await h.speech.speak('synthetic','en-US')==='unavailable','unready local voice refuses playback');
  check(h.arbiter.getSnapshot().kind===null&&h.state.speaks===0&&h.listeners.size===0,'unready preparation has no audio side effect');
 }
 {
  const h=harness();h.state.listenerThrows=true;
  check(await h.speech.speak('synthetic','en-US')==='unavailable','failed event registration refuses native submission');
  check(h.state.speaks===0&&h.state.stops===0&&h.arbiter.getSnapshot().kind===null,'unsubmitted listener failure safely releases its lease without native stop');
 }
 {
  const h=harness();const unsubscribe=h.arbiter.subscribe(()=>{if(h.arbiter.getSnapshot().kind==='speech')h.speech.cancel();});
  check(await h.speech.speak('synthetic','en-US')==='interrupted','reentrant cancel during lease notification preserves cancellation');
  check(h.arbiter.getSnapshot().kind===null&&h.state.speaks===0&&h.listeners.size===0,'reentrant pre-submit cancellation neither leaks lease nor starts speech');unsubscribe();
 }
 {
  const h=harness();const unsubscribe=h.speech.subscribe(()=>{if(h.speech.getSnapshot().phase==='speaking')h.speech.cancel();});
  check(await h.speech.speak('synthetic','en-US')==='interrupted','phase observer cancellation before native call wins');
  check(h.state.speaks===0&&h.state.stops===0&&h.arbiter.getSnapshot().kind===null,'pre-submit phase cancellation never queues a late utterance');unsubscribe();
 }
 {
  const h=harness();h.speech.subscribe(()=>{throw new Error('view');});
  const result=h.speech.speak('synthetic','en-US');await flush();h.emit('error');
  check(await result==='interrupted'&&h.arbiter.getSnapshot().kind===null,'view error and native error cannot prevent confirmed cleanup');
  check(Object.isFrozen(h.speech.getSnapshot())&&Object.keys(h.speech.getSnapshot()).join(',')==='phase','cached snapshot exposes phase only, with no content or target');
 }
 {
  const h=harness();let notifications=0;const unsubscribe=h.speech.subscribe(()=>{notifications++;});
  const result=h.speech.speak('synthetic','en-US');await flush();unsubscribe();const before=notifications;
  check(h.arbiter.getSnapshot().kind==='speech'&&h.listeners.size===1,'view unsubscribe leaves the native listener and audio lease intact');
  h.emit('finished');check(await result==='finished'&&notifications===before,'native completion remains owned after the view unsubscribes');
 }
 {
  const h=harness();h.state.prepare=async()=>h.state.prepares===1?{ready:false,reason:'loading'}:{ready:true};
  const result=h.speech.speak('synthetic','ko-KR');await flush();
  check(h.speech.getSnapshot().phase==='preparing'&&h.arbiter.getSnapshot().kind===null,'first Android loading waits for preparation without owning audio');
  check(h.fire(100),'loading schedules a bounded preparation poll');await flush();
  check(h.state.prepares===2&&h.state.speaks===1,'loading then ready submits native speech exactly once');
  check(h.requested.filter(ms=>ms===32_000).length===1,'preparation polling never renews the original 32 second deadline');
  check([...h.durations.values()].join(',')==='32000','readiness clears preparation timers and preserves only the original deadline');
  h.emit('finished');check(await result==='finished'&&h.timers.size===0,'first Android request finishes and cleans all timers');
 }
 {
  const h=harness();h.state.prepare=async()=>({ready:false,reason:'loading'});
  const result=h.speech.speak('synthetic','ko-KR');await flush();
  for(let attempt=1;attempt<20;attempt++){
   check(h.arbiter.getSnapshot().kind===null&&h.state.speaks===0,'every loading poll remains silent and lease-free');
   check(h.fire(100),'each remaining bounded attempt has one 100ms poll');await flush();
  }
  check(await result==='unavailable'&&h.state.prepares===20,'twenty loading responses exhaust the preparation bound');
  check(h.state.speaks===0&&h.timers.size===0&&h.listeners.size===0,'exhaustion submits nothing and clears all timers');
  check(h.requested.filter(ms=>ms===32_000).length===1&&h.requested.filter(ms=>ms===2_000).length===1,'neither deadline is extended by repeated loading');
 }
 for(const reason of ['unavailable','background','busy','focus_denied']){
  const h=harness();h.state.prepare=async()=>({ready:false,reason});
  check(await h.speech.speak('synthetic','en-US')==='unavailable','non-loading refusal ends preparation immediately');
  check(h.state.prepares===1&&h.state.speaks===0&&h.requested.join(',')==='32000'&&h.timers.size===0,'non-loading reasons never poll or submit');
 }
 {
  const h=harness();h.state.prepare=async()=>({ready:false,reason:'loading'});
  const first=h.speech.speak('synthetic','ko-KR');await flush();
  const poll=[...h.timers].find(([id])=>h.durations.get(id)===100)![1];
  const preparationDeadline=[...h.timers].find(([id])=>h.durations.get(id)===2_000)![1];
  h.speech.cancel();check(await first==='interrupted'&&h.timers.size===0,'cancel clears pending loading poll and both deadlines');
  check(h.arbiter.getSnapshot().kind===null&&h.state.stops===0,'cancel during poll owns no native playback to stop');
  h.state.prepare=async()=>({ready:true});const second=h.speech.speak('different synthetic','en-US');await flush();
  const calls=h.state.prepares;poll();preparationDeadline();await flush();
  check(h.state.prepares===calls&&h.state.speaks===1&&h.arbiter.getSnapshot().kind==='speech','old loading poll/deadline cannot prepare or retire a new run');
  h.emit('finished');check(await second==='finished','new run survives stale preparation callbacks');
 }
 for(const expiry of [2_000,32_000,'cancel'] as const){
  const h=harness();const late=deferred<{ready:boolean}>();
  h.state.prepare=()=>h.state.prepares===1?Promise.resolve({ready:false,reason:'loading'}):late.promise;
  const first=h.speech.speak('synthetic','ko-KR');await flush();
  check(h.fire(100),'second preparation begins after one bounded poll');await flush();
  if(expiry==='cancel')h.speech.cancel();
  else check(h.fire(expiry),'the original run owns its preparation/global deadline');
  check(await first===(expiry===2_000?'unavailable':'interrupted'),'expiry settles loading without submitting audio');
  check(h.timers.size===0&&h.state.speaks===0&&h.arbiter.getSnapshot().kind===null,'expiry clears poll/deadline timers without an audio lease');
  h.state.prepare=async()=>({ready:true});const second=h.speech.speak('different synthetic','en-US');await flush();
  late.resolve({ready:true});await flush();
  check(h.state.speaks===1&&h.arbiter.getSnapshot().kind==='speech','late readiness from expired preparation cannot submit or release the new run');
  h.emit('finished');check(await second==='finished','new run completes after expired preparation resolves late');
 }
 console.log(`PASS: ${checks} native speech adapter assertions (injected native ports; no device)`);
}
void main();
