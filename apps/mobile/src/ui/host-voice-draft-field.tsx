import { voiceAvailabilityKeys, voiceErrorKeys } from './voice-messages';
import { useMessages } from '../i18n/provider';
import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,TextInput,View} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {HostDictation} from '../adapters/host-dictation';
import {createNativeMicrophone} from '../adapters/native-microphone';
import type {LiveSession} from '../adapters/live-session';
import {mergeVoiceDraft} from './voice-draft';
import {C,S} from './theme';

/** One editor owns one controller. The existing native microphone owner arbitrates the physical device.
 * Mount with a new key when the question changes: no previous transcript can populate another answer.
 */
export function HostVoiceDraftField({session,value,onChange,blocked,onCaptureChange,label}:{session:LiveSession;value:string;onChange:(text:string)=>void;blocked:boolean;onCaptureChange:(busy:boolean)=>void;label:string}){
 const {t}=useMessages();
 const [voice]=useState(()=>new HostDictation(()=>session.actionChannel(),createNativeMicrophone(),randomUUID));
 const [speech,setSpeech]=useState(voice.getSnapshot());
 const prefix=useRef(value.trimEnd()),latestValue=useRef(value),latestBlocked=useRef(blocked),change=useRef(onChange),capture=useRef(onCaptureChange),mounted=useRef(true);
 latestValue.current=value;latestBlocked.current=blocked;change.current=onChange;capture.current=onCaptureChange;
 const speaking=['loading','starting','recording','finishing'].includes(speech.phase);
 useEffect(()=>{
  mounted.current=true;
  const initial=voice.getSnapshot();let lastPhase=initial.phase,lastText=initial.text;
  const off=voice.subscribe(next=>{
   const changed=next.phase!==lastPhase||next.text!==lastText;
   lastPhase=next.phase;lastText=next.text;
   if(!mounted.current)return;
   if(changed){
    const merged=mergeVoiceDraft(prefix.current,next);
    if(merged!==undefined){
     latestValue.current=merged;
     // Publish to the owning question before React can unmount this field.
     change.current(merged);
    }
   }
   if(mounted.current)setSpeech(next);
  });
  void voice.refresh();
  const sub=AppState.addEventListener('change',phase=>voice.handleAppState(phase));
  return()=>{mounted.current=false;off();sub.remove();void voice.cancel();capture.current(false);};
 },[voice]);
 useEffect(()=>{capture.current(speaking);},[speaking]);
 useEffect(()=>{if(blocked)void voice.cancel();},[blocked,voice]);
 return <View style={{gap:12}}>
  <TextInput testID="deck-native-reply-draft" accessibilityLabel={label} multiline editable={!blocked&&!speaking} value={value} onChangeText={next=>{if(!mounted.current)return;latestValue.current=next;change.current(next);}} maxLength={32768} placeholder={t('voice.replyPlaceholder')} placeholderTextColor={C.muted} style={{minHeight:150,borderColor:C.border,borderWidth:1,borderRadius:10,padding:12,color:C.white,fontSize:17,textAlignVertical:'top'}} />
  <Text style={S.noticeText}>{t(voiceAvailabilityKeys[speech.availability])}{speech.modelLabel?` · ${speech.modelLabel}`:''}</Text>
  {speech.phase==='recording'?<Text style={S.noticeText} accessibilityLiveRegion="polite">{speech.audio==='heard'?t('voice.heard'):speech.audio==='quiet'?t('voice.quiet'):t('voice.waiting')}</Text>:null}
  {speech.phase==='draft'&&!speech.text?<Text style={S.noticeText}>{t('voice.noSpeech')}</Text>:null}
  {speech.error?<Text style={S.noticeText} accessibilityLiveRegion="polite">{t(voiceErrorKeys[speech.error])}</Text>:null}
  <View style={[S.actions,{flexWrap:'wrap'}]}>
   <Pressable android_disableSound accessibilityRole="button" accessibilityLabel={speech.phase==='recording'?t('voice.finishReply'):t('voice.startReply')} disabled={blocked||speaking&&speech.phase!=='recording'} style={[S.secondary,{padding:12}]} onPress={()=>{
    if(!mounted.current||latestBlocked.current)return;
    const phase=voice.getSnapshot().phase;
    if(phase==='recording')void voice.finish();
    else if(!['loading','starting','finishing'].includes(phase)){prefix.current=latestValue.current.trimEnd();capture.current(true);void voice.start();}
   }}><Text style={S.secondaryText}>{speech.phase==='recording'?t('voice.finish'):speaking?t('voice.processing'):t('voice.input')}</Text></Pressable>
   {speaking?<Pressable android_disableSound accessibilityRole="button" style={[S.secondary,{padding:12}]} onPress={()=>{if(mounted.current)void voice.cancel();}}><Text style={S.secondaryText}>{t('voice.cancel')}</Text></Pressable>:null}
  </View>
  <Text style={S.footer}>{t('voice.draftHint')}</Text>
 </View>;
}
