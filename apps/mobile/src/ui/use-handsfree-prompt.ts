import {useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {HostDictation} from '../adapters/host-dictation';
import {createNativeMicrophone} from '../adapters/native-microphone';
import {createNativeSpeech} from '../adapters/native-speech';
import {createScopedVoiceAnswer} from '../adapters/scoped-voice-answer';
import {createVoiceConfirmation} from '../core/voice-confirmation';
import type {LiveSession} from '../adapters/live-session';
import type {PromptVoiceStage} from './prompt-confirmation';
import type {PromptConfirmation} from '../adapters/action-client';

interface Props {
 confirmation?:PromptConfirmation;prompt:string;locale:string;session:LiveSession;
 isCurrent(ticket:PromptConfirmation):boolean;onConfirm():Promise<void>;onCancel():void;
}
/** One exact prepared prompt; this ASR stream never enters the editable dictation subscription. */
export function useHandsfreePrompt(props:Props){
 const current=useRef(props);current.current=props;
 const mounted=useRef(false);
 const [phase,setPhase]=useState<PromptVoiceStage>('idle');
 const [listeningStartedAt,setListeningStartedAt]=useState<number>();
 const [listeningRemainingMs,setListeningRemainingMs]=useState(3500);
 const [retained,setRetained]=useState(false);
 const [uncertain,setUncertain]=useState(false);
 const [unavailableTicket,setUnavailableTicket]=useState<PromptConfirmation>();
 const [resources]=useState(()=>{
  const speech=createNativeSpeech();
  const dictation=new HostDictation(()=>current.current.session.actionChannel(),createNativeMicrophone(),randomUUID);
  const answer=createScopedVoiceAnswer(dictation,{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)});
  const cancelAudio=()=>{answer.cancel();speech.cancel();};
  const flow=createVoiceConfirmation<PromptConfirmation>({
   now:Date.now,
   isCurrent:ticket=>mounted.current&&AppState.currentState==='active'&&current.current.isCurrent(ticket),
   speak:async()=>{if(mounted.current)setPhase('speaking');return speech.speak(current.current.prompt,current.current.locale==='ko'?'ko-KR':'en-US');},
   listen:()=>{if(mounted.current)setPhase('preparing');return answer.listen(next=>{if(!mounted.current)return;if(next==='recording'){setListeningStartedAt(performance.now());setListeningRemainingMs(3500);setPhase('listening');}else if(next==='preparing')setPhase('preparing');else if(next==='finishing')setPhase('transcribing');});},
   cancelAudio,
   confirm:()=>current.current.onConfirm(),
  });
  return{flow,cancelAudio};
 });
 useEffect(()=>{
  mounted.current=true;
  const sub=AppState.addEventListener('change',state=>{if(state!=='active'){resources.flow.cancel();resources.cancelAudio();}});
  return()=>{mounted.current=false;resources.flow.cancel();resources.cancelAudio();sub.remove();};
 },[resources]);
 useEffect(()=>{
  const ticket=props.confirmation;
  if(!ticket){setPhase('idle');return;}
  let canceled=false;setRetained(false);setUncertain(false);setUnavailableTicket(undefined);
  void resources.flow.start(ticket,props.locale==='ko'?'ko':'en').then(result=>{
   if(canceled||!mounted.current)return;
   setPhase('idle');
   if(result==='uncertain')setUncertain(true);
   if(result==='speech_unavailable'&&current.current.isCurrent(ticket))setUnavailableTicket(ticket);
   if(result==='canceled'&&current.current.isCurrent(ticket)){setRetained(true);current.current.onCancel();}
  });
  return()=>{canceled=true;resources.flow.cancel();resources.cancelAudio();};
 },[props.confirmation,props.locale,resources]);
 useEffect(()=>{
  if(phase!=='listening'||listeningStartedAt===undefined)return;
  const tick=()=>setListeningRemainingMs(Math.max(0,3500-Math.max(0,performance.now()-listeningStartedAt)));
  tick();const timer=setInterval(tick,50);return()=>clearInterval(timer);
 },[phase,listeningStartedAt]);
 return{phase,listeningRemainingMs,retained,uncertain,playbackUnavailable:!!props.confirmation&&unavailableTicket===props.confirmation};
}
