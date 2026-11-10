import {audioArbiter, type AudioArbiter, type AudioLease} from './audio-arbiter';

export type SpeechLanguage='ko-KR'|'en-US';
export type SpeechResult='finished'|'interrupted'|'unavailable'|'uncertain';
export type SpeechPhase='idle'|'preparing'|'speaking'|'stopping'|'uncertain';
export type SpeechSnapshot=Readonly<{phase:SpeechPhase}>;
type TerminalReason='finished'|'stopped'|'error'|'interrupted';
export interface NativeSpeechModule {
 prepare(language:SpeechLanguage):Promise<{ready:boolean;reason?:string}>;
 speak(id:string,text:string,language:string,rate:number):Promise<{accepted:boolean;reason?:string}>;
 stop():Promise<boolean>;
 addListener(name:'onSpeechFinished',listener:(event:{id:string;reason:TerminalReason})=>void):{remove():void};
}
export interface SpeechScheduler {
 setTimeout(callback:()=>void,milliseconds:number):unknown;
 clearTimeout(handle:unknown):void;
}
export interface NativeSpeech {
 speak(text:string,language:SpeechLanguage,rate?:number):Promise<SpeechResult>;
 cancel():void;
 getSnapshot():SpeechSnapshot;
 subscribe(listener:()=>void):()=>void;
}
const schedulerDefault:SpeechScheduler={
 setTimeout:(callback,milliseconds)=>setTimeout(callback,milliseconds),
 clearTimeout:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const snapshots:Record<SpeechPhase,SpeechSnapshot>={
 idle:Object.freeze({phase:'idle'}),preparing:Object.freeze({phase:'preparing'}),
 speaking:Object.freeze({phase:'speaking'}),stopping:Object.freeze({phase:'stopping'}),
 uncertain:Object.freeze({phase:'uncertain'}),
};
type Run={
 text?:string;language:SpeechLanguage;rate:number;id?:string;native?:NativeSpeechModule;
 lease?:AudioLease;subscription?:{remove():void};submitted:boolean;canceled:boolean;
 accepted:'pending'|boolean;terminal?:TerminalReason;stopPending:boolean;
 quarantined:boolean;
 timer?:unknown;hasTimer:boolean;settled:boolean;resolve(result:SpeechResult):void;
 pollTimer?:unknown;hasPollTimer:boolean;preparationTimer?:unknown;hasPreparationTimer:boolean;
 resumePreparation?:(ready:boolean)=>void;
};

/** Local playback only. Phase/listener cleanup never grants authority to release audio. */
export function createNativeSpeech(
 loadModule:()=>NativeSpeechModule=()=>(require('../../modules/deck-speech') as {DeckSpeech:NativeSpeechModule}).DeckSpeech,
 arbiter:AudioArbiter=audioArbiter,
 newId:()=>string=()=>(require('expo-crypto') as typeof import('expo-crypto')).randomUUID(),
 scheduler:SpeechScheduler=schedulerDefault,
):NativeSpeech {
 let native:NativeSpeechModule|undefined;
 let current:Run|undefined;
 let snapshot=snapshots.idle;
 const listeners=new Set<()=>void>();
 const publish=(phase:SpeechPhase)=>{
  if(snapshot===snapshots[phase])return;
  snapshot=snapshots[phase];
  for(const listener of [...listeners]){try{listener();}catch{/* Playback ownership is independent of views. */}}
 };
 const clearDeadline=(run:Run)=>{
  if(!run.hasTimer)return;
  run.hasTimer=false;
  try{scheduler.clearTimeout(run.timer);}catch{/* The expected-run guard still rejects a stale timer. */}
 };
 const clearPreparation=(run:Run)=>{
  const resume=run.resumePreparation;run.resumePreparation=undefined;
  if(run.hasPollTimer){
   run.hasPollTimer=false;
   try{scheduler.clearTimeout(run.pollTimer);}catch{/* Exact resolver/run guards reject stale polls. */}
  }
  if(run.hasPreparationTimer){
   run.hasPreparationTimer=false;
   try{scheduler.clearTimeout(run.preparationTimer);}catch{/* The deadline also checks preparation ownership. */}
  }
  resume?.(false);
 };
 const settle=(run:Run,result:SpeechResult)=>{
  if(run.settled)return;
  run.settled=true;clearDeadline(run);clearPreparation(run);run.resolve(result);
 };
 const releaseLease=(run:Run)=>{
  const lease=run.lease;run.lease=undefined;
  if(lease)arbiter.release(lease);
 };
 const retire=(run:Run,result:SpeechResult)=>{
  if(current!==run)return;
  current=undefined;run.text=undefined;
  settle(run,result);
  const subscription=run.subscription;run.subscription=undefined;
  try{subscription?.remove();}catch{/* Old callback guards remain in force. */}
  publish('idle');
  // Last operation: a release observer may immediately create a different owner/run.
  releaseLease(run);
 };
 const fromTerminal=(run:Run)=>{
  if(current!==run||run.terminal===undefined)return;
  if(run.canceled){retire(run,'interrupted');return;}
  if(run.accepted==='pending')return;
  retire(run,run.accepted&&run.terminal==='finished'?'finished':run.accepted?'interrupted':'unavailable');
 };
 const terminal=(run:Run,event:{id:string;reason:TerminalReason})=>{
  if(current!==run||!run.submitted||event?.id!==run.id||run.terminal!==undefined||
    !['finished','stopped','error','interrupted'].includes(event.reason))return;
  run.terminal=event.reason;
  // The native module emits terminal only after exact request playback/flush confirmation.
  releaseLease(run);
  fromTerminal(run);
 };
 const stop=async(run:Run)=>{
  if(current!==run||run.stopPending)return;
  run.stopPending=true;
  publish('stopping');
  if(current!==run)return;
  let confirmed=false;
  try{confirmed=await run.native!.stop()===true;}catch{/* Submission or stop uncertainty retains the lease. */}
  if(current!==run)return;
  run.stopPending=false;
  if(confirmed||run.terminal!==undefined){retire(run,run.canceled?'interrupted':'unavailable');return;}
  // Resolve the caller without discarding the exact native listener or its lease.
  run.quarantined=true;
  settle(run,'uncertain');
  publish('uncertain');
 };
 const cancelRun=(run:Run)=>{
  if(current!==run)return;
  run.canceled=true;run.text=undefined;
  if(run.quarantined)return; // Only a late exact terminal can clear uncertain native ownership.
  if(!run.submitted||run.terminal!==undefined){retire(run,'interrupted');return;}
  void stop(run);
 };
 const waitForPreparation=(run:Run)=>new Promise<boolean>(resolve=>{
  run.resumePreparation=resolve;
  run.pollTimer=scheduler.setTimeout(()=>{
   if(run.resumePreparation!==resolve)return;
   run.resumePreparation=undefined;run.hasPollTimer=false;
   resolve(current===run&&!run.canceled&&!run.submitted);
  },100);
  run.hasPollTimer=true;
 });
 const start=async(run:Run)=>{
  try{
   run.native=native??(native=loadModule());
   if(current!==run)return;
   // Android engine initialization reports loading. Only preparation is polled;
   // playback submission remains exactly once, with no lease held while waiting.
   for(let attempt=1;attempt<=20;attempt++){
    const prepared=await run.native.prepare(run.language);
    if(current!==run)return;
    if(prepared?.ready===true)break;
    if(prepared?.reason!=='loading'||attempt===20){retire(run,'unavailable');return;}
    if(!run.hasPreparationTimer){
     run.preparationTimer=scheduler.setTimeout(()=>{
      if(run.hasPreparationTimer&&current===run&&!run.submitted)retire(run,'unavailable');
     },2_000);
     run.hasPreparationTimer=true;
    }
    if(!await waitForPreparation(run))return;
   }
   clearPreparation(run);
   run.id=newId();
   if(current!==run)return;
   if(typeof run.id!=='string'||!run.id||run.id.length>128){retire(run,'unavailable');return;}
   const lease=arbiter.acquire('speech');
   if(current!==run){if(lease)arbiter.release(lease);return;}
   run.lease=lease??undefined;
   if(!run.lease){console.info('[DeckSpeech] speech lease unavailable');retire(run,'unavailable');return;}
   run.subscription=run.native.addListener('onSpeechFinished',event=>terminal(run,event));
   publish('speaking');
   if(current!==run||run.canceled)return;
   // No observable callback/await between submission ownership and the native call.
   run.submitted=true;
   const submission=run.native.speak(run.id,run.text!,run.language,run.rate);
   run.text=undefined;
   const response=await submission;
   if(current!==run)return;
   run.accepted=response?.accepted===true;
   if(run.terminal!==undefined){fromTerminal(run);return;}
   if(!run.accepted)void stop(run);
  }catch{
   if(current!==run)return;
   run.text=undefined;
   if(!run.submitted){retire(run,'unavailable');return;}
   run.accepted=false;
   if(run.terminal!==undefined)fromTerminal(run);else void stop(run);
  }
 };
 return {
  speak(text,language,rate=1){
   if(current||typeof text!=='string'||!text.length||text.length>4000||
    (language!=='ko-KR'&&language!=='en-US')||!Number.isFinite(rate)||rate<0.5||rate>2)
    return Promise.resolve('unavailable');
   let resolve!:(result:SpeechResult)=>void;
   const result=new Promise<SpeechResult>(done=>{resolve=done;});
   const run:Run={text,language,rate,submitted:false,canceled:false,accepted:'pending',
    stopPending:false,quarantined:false,hasTimer:false,hasPollTimer:false,
    hasPreparationTimer:false,settled:false,resolve};
   current=run;publish('preparing');
   if(current!==run)return result;
   try{
    run.timer=scheduler.setTimeout(()=>cancelRun(run),32_000);run.hasTimer=true;
   }catch{retire(run,'unavailable');return result;}
   void start(run);
   return result;
  },
  cancel(){if(current)cancelRun(current);},
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
 };
}
