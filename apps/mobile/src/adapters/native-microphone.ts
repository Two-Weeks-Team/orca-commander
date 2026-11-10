import {setFeedbackCaptureActive} from './deck-feedback';
import {audioArbiter, type AudioArbiter, type AudioLease} from './audio-arbiter';
import type {Microphone} from './host-dictation';
type AudioModule = typeof import('@orca/expo-two-way-audio');
type Attempt = {
 lease: AudioLease;
 opening: boolean;
 canceled: boolean;
 releasing: boolean;
 initializationStarted: boolean;
 subscriptions: {remove():void}[];
};

/** Native loading is permission/open only; permission itself never owns audio. */
export function createNativeMicrophone(
 loadModule:()=>AudioModule = ()=>require('@orca/expo-two-way-audio') as AudioModule,
 arbiter:AudioArbiter = audioArbiter,
):Microphone {
 let audio:AudioModule|undefined;
 let current:Attempt|undefined;
 const module = ()=>audio??(audio=loadModule());
 const detach = (attempt:Attempt)=>{
  const subscriptions=attempt.subscriptions;
  attempt.subscriptions=[];
  for(const sub of subscriptions){try{sub.remove();}catch{/* Native teardown, not listener removal, ends ownership. */}}
 };
 const release = (attempt:Attempt)=>{
  if(current!==attempt||attempt.opening||attempt.releasing)return;
  attempt.releasing=true;
  detach(attempt);
  try{
   if(attempt.initializationStarted){
    try{audio!.toggleRecording(false);}catch{/* Still require the stronger full teardown below. */}
    // Pinned two-way-audio uses synchronous Expo Function tearDown on both platforms.
    // iOS returns void; Android returns null, after native I/O stop/resource release.
    // toggleRecording(false) returns the stopped state false, not a failure flag.
    const result:unknown=audio!.tearDown();
    if(result!==undefined&&result!==null)return;
   }
   current=undefined;
   // Clear feedback before notifying lease observers: a new mic may acquire reentrantly.
   setFeedbackCaptureActive(false);
   arbiter.release(attempt.lease);
  }catch{/* A throwing/unknown native teardown retains this exact lease for close retry. */}
  finally{attempt.releasing=false;}
 };
 return {
  permission:async()=>{try{return(await module().requestMicrophonePermissionsAsync()).granted===true;}catch{return false;}},
  open:async(onData,onInterrupt)=>{
   const lease=arbiter.acquire('mic');
   if(!lease)return false;
   const attempt:Attempt={lease,opening:true,canceled:false,releasing:false,initializationStarted:false,subscriptions:[]};
   current=attempt;
   setFeedbackCaptureActive(true);
   let opened=false;
   try{
    const native=module();
    attempt.subscriptions.push(native.addExpoTwoWayAudioEventListener('onMicrophoneData',event=>{
     if(current===attempt&&!attempt.canceled)onData(event.data instanceof Uint8Array?event.data:new Uint8Array(event.data));
    }));
    attempt.subscriptions.push(native.addExpoTwoWayAudioEventListener('onAudioInterruption',()=>{
     if(current===attempt&&!attempt.canceled)onInterrupt();
    }));
    // The async initializer may own I/O before its Promise settles. Never release early.
    attempt.initializationStarted=true;
    if(await native.initialize()!==true||attempt.canceled)return false;
    // Dictation has no speaker playback to echo-cancel; preserve the existing acoustic path.
    native.bypassVoiceProcessing(true);
    if(attempt.canceled)return false;
    if(native.toggleRecording(true)!==true||attempt.canceled)return false;
    opened=true;
    return true;
   }catch{return false;}
   finally{
    attempt.opening=false;
    if(!opened||attempt.canceled){attempt.canceled=true;release(attempt);}
   }
  },
  close:()=>{
   const attempt=current;
   if(!attempt)return;
   attempt.canceled=true;
   detach(attempt);
   release(attempt);
  },
 };
}
