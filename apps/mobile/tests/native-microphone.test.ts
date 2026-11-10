import { createNativeMicrophone } from '../src/adapters/native-microphone';
import { audioArbiter } from '../src/adapters/audio-arbiter';

let checks=0;function check(v:unknown,m:string){checks++;if(!v)throw new Error(m);}
async function main(){
 let loaded=0,bypassed=false,recording=false,closed=0,received=0;
 const listeners=new Map<string,(e:any)=>void>();
 const fake={
  requestMicrophonePermissionsAsync:async()=>({granted:true}),initialize:async()=>true,
  bypassVoiceProcessing:(v:boolean)=>{bypassed=v;},
  toggleRecording:(v:boolean)=>{if(v)check(bypassed,'dictation bypasses call-oriented processing before unmuting capture');recording=v;return v;},
  tearDown:()=>{closed++;},
  addExpoTwoWayAudioEventListener:(event:string,callback:(e:any)=>void)=>{listeners.set(event,callback);return{remove:()=>{listeners.delete(event);}};},
 } as unknown as typeof import('@orca/expo-two-way-audio');
 const mic=createNativeMicrophone(()=>{loaded++;return fake;});
 check(loaded===0,'camera/initial app render never loads microphone engine');
 check(await mic.permission(),'explicit microphone request uses native permission');
 check(await mic.open(data=>{received+=data.length;},()=>{}),'native dictation opens');
 check(audioArbiter.acquire('speech')===null,'speech cannot acquire while the actual microphone adapter owns native capture');
 listeners.get('onMicrophoneData')?.({data:new Uint8Array([1,2])});check(recording&&received===2,'original PCM is forwarded without altering bytes');
 const other=createNativeMicrophone(()=>fake);check(!await other.open(()=>{},()=>{}),'a second editor cannot steal active capture');other.close();check(recording,'closing a non-owner cannot stop capture');
 mic.close();check(!recording&&closed===1&&listeners.size===0,'owner teardown releases audio and subscriptions');
 console.log(`PASS: ${checks} microphone boundary assertions (injected native module; no device)`);
}
void main();
