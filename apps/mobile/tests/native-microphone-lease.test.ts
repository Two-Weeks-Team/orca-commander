import {createNativeMicrophone} from '../src/adapters/native-microphone';
import {createAudioArbiter} from '../src/adapters/audio-arbiter';
type AudioModule=typeof import('@orca/expo-two-way-audio');
let checks=0;function check(value:unknown,message:string){checks++;if(!value)throw new Error(message);}
function harness(){
 const arbiter=createAudioArbiter();
 const listeners=new Map<string,(event:any)=>void>();
 const state={initializes:0,teardowns:0,starts:0,removals:0,
  initialize:async()=>true,
  teardown:():unknown=>undefined,
  toggle:(value:boolean)=>value,
  addFailure:false,removeFailure:false,
 };
 const native={
  requestMicrophonePermissionsAsync:async()=>({granted:true}),
  initialize:()=>{state.initializes++;return state.initialize();},
  toggleRecording:(value:boolean)=>{if(value)state.starts++;return state.toggle(value);},
  bypassVoiceProcessing:()=>{},
  tearDown:()=>{state.teardowns++;return state.teardown();},
  addExpoTwoWayAudioEventListener:(name:string,callback:(event:any)=>void)=>{
   if(state.addFailure&&name==='onAudioInterruption')throw new Error('listener');
   listeners.set(name,callback);
   return{remove(){state.removals++;listeners.delete(name);if(state.removeFailure)throw new Error('remove');}};
  },
 } as unknown as AudioModule;
 return{arbiter,state,listeners,mic:createNativeMicrophone(()=>native,arbiter),native};
}
async function main(){
 {
  const h=harness();const speech=h.arbiter.acquire('speech')!;
  check(await h.mic.permission(),'permission remains available while speech owns audio');
  check(h.arbiter.getSnapshot().kind==='speech','permission does not replace the speech lease');
  check(!await h.mic.open(()=>{},()=>{})&&h.state.initializes===0,'speech prevents native microphone initialize');
  h.mic.close();check(h.arbiter.getSnapshot().kind==='speech','nonowner close does not release speech');
  h.arbiter.release(speech);
 }
 {
  const h=harness();let finish!:(value:boolean)=>void;
  h.state.initialize=()=>new Promise(resolve=>{finish=resolve;});
  const opening=h.mic.open(()=>{},()=>{});
  check(h.arbiter.getSnapshot().kind==='mic','lease acquired before pending native initialization');
  h.mic.close();
  check(h.listeners.size===0&&h.state.teardowns===0,'pending close detaches callbacks but waits for initialization');
  check(h.arbiter.acquire('speech')===null,'canceled pending initialization still blocks speech');
  check(!await h.mic.open(()=>{},()=>{}),'same microphone cannot replace its pending operation');
  finish(true);check(!await opening,'canceled initialization cannot start capture');
  check(h.state.starts===0&&h.state.teardowns===1,'settled initialization is torn down without unmuting capture');
  const speech=h.arbiter.acquire('speech');check(speech!==null,'speech becomes available only after actual teardown');h.arbiter.release(speech!);
 }
 {
  const h=harness();let forwarded=0,interrupted=0;
  check(await h.mic.open(()=>{forwarded++;},()=>{interrupted++;}),'capture starts for teardown failure case');
  const lateData=h.listeners.get('onMicrophoneData')!;
  const lateInterrupt=h.listeners.get('onAudioInterruption')!;
  h.state.teardown=()=>{throw new Error('teardown');};h.mic.close();
  check(h.arbiter.getSnapshot().kind==='mic'&&h.arbiter.acquire('speech')===null,'teardown exception retains the exact microphone lease');
  lateData({data:new Uint8Array([1,2])});lateInterrupt({});
  check(forwarded===0&&interrupted===0,'detached late callbacks cannot revive canceled capture');
  check(!await h.mic.open(()=>{},()=>{}),'failed teardown cannot be bypassed by reopening');
  h.state.teardown=()=>undefined;h.mic.close();
  check(h.arbiter.getSnapshot().kind===null&&h.state.teardowns===2,'explicit close retries the same teardown and releases after normal return');
 }
 {
  const h=harness();await h.mic.open(()=>{},()=>{});
  h.state.toggle=value=>{if(!value)throw new Error('mute');return true;};
  h.state.removeFailure=true;
  h.state.teardown=()=>{
   check(h.arbiter.acquire('speech')===null,'speech remains blocked inside synchronous native teardown');
   return null; // The real Android Expo Function returns null; iOS returns undefined.
  };
  h.mic.close();
  check(h.arbiter.getSnapshot().kind===null,'normal full native teardown confirms release even if preliminary mute/listener removal throws');
 }
 {
  const h=harness();await h.mic.open(()=>{},()=>{});
  h.state.teardown=()=>false;h.mic.close();
  check(h.arbiter.getSnapshot().kind==='mic','unexpected teardown result is not a confirmed void/null native completion');
  h.state.teardown=()=>undefined;h.mic.close();
  check(h.arbiter.getSnapshot().kind===null,'expected synchronous void completion releases the retained owner');
 }
 for(const outcome of ['false','throw'] as const){
  const h=harness();h.state.initialize=async()=>{if(outcome==='throw')throw new Error('initialize');return false;};
  check(!await h.mic.open(()=>{},()=>{}),'failed initialization does not report capture');
  check(h.state.teardowns===1&&h.arbiter.getSnapshot().kind===null,'settled failed initialization still receives confirmed teardown');
 }
 {
  const h=harness();h.state.toggle=()=>false;
  check(!await h.mic.open(()=>{},()=>{}),'failed recording start is reported as false');
  check(h.state.teardowns===1&&h.arbiter.getSnapshot().kind===null,'failed recording start does not retain a successfully torn down engine');
 }
 {
  const h=harness();h.state.addFailure=true;
  check(!await h.mic.open(()=>{},()=>{}),'listener registration failure does not open native capture');
  check(h.state.initializes===0&&h.state.removals===1&&h.arbiter.getSnapshot().kind===null,'partially registered listeners are detached and unopened audio releases');
 }
 {
  const h=harness();let forwarded=0;
  await h.mic.open(()=>{},()=>{});
  const old=h.listeners.get('onMicrophoneData')!;
  let newOpening:Promise<boolean>|undefined;
  const unsubscribe=h.arbiter.subscribe(()=>{
   if(h.arbiter.getSnapshot().kind===null){unsubscribe();newOpening=h.mic.open(()=>{forwarded++;},()=>{});}
  });
  h.mic.close();check(await newOpening,'a new exact owner can acquire from the confirmed release observer');
  old({data:new Uint8Array([1,2])});
  check(forwarded===0&&h.arbiter.getSnapshot().kind==='mic','old close/callback cannot clear or feed a reentrant new capture');
  h.listeners.get('onMicrophoneData')!({data:new Uint8Array([1,2])});
  check(forwarded===1,'new capture retains its own native callback');
  h.mic.close();check(h.arbiter.getSnapshot().kind===null,'new owner closes independently');
 }
 console.log(`PASS: ${checks} native microphone lease assertions (injected native ports; no device)`);
}
void main();
