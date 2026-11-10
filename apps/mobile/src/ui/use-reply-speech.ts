import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import {audioArbiter} from '../adapters/audio-arbiter';
import {createNativeSpeech} from '../adapters/native-speech';
import {createVoiceReplyService} from '../adapters/voice-reply-service';
import {replySpeechPreferences} from '../adapters/reply-speech-preferences';
import type {LiveSession,LiveSnapshot} from '../adapters/live-session';
import type {CaptureVoiceReply} from './action-composer';
import {createTranslator} from '../i18n/messages';
import {useMessages} from '../i18n/provider';
/** Process-local response reading survives editor close and display-mode changes; it never owns a send client. */
export function useReplySpeech(snapshot:LiveSnapshot,session:LiveSession){
 const {locale}=useMessages(),current=useRef({snapshot,session,locale});current.current={snapshot,session,locale};
 const mounted=useRef(false),scope=useRef('');
 const service=useMemo(()=>createVoiceReplyService({
  speech:createNativeSpeech(),audio:audioArbiter,preferences:replySpeechPreferences.getSnapshot,now:Date.now,
  foreground:()=>mounted.current&&AppState.currentState==='active',
  isCurrent:binding=>{
   const latest=current.current;if(latest.session!==session)return false;
   const channel=session.actionChannel();
   return !!channel&&channel.hostId===binding.hostId&&channel.generation===binding.generation&&channel.agents.filter(a=>a.target.worktreeId===binding.worktreeId&&a.target.terminalId===binding.paneKey).length===1;
  },
  read:binding=>session.readTerminalReply(binding),
  language:()=>current.current.locale.startsWith('ko')?'ko-KR':'en-US',
  intro:binding=>createTranslator(current.current.locale.startsWith('ko')?'ko':'en')('replySpeech.intro',{place:binding.place,title:binding.title}),
  remainder:()=>createTranslator(current.current.locale.startsWith('ko')?'ko':'en')('replySpeech.remainder'),
  waitingNotice:()=>createTranslator(current.current.locale.startsWith('ko')?'ko':'en')('replySpeech.waitingGate'),
 }),[session]);
 const speech=useSyncExternalStore(service.subscribe,service.getSnapshot);
 useEffect(()=>{
  mounted.current=true;void replySpeechPreferences.load();
  const preferences=replySpeechPreferences.subscribe(()=>{const value=replySpeechPreferences.getSnapshot();if(value.phase!=='ready'||value.error||!value.enabled)service.cancel();});
  const state=AppState.addEventListener('change',value=>{if(value!=='active')service.cancel();});
  const timer=setInterval(()=>{void service.tick();},2000);
  return()=>{mounted.current=false;clearInterval(timer);preferences();state.remove();service.cancel();};
 },[service]);
 useEffect(()=>{
  const next=JSON.stringify([snapshot.host?.hostId,snapshot.connection?.generation,locale]);
  if(scope.current!==next||snapshot.phase!=='live')service.cancel();scope.current=next;
 },[snapshot.phase,snapshot.host?.hostId,snapshot.connection?.generation,locale,service]);
 const capture:CaptureVoiceReply=(confirmation,agent)=>service.capture({id:confirmation.id,hostId:confirmation.hostId,generation:confirmation.generation,worktreeId:confirmation.worktreeId,paneKey:confirmation.paneKey,handle:confirmation.handle,incarnationId:confirmation.incarnationId,title:confirmation.title,place:[agent.place?.repo,agent.place?.worktreeName].filter(Boolean).join(' › ')});
 return{capture,phase:speech.phase,cancel:service.cancel,beforeCapture:service.beforeCapture};
}
