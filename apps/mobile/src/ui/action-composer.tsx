import type { PlainMessageKey } from '../i18n/messages';
import {createTranslator} from '../i18n/messages';
import { createConfirmationContext, type ConfirmationContextTicket } from './confirmation-context';
import { voiceAvailabilityKeys, voiceErrorKeys } from './voice-messages';
import { useMessages } from '../i18n/provider';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { AgentSnapshot } from '../core/types';
import type { LiveSession } from '../adapters/live-session';
import type { DeckActionClient, PromptConfirmation, ActionResult } from '../adapters/action-client';
import { HostDictation } from '../adapters/host-dictation';
import { createNativeMicrophone } from '../adapters/native-microphone';
import { actionOutcomeKey } from './action-outcome';
import { mergeVoiceDraft } from './voice-draft';
import { PromptConfirmationDialog,type PromptTargetLabels } from './prompt-confirmation';
import {useHandsfreePrompt} from './use-handsfree-prompt';
import { C, S } from './theme';

export type CaptureVoiceReply=(confirmation:PromptConfirmation,agent:AgentSnapshot)=>Promise<(()=>boolean|void)|undefined>;

/** A target-bound editor shared by typed and dictated drafts. Permission/gate signals never enter this path. */
export function ActionComposer({agent,session,client,live,initialText='',initialOrigin='typed',onDraftChange,captureAcceptedDraft,presentationKey,autoPrepare=false,consumeAutoPrepare,captureVoiceReply,onReviewVisibilityChange,onReviewResultClose,onReviewResultClosing}:{agent:AgentSnapshot;session:LiveSession;client:DeckActionClient;live:boolean;initialText?:string;initialOrigin?:'typed'|'voice';onDraftChange?:(text:string,origin:'typed'|'voice')=>void;captureAcceptedDraft?:(text:string,origin:'typed'|'voice')=>(()=>void)|undefined;presentationKey?:string;autoPrepare?:boolean;consumeAutoPrepare?:()=>boolean;captureVoiceReply?:CaptureVoiceReply;onReviewVisibilityChange?:(open:boolean)=>void;onReviewResultClose?:()=>void;onReviewResultClosing?:()=>((()=>void)|undefined)}){
 const {t,locale,presentationRevision}=useMessages();
 const actions=useSyncExternalStore(listener=>client.subscribe(listener),()=>client.getSnapshot());
 const unresolved=actions.receipts.some(r=>!r.acknowledged&&(r.status==='partial'||r.status==='unknown')&&r.hostId===agent.target.hostId&&r.worktreeId===agent.target.worktreeId&&r.paneKey===agent.target.terminalId);
 const [text,setText]=useState(initialText);
 const [origin,setOrigin]=useState(initialOrigin);
 const rememberDraft=useRef(onDraftChange);rememberDraft.current=onDraftChange;
 const draft=useRef({text:initialText,origin:initialOrigin});
 const updateDraft=(next:string,nextOrigin=draft.current.origin)=>{draft.current={text:next,origin:nextOrigin};setText(next);setOrigin(nextOrigin);rememberDraft.current?.(next,nextOrigin);};
 useEffect(()=>{rememberDraft.current?.(draft.current.text,draft.current.origin);},[]);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<PlainMessageKey>();
 const [result,setResult]=useState<{status:ActionResult['status'];label:PlainMessageKey;readReply:boolean}>();
 const resultRef=useRef<typeof result>(undefined);resultRef.current=result;
 const [resultClosing,setResultClosing]=useState(false);
 const resultDismissal=useRef<{result:NonNullable<typeof result>;confirmation:PromptConfirmation;finishParent:(()=>void)|undefined;releaseParent:(()=>void)|undefined;allowParentClose:boolean}|undefined>(undefined);
 const sending=useRef(false);
 const targetPresentation=useRef<{confirmation:PromptConfirmation;target:PromptTargetLabels;origin:'typed'|'voice'}|undefined>(undefined);
 const [confirmation,setConfirmation]=useState<PromptConfirmation>();const confirmationRef=useRef<PromptConfirmation|undefined>(undefined);
 const [voice]=useState(()=>new HostDictation(()=>session.actionChannel(),createNativeMicrophone(),randomUUID));
 const [speech,setSpeech]=useState(voice.getSnapshot());
 const prefix=useRef('');const mounted=useRef(true);
 const blocked=unresolved||actions.busy&&actions.operation==='send'&&!sending.current||!live||agent.state==='permission'||agent.state==='question'||agent.state==='unknown'||!!agent.requestId||agent.eventType==='permission_request'||agent.eventType==='user_question'||agent.permissionEvidence==='structured_verified';
 const speaking=speech.phase==='recording'||speech.phase==='starting'||speech.phase==='loading'||speech.phase==='finishing';
 const context=useRef(createConfirmationContext('')).current;
 context.update(JSON.stringify([locale,presentationRevision,presentationKey,agent.id,agent.target,live,blocked]));
 const armed=useRef<ConfirmationContextTicket|undefined>(undefined);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;context.invalidate();};},[]);
 useEffect(()=>{if(resultDismissal.current){resultDismissal.current.allowParentClose=false;return;}if(confirmationRef.current)client.cancel(confirmationRef.current);confirmationRef.current=undefined;setConfirmation(undefined);setResult(undefined);},[locale,presentationRevision,presentationKey,client]);
 useEffect(()=>{
  const initial=voice.getSnapshot();let lastPhase=initial.phase,lastText=initial.text;
  return voice.subscribe(next=>{
   const changed=next.phase!==lastPhase||next.text!==lastText;
   lastPhase=next.phase;lastText=next.text;
   if(changed){
    const merged=mergeVoiceDraft(prefix.current,next);
    if(merged!==undefined){
     const nextOrigin=next.text?'voice':draft.current.origin;
     draft.current={text:merged,origin:nextOrigin};
     // Cache during publication: closing before a React commit must retain the latest partial.
     rememberDraft.current?.(merged,nextOrigin);
     if(mounted.current){setText(merged);setOrigin(nextOrigin);}
    }
   }
   if(mounted.current)setSpeech(next);
  });
 },[voice]);
 useEffect(()=>{void voice.refresh();return()=>{void voice.cancel();if(confirmationRef.current)client.cancel(confirmationRef.current);};},[voice,client]);
 useEffect(()=>{if(blocked){context.invalidate();void voice.cancel();if(confirmationRef.current)client.cancel(confirmationRef.current);confirmationRef.current=undefined;if(!sending.current&&!result)setConfirmation(undefined);}},[blocked,voice,client,result]);
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>{voice.handleAppState(s);if(s!=='active'){context.invalidate();if(resultDismissal.current)return;if(confirmationRef.current)client.cancel(confirmationRef.current);confirmationRef.current=undefined;setConfirmation(undefined);}});return()=>sub.remove();},[voice,client]);
 const finishResultDismissal=()=>{const closing=resultDismissal.current;if(!closing||!mounted.current||resultRef.current!==closing.result||confirmation!==closing.confirmation)return;resultDismissal.current=undefined;resultRef.current=undefined;setResultClosing(false);setConfirmation(undefined);setResult(undefined);closing.releaseParent?.();if(closing.allowParentClose)closing.finishParent?.();};
 const cancel=()=>{if(result&&!busy){if(!mounted.current||resultRef.current!==result||resultDismissal.current||!confirmation)return;if(Platform.OS==='ios'){resultDismissal.current={result,confirmation,finishParent:onReviewResultClose,releaseParent:onReviewResultClosing?.(),allowParentClose:true};setResultClosing(true);return;}resultRef.current=undefined;setConfirmation(undefined);setResult(undefined);onReviewResultClose?.();return;}if(!confirmation||confirmationRef.current!==confirmation||busy)return;context.invalidate();client.cancel(confirmation);confirmationRef.current=undefined;setConfirmation(undefined);};
 const prepare=async()=>{if(busy||blocked||speaking)return;setBusy(true);setNotice(undefined);const ticket=context.capture();const result=await client.prepare(agent,text);if(!mounted.current||!context.isCurrent(ticket)){if(result.ok)client.cancel(result.confirmation);if(mounted.current)setBusy(false);return;}if(result.ok){Keyboard.dismiss();armed.current=ticket;const host=session.getSnapshot().host;targetPresentation.current={confirmation:result.confirmation,origin:draft.current.origin,target:Object.freeze({provider:agent.provider.toUpperCase(),project:agent.place?.repo??'—',worktree:agent.place?.worktreeName??'—',host:host?.hostId===result.confirmation.hostId?host.endpointHost:'—'})};confirmationRef.current=result.confirmation;setResult(undefined);setConfirmation(result.confirmation);}else setNotice(result.reason==='invalid_text'?'input.invalid':result.reason==='storage_unavailable'?'input.storageBlocked':result.reason==='reconciliation_required'?'input.reconcile':result.reason==='target_not_on_desktop'?'input.targetNotOnDesktop':'input.targetUnconfirmed');setBusy(false);};
 // A finished dictation asks "send?" at once: the same prepare as the review button, run once when it can run.
 const autoPrepared=useRef(false);
 const [automaticReview,setAutomaticReview]=useState(autoPrepare);
 const handsfreeRequested=useRef(false);
 useEffect(()=>{
  if(!autoPrepare||autoPrepared.current||busy||blocked||speaking||!!confirmation||actions.busy||actions.journal!=='ready'||!text.trim())return;
  if(consumeAutoPrepare&&!consumeAutoPrepare())return;
  handsfreeRequested.current=origin==='voice';
  autoPrepared.current=true;setAutomaticReview(true);void prepare().finally(()=>{if(mounted.current)setAutomaticReview(false);});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[autoPrepare,busy,blocked,speaking,confirmation,actions.busy,actions.journal]);
 const send=async()=>{
  if(!confirmation||confirmationRef.current!==confirmation||busy||blocked)return;
  if(!context.isCurrent(armed.current)){cancel();return;}
  const owned=confirmation,sentDraft=draft.current,rememberAccepted=rememberDraft.current,intent=armed.current;
  // The owner returns an immutable compare-and-clear closure. Capture it before awaiting,
  // so a closed editor or a newer callback can never retarget an accepted result.
  const acceptDraft=captureAcceptedDraft?.(owned.text,sentDraft.origin);
  sending.current=true;setBusy(true);resultRef.current=undefined;setResult(undefined);confirmationRef.current=undefined;
  let notifyReply:(()=>boolean|void)|undefined;
  if(sentDraft.origin==='voice'&&captureVoiceReply){
   try{notifyReply=await captureVoiceReply(owned,agent);}catch{/* Optional response reading cannot block delivery. */}
   if(!mounted.current||AppState.currentState!=='active'||!context.isCurrent(intent)){
    client.cancel(owned);sending.current=false;if(mounted.current){setBusy(false);setConfirmation(undefined);}return;
   }
  }
  let result:ActionResult;
  try{result=await client.confirm(owned);}catch{result={status:'unknown',bodyAccepted:false,submitAttempted:null};}
  sending.current=false;
  let replyArmed=false;
  if(result.status==='accepted'){
   try{replyArmed=notifyReply?.()===true;}catch{/* Local playback cannot rewrite an accepted send. */}
   acceptDraft?.();
   if(draft.current===sentDraft&&sentDraft.text===owned.text){
    draft.current={text:'',origin:'typed'};
    if(!captureAcceptedDraft)rememberAccepted?.('','typed');
    if(mounted.current){setText('');setOrigin('typed');}
   }
  }
  if(!mounted.current)return;
  setResult({status:result.status,label:actionOutcomeKey(result),readReply:replyArmed});setNotice(actionOutcomeKey(result));setBusy(false);
 };
 const clip=(value:string,max:number)=>Array.from(value).slice(0,max).join('');
 const voiceT=createTranslator(locale==='ko'?'ko':'en');
 const handsfree=useHandsfreePrompt({confirmation:handsfreeRequested.current&&!busy&&!result?confirmation:undefined,session,locale,
  prompt:confirmation?voiceT('voice.confirmQuestion',{place:clip([agent.place?.repo,agent.place?.worktreeName].filter(Boolean).join(' › '),40),title:clip(confirmation.title,50),body:clip(confirmation.text,80)}):'',
  isCurrent:ticket=>{
   const channel=session.actionChannel();
   return mounted.current&&confirmationRef.current===ticket&&!busy&&!blocked&&context.isCurrent(armed.current)&&draft.current.text===ticket.text&&!!channel&&channel.hostId===ticket.hostId&&channel.generation===ticket.generation&&channel.runtimeId===ticket.runtimeId;
  },onConfirm:send,onCancel:cancel});
 const visibility=useRef(onReviewVisibilityChange);visibility.current=onReviewVisibilityChange;
 const reviewVisible=!!confirmation||automaticReview&&!blocked;
 useEffect(()=>{visibility.current?.(reviewVisible);return()=>visibility.current?.(false);},[reviewVisible]);
 return <View style={[S.detail,{gap:12}]}>
  <Text style={S.provider}>{agent.provider.toUpperCase()}</Text>
  <Text style={S.heading} accessibilityRole="header">{t('input.title',{title:agent.title})}</Text>
  {blocked?<View style={{gap:12}}><Text style={S.noticeText}>{unresolved?t('input.unresolved'):actions.busy?t('input.sending'):t('input.structuredOnly')}</Text>{text?<Text selectable style={S.desc}>{text}</Text>:null}</View>:<>
   <TextInput testID="deck-prompt-draft" accessibilityLabel={t('input.draftLabel',{title:agent.title})} multiline editable={!busy&&!speaking&&!confirmation} value={text} onChangeText={next=>updateDraft(next,draft.current.text?draft.current.origin:'typed')} placeholder={t('input.placeholder')} placeholderTextColor={C.muted} maxLength={32768} style={{minHeight:128,borderColor:C.border,borderWidth:1,borderRadius:10,padding:12,color:C.white,fontSize:17,textAlignVertical:'top'}} />
   <Text style={S.noticeText}>{t(voiceAvailabilityKeys[speech.availability])}{speech.modelLabel?` · ${speech.modelLabel}`:''}</Text>
   {speech.phase==='recording'?<Text style={S.noticeText} accessibilityLiveRegion="polite">{speech.audio==='heard'?t('voice.heard'):speech.audio==='quiet'?t('voice.quiet'):t('voice.waiting')}</Text>:null}
   {speech.phase==='draft'&&!speech.text?<Text style={S.noticeText}>{t('input.noSpeech')}</Text>:null}
   {speech.error?<Text style={S.noticeText} accessibilityLiveRegion="polite">{t(voiceErrorKeys[speech.error])}</Text>:null}
   <View style={[S.actions,{flexWrap:'wrap'}]}>
    <Pressable android_disableSound={true} accessibilityRole="button" accessibilityLabel={speech.phase==='recording'?t('input.finishVoice'):t('input.startVoice')} accessibilityState={{disabled:busy||!!confirmation||speaking&&speech.phase!=='recording'}} disabled={busy||!!confirmation||speaking&&speech.phase!=='recording'} style={[S.secondary,{padding:12,opacity:busy||confirmation?0.5:1}]} onPress={()=>{if(speech.phase==='recording')void voice.finish();else {prefix.current=text.trimEnd();void voice.start();}}}><Text style={S.secondaryText}>{speech.phase==='recording'?t('voice.finish'):speaking?t('voice.processing'):t('voice.input')}</Text></Pressable>
    {speaking?<Pressable android_disableSound={true} accessibilityRole="button" style={[S.secondary,{padding:12}]} onPress={()=>{void voice.cancel();}}><Text style={S.secondaryText}>{t('voice.cancel')}</Text></Pressable>:null}
   </View>
   {!confirmation?<Pressable testID="deck-prompt-review" android_disableSound={true} accessibilityRole="button" disabled={busy||speaking||actions.busy||actions.journal!=='ready'||!text.trim()} accessibilityState={{disabled:busy||speaking||actions.busy||actions.journal!=='ready'||!text.trim()}} style={[S.primary,{opacity:busy||speaking||actions.busy||actions.journal!=='ready'||!text.trim()?0.5:1}]} onPress={()=>{void prepare();}}><Text style={S.primaryText}>{busy?t('input.checking'):t('input.review')}</Text></Pressable>:null}
  </>}
  <PromptConfirmationDialog processingLabel={t(actions.progress==='checking'?'confirm.checking':'confirm.processing')} visible={!resultClosing} onDismiss={finishResultDismissal} target={targetPresentation.current&&targetPresentation.current.confirmation===confirmation?targetPresentation.current.target:undefined} voiceStage={handsfree.phase} listeningRemainingMs={handsfree.listeningRemainingMs} resultStatus={result?.status} resultLabel={result?t(result.label):undefined} readReply={result?.readReply} cancelDisabled={busy} voicePromptUnavailable={handsfree.playbackUnavailable} origin={targetPresentation.current&&targetPresentation.current.confirmation===confirmation?targetPresentation.current.origin:origin} confirmation={confirmation} disabled={busy||blocked} onConfirm={()=>{void send();}} onCancel={cancel} />
  {handsfree.phase!=='idle'?<Text accessibilityLiveRegion="polite" style={S.noticeText}>{t(handsfree.phase==='speaking'?'voice.confirmSpeaking':'voice.confirmListening')}</Text>:handsfree.uncertain?<Text accessibilityRole="alert" style={S.noticeText}>{t('voice.confirmUnknown')}</Text>:handsfree.retained?<Text style={S.noticeText}>{t('voice.confirmRetained')}</Text>:null}
  {notice?<Text style={S.noticeText} accessibilityLiveRegion="polite">{t(notice)}</Text>:null}
 </View>;
}
