import {useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {HostDictation,type DictationSnapshot} from '../adapters/host-dictation';
import {createNativeMicrophone} from '../adapters/native-microphone';
import type {LiveSession} from '../adapters/live-session';
import {createPttGesture,PTT_HOLD_MS,routeCapturedVoice,type CapturedVoiceContext,type CapturedVoiceDraft,type VoiceNavigationAction} from '../core/ptt-gesture';
import {useMessages} from '../i18n/provider';
import {voiceAvailabilityKeys,voiceErrorKeys} from './voice-messages';
import {mergeVoiceDraft} from './voice-draft';
import {logVoiceTargetStage} from './voice-target-log';

export interface GlobalDeckVoiceProps {
 session:LiveSession;enabled:boolean;confirmationOpen:boolean;captureAvailable?:boolean;
 onCaptureStart?():boolean;
 onCaptureFinished?():void;
 beforeCapture?():Promise<boolean>;
 getContext():CapturedVoiceContext;
 onNavigate(intent:VoiceNavigationAction):void;
 onDraft(draft:CapturedVoiceDraft,meta?:{completed:boolean}):void;
}
interface CaptureRun {context:CapturedVoiceContext;session:LiveSession;canceled:boolean;targetChanged:boolean;delivered:boolean;finished:boolean;waiting:boolean;started:boolean;finishRequested:boolean;pressedAt:number|null;onFinished?:()=>void}
const capturing=(phase:DictationSnapshot['phase'])=>['loading','starting','recording','finishing'].includes(phase);
/** Global capture locks its starting target for presentation; it owns no action client, prepare, confirmation or send capability. */
export function useGlobalDeckVoice(props:GlobalDeckVoiceProps){
 const {t}=useMessages();
 const current=useRef(props);current.current=props;
 const renderedContext=props.getContext(),generation=renderedContext.generation;
 const source=useRef({session:props.session,generation});
 const mounted=useRef(false),capture=useRef<CaptureRun|null>(null);
 const targetMatches=(run:CaptureRun,context:CapturedVoiceContext)=>run.session===current.current.session&&run.context.generation===context.generation&&(run.context.key===null||run.context.key===context.key&&context.labels.filter(label=>label.key===run.context.key).length===1);
 // Latch even an A→B→A change. A later render cannot restore a capture's target authority.
 if(capture.current&&!capture.current.finished&&!targetMatches(capture.current,renderedContext))capture.current.targetChanged=true;
 const [targetChangeBlocked,setTargetChangeBlocked]=useState(false);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const gestureRef=useRef<ReturnType<typeof createPttGesture>|null>(null);
 const displayClock=useRef<{start:number;stop:number|null}|null>(null);
 const pressClock=useRef<number|null>(null);
 const settle=useRef<(run:CaptureRun,forceCanceled?:boolean)=>void>(()=>undefined);
 const schedule=(run:CaptureRun)=>{void Promise.resolve().then(()=>settle.current(run));};
 const [voice]=useState(()=>new HostDictation(()=>current.current.session.actionChannel(),createNativeMicrophone(),randomUUID));
 const [snapshot,setSnapshot]=useState(voice.getSnapshot());
 const waiting=()=>!!capture.current?.waiting&&!capture.current.finished;
 const publishSnapshot=(s:DictationSnapshot)=>{
  const visible:DictationSnapshot=waiting()?{...s,phase:'starting',text:'',audio:'waiting',error:undefined}:s;
  gestureRef.current?.observe(visible.phase);if(mounted.current)setSnapshot(visible);
 };
 const startVoice=(run:CaptureRun)=>{
  run.started=true;
  void voice.start().catch(()=>{if(capture.current!==run||run.finished)return;run.canceled=true;void voice.cancel();schedule(run);});
 };
 const [gesture]=useState(()=>createPttGesture({
  now:()=>pressClock.current??performance.now(),
  // Reservation capacity affects only a new start. A reserved toggle still needs its second tap.
  enabled:()=>current.current.enabled&&!current.current.confirmationOpen&&(waiting()||capturing(voice.getSnapshot().phase)||current.current.captureAvailable!==false),
  phase:()=>waiting()?'starting':voice.getSnapshot().phase,
  start:()=>{
   if(capture.current&&!capture.current.finished){gestureRef.current?.observe('idle');return;}
   const start=current.current.getContext();
   const context={...start,labels:start.labels.map(label=>({...label}))};
   if(current.current.captureAvailable===false||current.current.onCaptureStart?.()===false){gestureRef.current?.observe('idle');return;}
   displayClock.current={start:pressClock.current??performance.now(),stop:null};
   const gate=current.current.beforeCapture;
   const run:CaptureRun={context,session:current.current.session,canceled:false,targetChanged:false,delivered:false,finished:false,waiting:!!gate,started:false,finishRequested:false,pressedAt:pressClock.current,onFinished:current.current.onCaptureFinished};capture.current=run;
   if(!gate){startVoice(run);return;}
   publishSnapshot(voice.getSnapshot());
   void(async()=>{
    let allowed=false;try{allowed=await gate()===true;}catch{/* An uncertain audio stop cannot start capture. */}
    run.waiting=false;
    if(run.finished||capture.current!==run)return;
    let sameSource=false;
    try{sameSource=current.current.session===run.session&&current.current.getContext().generation===run.context.generation;}catch{/* Missing source context fails closed. */}
    if(allowed&&mounted.current&&sameSource&&!run.canceled&&!run.finishRequested&&current.current.enabled&&!current.current.confirmationOpen){startVoice(run);return;}
    run.canceled=true;publishSnapshot(voice.getSnapshot());schedule(run);
   })();
  },
  finish:()=>{if(displayClock.current&&displayClock.current.stop===null)displayClock.current.stop=performance.now();const run=capture.current;if(run?.waiting){run.finishRequested=true;return;}void voice.finish();},
  cancel:()=>{if(displayClock.current&&displayClock.current.stop===null)displayClock.current.stop=performance.now();const run=capture.current;if(run){run.canceled=true;if(run.started)void voice.cancel();}}
 }));
 gestureRef.current=gesture;
 const finishRun=(run:CaptureRun)=>{
  if(displayClock.current&&displayClock.current.stop===null)displayClock.current.stop=performance.now();
  if(run.finished)return;
  run.finished=true;
  try{run.onFinished?.();}catch{logVoiceTargetStage('callback_failed');}
 };
 settle.current=(run,forceCanceled=false)=>{
  if(run.finished)return;
  if(run.waiting&&!forceCanceled)return;
  const latest=voice.getSnapshot();
  if(run.started&&capturing(latest.phase)&&!forceCanceled)return;
  try{
   if(run.started&&latest.text&&!run.delivered){
    const text=mergeVoiceDraft('',{...latest,phase:'draft'})??latest.text;
    const latestContext=current.current.getContext();
    const stale=run.context.generation!==latestContext.generation;
    const targetChanged=run.targetChanged||!targetMatches(run,latestContext);
    const result=routeCapturedVoice(text,run.context,forceCanceled||run.canceled||latest.phase==='error'||stale||targetChanged||!current.current.enabled||current.current.confirmationOpen,latestContext.labels);
    run.delivered=true;
    if(result.kind==='navigate'){
     logVoiceTargetStage('navigate');
     finishRun(run);current.current.onNavigate(result.intent);
    }else current.current.onDraft(targetChanged?{...result.draft,targetChanged:true}:result.draft,{completed:!forceCanceled&&!run.canceled&&latest.phase==='draft'&&!latest.error&&current.current.enabled&&!current.current.confirmationOpen&&!stale&&!targetChanged});
   }else logVoiceTargetStage('empty');
  }catch{logVoiceTargetStage('callback_failed');}
  finally{finishRun(run);}
 };
 const cancelCapture=()=>{
  const run=capture.current;if(run)run.canceled=true;
  gesture.cancel();if(run)schedule(run);
 };
 useEffect(()=>{
  mounted.current=true;
  const off=voice.subscribe(s=>{
   publishSnapshot(s);
   const run=capture.current;
   // Failure may publish a retained draft immediately before its error. Read the final state once.
   if(run&&!run.finished&&['idle','draft','error'].includes(s.phase))schedule(run);
  });
  const state=AppState.addEventListener('change',phase=>{
   if(phase==='background'){cancelCapture();return;}
   // Preserve the first iOS permission dialog; actual inactive capture is canceled by HostDictation.
   const run=capture.current,previous=run?.canceled;
   if(run&&phase!=='active')run.canceled=true;
   voice.handleAppState(phase);
   if(run&&capturing(voice.getSnapshot().phase))run.canceled=previous??false;
  });
  return()=>{
   mounted.current=false;const run=capture.current;if(run)run.canceled=true;
   if(noticeTimer.current!==undefined)clearTimeout(noticeTimer.current);
   gesture.cancel();
   // Cancel publishes its retained partial synchronously. Preserve it before unsubscribing/releasing.
   if(run)settle.current(run,true);
   off();state.remove();
  };
 },[voice,gesture]);
 useEffect(()=>{
  const changed=source.current.session!==props.session||source.current.generation!==generation;
  if(!props.enabled||props.confirmationOpen||changed)cancelCapture();
  source.current={session:props.session,generation};
  if(props.enabled&&!props.confirmationOpen&&!capturing(voice.getSnapshot().phase))void voice.refresh();
 },[props.enabled,props.confirmationOpen,props.session,generation,voice,gesture]);
 const inProgress=capturing(snapshot.phase);
 const available=props.enabled&&!props.confirmationOpen&&(inProgress||props.captureAvailable!==false)&&(waiting()||['ready_local','ready_cloud'].includes(snapshot.availability));
 const reasonKey=!props.enabled||props.confirmationOpen?'voice.unavailable':!inProgress&&props.captureAvailable===false?'voice.inboxFull':snapshot.error?voiceErrorKeys[snapshot.error]:voiceAvailabilityKeys[snapshot.availability];
 const display={elapsedMs:displayClock.current?Math.max(0,(displayClock.current.stop??performance.now())-displayClock.current.start):0,phase:snapshot.phase,text:snapshot.text,preparing:snapshot.preparing,level:snapshot.level,error:snapshot.error,targetChangeBlocked};
 const isCapturing=()=>!!capture.current&&!capture.current.finished;
 const notifyTargetChangeBlocked=()=>{
  if(!isCapturing()||!mounted.current)return;
  setTargetChangeBlocked(true);
  if(noticeTimer.current!==undefined)clearTimeout(noticeTimer.current);
  noticeTimer.current=setTimeout(()=>{noticeTimer.current=undefined;if(mounted.current)setTargetChangeBlocked(false);},1800);
 };
 return{display,isCapturing,notifyTargetChangeBlocked,pressIn:()=>{
  pressClock.current=performance.now();
  const run=capture.current;if(run?.waiting&&!run.finished&&run.pressedAt===null)run.finishRequested=true;
  try{gesture.pressIn();}finally{pressClock.current=null;}
 },pressOut:()=>{
  pressClock.current=performance.now();
  const run=capture.current;
  if(run?.waiting&&!run.finished&&run.pressedAt!==null){
   const elapsed=pressClock.current-run.pressedAt;run.pressedAt=null;
   if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=PTT_HOLD_MS)run.finishRequested=true;
  }
  try{gesture.pressOut();}finally{pressClock.current=null;}
 },cancelCapture,snapshot,available,reasonKey,reason:t(reasonKey)};
}
