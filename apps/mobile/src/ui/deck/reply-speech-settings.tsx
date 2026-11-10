import {SheetButton as Pressable,SheetText as Text,LCD,useSheetSkin} from './sheet-controls';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AppState,View} from 'react-native';
import {replySpeechPreferences} from '../../adapters/reply-speech-preferences';
import {createNativeSpeech,type SpeechResult} from '../../adapters/native-speech';
import {audioArbiter} from '../../adapters/audio-arbiter';
import {useMessages} from '../../i18n/provider';
import {en} from '../../i18n/en';
import {ko} from '../../i18n/ko';
import {S} from '../theme';

/** Explicit local samples are separate from automatic reply reading and send confirmation. */
export function ReplySpeechSettings(){
 const {t,locale}=useMessages();
 const preferences=useSyncExternalStore(replySpeechPreferences.subscribe,replySpeechPreferences.getSnapshot);
 const [speech]=useState(()=>createNativeSpeech());
 const playback=useSyncExternalStore(speech.subscribe,speech.getSnapshot);
 const audio=useSyncExternalStore(audioArbiter.subscribe,audioArbiter.getSnapshot);
 const [result,setResult]=useState<SpeechResult|null>(null);
 const mounted=useRef(false),run=useRef<symbol|null>(null);
 const language=locale.startsWith('ko')?'ko-KR':'en-US';
 const ready=preferences.phase==='ready'&&!preferences.error;
 const playing=playback.phase==='preparing'||playback.phase==='speaking'||playback.phase==='stopping';
 useEffect(()=>{void replySpeechPreferences.load();},[]);
 useEffect(()=>{
  mounted.current=true;
  const subscription=AppState.addEventListener('change',state=>{if(state!=='active')speech.cancel();});
  return()=>{mounted.current=false;run.current=null;subscription.remove();speech.cancel();};
 },[speech]);
 useEffect(()=>{if(!ready)speech.cancel();},[ready,speech]);
 useEffect(()=>()=>speech.cancel(),[language,speech]);
 const adjust=(direction:-1|1)=>{
  const latest=replySpeechPreferences.getSnapshot();
  if(latest.phase!=='ready'||latest.error)return;
  const rate=Math.min(2,Math.max(0.5,latest.rate+direction*0.25));
  void replySpeechPreferences.update({rate});
 };
 const preview=()=>{
  const latest=replySpeechPreferences.getSnapshot();
  if(!mounted.current||latest.phase!=='ready'||latest.error||AppState.currentState!=='active'||run.current||speech.getSnapshot().phase!=='idle'||audioArbiter.getSnapshot().kind!==null)return;
  const ticket=Symbol();run.current=ticket;setResult(null);
  // Samples always come from the built-in catalogs, never imported language packs or host data.
  const sample=language==='ko-KR'?ko['set.ttsSample']:en['set.ttsSample'];
  void speech.speak(sample,language,latest.rate).then(value=>{
   if(!mounted.current||run.current!==ticket)return;
   run.current=null;setResult(value);
  });
 };
 const switchDisabled=!ready&&!preferences.enabled;
 const previewDisabled=!ready||playing||playback.phase==='uncertain'||audio.kind!==null;
 const status=playback.phase==='uncertain'?'set.ttsPreviewUncertain':playing?'set.ttsPreviewPlaying':result==='finished'?'set.ttsPreviewFinished':result==='interrupted'?'set.ttsPreviewStopped':result==='unavailable'?'set.ttsPreviewUnavailable':result==='uncertain'?'set.ttsPreviewUncertain':null;
 return <View style={{gap:10}}>
  <Text accessibilityRole="header" style={S.heading}>{t('set.ttsTitle')}</Text>
  <LCD><Text style={S.noticeText}>{t('set.ttsHint')}</Text></LCD>
  <Pressable android_disableSound accessibilityRole="switch" accessibilityLabel={t('set.ttsTitle')} accessibilityState={{checked:preferences.enabled,disabled:switchDisabled}} disabled={switchDisabled} style={S.secondary} onPress={()=>{const latest=replySpeechPreferences.getSnapshot();void replySpeechPreferences.update({enabled:!latest.enabled});}}><Text style={S.secondaryText}>{t(preferences.enabled?'set.ttsOn':'set.ttsOff')}</Text></Pressable>
  {preferences.phase==='loading'?<Text style={S.noticeText}>{t('set.ttsLoading')}</Text>:null}
  {preferences.phase==='blocked'?<View style={{gap:10}}><Text accessibilityRole="alert" style={S.noticeText}>{t('set.ttsBlocked')}</Text><Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>{void replySpeechPreferences.reload();}}><Text style={S.secondaryText}>{t('set.ttsRetry')}</Text></Pressable></View>:null}
  <View accessible accessibilityRole="adjustable" accessibilityLabel={t('set.ttsRate')} accessibilityState={{disabled:!ready}} accessibilityValue={{min:0.5,max:2,now:preferences.rate,text:t('set.ttsRateValue',{rate:preferences.rate})}} accessibilityActions={[{name:'increment',label:t('set.ttsFaster')},{name:'decrement',label:t('set.ttsSlower')}]} onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='increment')adjust(1);else if(event.nativeEvent.actionName==='decrement')adjust(-1);}} style={{gap:10}}>
   <Text style={S.heading}>{t('set.ttsRate')}</Text><Text style={S.noticeText}>{t('set.ttsRateValue',{rate:preferences.rate})}</Text>
   <View style={{flexDirection:'row',gap:10}}><Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('set.ttsSlower')} accessibilityState={{disabled:!ready||preferences.rate<=0.5}} disabled={!ready||preferences.rate<=0.5} style={S.secondary} onPress={()=>adjust(-1)}><Text style={S.secondaryText}>{t('set.ttsSlower')}</Text></Pressable><Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('set.ttsFaster')} accessibilityState={{disabled:!ready||preferences.rate>=2}} disabled={!ready||preferences.rate>=2} style={S.secondary} onPress={()=>adjust(1)}><Text style={S.secondaryText}>{t('set.ttsFaster')}</Text></Pressable></View>
  </View>
  <Text style={S.noticeText}>{t('set.ttsNextChunk')}</Text>
  {playing?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>speech.cancel()}><Text style={S.secondaryText}>{t('set.ttsPreviewStop')}</Text></Pressable>:<Pressable android_disableSound accessibilityRole="button" accessibilityState={{disabled:previewDisabled}} disabled={previewDisabled} style={S.secondary} onPress={preview}><Text style={S.secondaryText}>{t('set.ttsPreview')}</Text></Pressable>}
  {status?<Text accessibilityLiveRegion="polite" style={S.noticeText}>{t(status)}</Text>:null}
 </View>;
}
