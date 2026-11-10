import {createConfirmationContext,type ConfirmationContextTicket} from './confirmation-context';
import {createTranslator,type Translator,type PlainMessageKey} from '../i18n/messages';
import {useMessages} from '../i18n/provider';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AppState,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import type {LiveSession} from '../adapters/live-session';
import type {StructuredActionClient,NativeReplyEntry,NativeReplyConfirmation,StructuredResult} from '../adapters/structured-action-client';
import {formatNativeAsyncReply,type NativeAsyncAnswer} from '../adapters/native-async-reply';
import {HostVoiceDraftField} from './host-voice-draft-field';
import {NativeConfirmationDialog} from './native-confirmation';
import {S,C} from './theme';

export const nativeReplyProvenance=(e:Pick<NativeReplyEntry,'hostId'|'hostVersion'|'target'>,t:Translator=createTranslator('en'))=>t('native.provenance',{host:e.hostId,version:e.hostVersion,worktree:e.target.worktreeId,tab:e.target.tabId,session:e.target.sessionId,provider:e.target.agent});
const resultKeys={accepted:'native.replyAccepted',refused:'native.result.refused',changed:'native.result.changed',unknown:'native.result.unknown',storage_unavailable:'native.result.storage',already_submitted:'native.result.submitted',busy:'native.result.busy'} as const satisfies Record<StructuredResult['status'],PlainMessageKey>;
export function NativeReplyEditor({entry,client,session,live,generation,otherBusy,initialAnswers,onDraftChange,onClose,onResult,active=true,presentationKey}:{presentationKey?:string;active?:boolean;entry:NativeReplyEntry;client:StructuredActionClient;session:LiveSession;live:boolean;generation?:number;otherBusy:boolean;initialAnswers:NativeAsyncAnswer[];onDraftChange:(answers:NativeAsyncAnswer[])=>void;onClose:()=>void;onResult:(result:StructuredResult)=>void}){
 const {t,locale,presentationRevision}=useMessages();
 const state=useSyncExternalStore(fn=>client.subscribe(fn),()=>client.getSnapshot());
 const [answers,setAnswers]=useState<NativeAsyncAnswer[]>(initialAnswers),answersRef=useRef(initialAnswers);
 const [index,setIndex]=useState(0),[capture,setCapture]=useState(false),[preparing,setPreparing]=useState(false),[notice,setNotice]=useState<PlainMessageKey>();
 const [confirmation,setConfirmation]=useState<NativeReplyConfirmation>(),[result,setResult]=useState<StructuredResult>();
 const held=useRef<NativeReplyConfirmation|undefined>(undefined),dialog=useRef<NativeReplyConfirmation|undefined>(undefined),pending=useRef(false),resultRef=useRef<StructuredResult|undefined>(undefined),reported=useRef(false),closed=useRef(false),mounted=useRef(true);
 const [resultClosing,setResultClosing]=useState(false);
 const ownerKey=JSON.stringify([locale,presentationRevision,presentationKey,entry]);
 const owner=useRef({key:ownerKey,client,sequence:0});
 if(owner.current.key!==ownerKey||owner.current.client!==client)owner.current={key:ownerKey,client,sequence:owner.current.sequence+1};
 const resultDismissal=useRef<{confirmation:NativeReplyConfirmation;result:StructuredResult;sequence:number;onClose:()=>void}|undefined>(undefined);
 const callbacks=useRef({onDraftChange,onClose,onResult});callbacks.current={onDraftChange,onClose,onResult};
 const context=useRef(createConfirmationContext('')).current;
 context.update(JSON.stringify([locale,presentationRevision,presentationKey,active,entry.hostId,entry.generation,entry.target,live,generation,otherBusy]));
 const armed=useRef<ConfirmationContextTicket|undefined>(undefined);
 const questions=entry.questions.flatMap(q=>q.questions),question=questions[index],answer=answers[index];
 const blocked=!active||otherBusy||state.busy||state.journal!=='ready'||!live||generation!==entry.generation;
 const value=answer&&'option' in answer?question?.options[answer.option]??'':answer&&'text' in answer?answer.text:'';
 const cancelConfirmation=()=>{
  if(closed.current||pending.current||resultRef.current)return;
  context.invalidate();if(held.current)client.cancel(held.current);held.current=undefined;dialog.current=undefined;setConfirmation(undefined);
 };
 const completeClose=(onClosed:()=>void)=>{
  closed.current=true;context.invalidate();if(held.current)client.cancel(held.current);held.current=undefined;dialog.current=undefined;resultRef.current=undefined;setConfirmation(undefined);setResult(undefined);onClosed();
 };
 // A parent Back/header request must never overlap its child's native dismissal.
 const close=()=>{if(closed.current||pending.current||resultDismissal.current)return;completeClose(callbacks.current.onClose);};
 const finishResultDismissal=()=>{
  const closing=resultDismissal.current;
  if(!closing||!mounted.current||dialog.current!==closing.confirmation||resultRef.current!==closing.result)return;
  resultDismissal.current=undefined;setResultClosing(false);
  if(owner.current.sequence===closing.sequence)completeClose(closing.onClose);
  else{dialog.current=undefined;resultRef.current=undefined;setConfirmation(undefined);setResult(undefined);}
 };
 const cancelDialog=()=>{
  if(closed.current||pending.current||resultDismissal.current)return;
  if(!resultRef.current){cancelConfirmation();return;}
  if(Platform.OS==='ios'&&confirmation){resultDismissal.current={confirmation,result:resultRef.current,sequence:owner.current.sequence,onClose:callbacks.current.onClose};setResultClosing(true);return;}
  close();
 };
 useEffect(()=>{callbacks.current.onDraftChange(answersRef.current);},[]);
 useEffect(()=>{if(held.current)cancelConfirmation();},[locale,presentationRevision,presentationKey,client]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;context.invalidate();if(held.current)client.cancel(held.current);};},[client]);
 useEffect(()=>{if((!live||generation!==entry.generation||!active)&&held.current)cancelConfirmation();},[client,live,generation,entry.generation,active]);
 useEffect(()=>{const sub=AppState.addEventListener('change',phase=>{if(phase!=='active'){context.invalidate();if(held.current)cancelConfirmation();}});return()=>sub.remove();},[client]);
 const edit=(next:NativeAsyncAnswer)=>{
  if(!mounted.current||closed.current)return;
  const all=[...answersRef.current];while(all.length<questions.length)all.push({text:''});all[index]=next;
  answersRef.current=all;callbacks.current.onDraftChange(all);setAnswers(all);
  context.invalidate();if(held.current)cancelConfirmation();
 };
 let hasAnswer=false;try{formatNativeAsyncReply(entry.questions,answers);hasAnswer=true;}catch{/* empty/oversized draft stays editable */}
 const prepare=async()=>{
  if(closed.current||pending.current||dialog.current||resultRef.current||blocked||capture)return;
  const ticket=context.capture();pending.current=true;setPreparing(true);setNotice(undefined);
  const prepared=await client.prepareReply(entry,answersRef.current);
  pending.current=false;
  if(!mounted.current||!context.isCurrent(ticket)){if(prepared.ok)client.cancel(prepared.confirmation);if(mounted.current)setPreparing(false);return;}
  if(prepared.ok){Keyboard.dismiss();reported.current=false;armed.current=ticket;held.current=prepared.confirmation;dialog.current=prepared.confirmation;setConfirmation(prepared.confirmation);}
  else setNotice(prepared.reason==='reconciliation_required'?'native.reconcile':prepared.reason==='invalid_answer'?'native.invalidAnswer':prepared.reason==='storage_unavailable'?'native.storageBlocked':'native.questionChanged');
  setPreparing(false);
 };
 const send=async(expected:NativeReplyConfirmation|undefined)=>{
  const original=held.current;if(original!==expected)return;
  if(closed.current||pending.current||resultRef.current||!original||blocked||capture)return;
  if(!context.isCurrent(armed.current)){cancelConfirmation();return;}
  // Consume before the first asynchronous operation. The dialog retains this exact original object.
  held.current=undefined;pending.current=true;setPreparing(true);
  let outcome:StructuredResult;
  try{outcome=await client.confirmReply(original);}finally{client.cancel(original);}
  pending.current=false;resultRef.current=outcome;
  if(mounted.current){setResult(outcome);setPreparing(false);if(!reported.current){reported.current=true;callbacks.current.onResult(outcome);}}
 };
 const editingBlocked=blocked||preparing||!!confirmation;
 return <Modal visible={active||preparing||!!result} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
  <SafeAreaProvider style={S.screen}><SafeAreaView style={S.screen}>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
     <Text style={S.heading}>{t('native.writeReply')}</Text>
     <Text style={S.itemTitle}>{entry.target.title}</Text><Text selectable style={S.noticeText}>{nativeReplyProvenance(entry,t)}</Text>
     <Text style={S.provider}>{t('native.questionIndex',{index:index+1,total:questions.length})}</Text><Text selectable style={S.heading}>{question?.title??t('common.unconfirmedValue')}</Text>
     {question?.options.map((option,i)=><Pressable android_disableSound key={i} accessibilityRole="button" accessibilityState={{selected:!!answer&&'option' in answer&&answer.option===i}} disabled={editingBlocked||capture} style={[S.secondary,{padding:14,borderColor:answer&&'option' in answer&&answer.option===i?C.yellow:C.border}]} onPress={()=>edit({option:i})}><Text style={S.secondaryText}>{option}</Text></Pressable>)}
     <HostVoiceDraftField key={index} session={session} value={value} onChange={text=>edit({text})} blocked={editingBlocked} onCaptureChange={setCapture} label={t('native.draftLabel',{title:question?.title??entry.target.title})}/>
     {questions.length>1?<View style={S.actions}><Pressable android_disableSound accessibilityRole="button" disabled={index===0||capture||editingBlocked} style={[S.secondary,{padding:12}]} onPress={()=>setIndex(i=>i-1)}><Text style={S.secondaryText}>{t('native.previousQuestion')}</Text></Pressable><Pressable android_disableSound accessibilityRole="button" disabled={index===questions.length-1||capture||editingBlocked} style={[S.secondary,{padding:12}]} onPress={()=>setIndex(i=>i+1)}><Text style={S.secondaryText}>{t('native.nextQuestion')}</Text></Pressable></View>:null}
     <Text style={S.footer}>{t('native.answerHint')}</Text>
     {notice?<Text style={S.noticeText} accessibilityLiveRegion="polite">{t(notice)}</Text>:null}
    </ScrollView>
    {!confirmation?<View style={{padding:20,gap:12}}>
     <Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('native.reviewReplyLabel')} disabled={editingBlocked||capture||!hasAnswer} style={[S.primary,{opacity:editingBlocked||capture||!hasAnswer?0.5:1}]} onPress={()=>{void prepare();}}><Text style={S.primaryText}>{preparing?t('input.checking'):t('input.review')}</Text></Pressable>
     <Pressable android_disableSound accessibilityRole="button" disabled={preparing} accessibilityState={{disabled:preparing}} style={[S.secondary,{flex:0,padding:14}]} onPress={close}><Text style={S.secondaryText}>{t('native.closeKeepDraft')}</Text></Pressable>
    </View>:null}
   </KeyboardAvoidingView>
   <NativeConfirmationDialog visible={!resultClosing} onDismiss={finishResultDismissal} confirmation={confirmation} presentationKey={presentationKey} disabled={blocked||capture||preparing||!!result} cancelDisabled={preparing||pending.current} resultLabel={result?t(resultKeys[result.status]):undefined} onConfirm={()=>{void send(confirmation);}} onCancel={cancelDialog}/>
  </SafeAreaView></SafeAreaProvider>
 </Modal>;
}
