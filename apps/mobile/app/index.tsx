import {useReplySpeech} from '../src/ui/use-reply-speech';
import {useEffect,useState} from 'react';
import {AccessibilityInfo,AppState,Platform,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {resolveScreenMode} from '../src/ui/deck/screen-mode';
import {deckLayout} from '../src/ui/deck/deck-layout';
import {DeckInputProvider} from '../src/ui/deck-input-sheet';
import {DeckHome} from '../src/ui/deck-home';
import {liveSession,actionClient,structuredClient} from '../src/app-session';
import {NoticeScreen} from '../src/ui/notice-screen';
import {useLiveSession} from '../src/ui/use-live-session';
import {useMessages} from '../src/i18n/provider';

export default function Home(){
 const {t,locale,presentationRevision,preferences,preferencesReady,updatePreferences}=useMessages(),insets=useSafeAreaInsets(),window=useWindowDimensions();
 const [screenReader,setScreenReader]=useState<boolean|null>(null);
 const mode=resolveScreenMode({preference:preferences.screenMode,screenReader,fontScale:window.fontScale,needsList:deckLayout(window.width,window.height,insets,undefined,Platform.OS==='ios'&&Platform.isPad?insets:undefined).needsList}).mode;
 const snapshot=useLiveSession(liveSession);
 const replySpeech=useReplySpeech(snapshot,liveSession);
 useEffect(()=>{let active=true,changed=false;const sub=AccessibilityInfo.addEventListener('screenReaderChanged',value=>{changed=true;if(active)setScreenReader(value);});void AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(active&&!changed)setScreenReader(value);},()=>undefined);return()=>{active=false;sub.remove();};},[]);
 useEffect(()=>{
  const live=snapshot.phase==='live';if(!live){structuredClient.invalidate();return;}
  const refresh=()=>{if(AppState.currentState==='active')void structuredClient.refresh();};refresh();const timer=setInterval(refresh,15000);
  const listener=AppState.addEventListener('change',phase=>{if(phase!=='active')structuredClient.invalidate();else refresh();});
  return()=>{clearInterval(timer);listener.remove();};
 },[snapshot.phase,snapshot.connection?.generation]);
 const unavailable=snapshot.phase==='loading'||!preferencesReady?<NoticeScreen title={t('common.loading')}/>:snapshot.phase==='unpaired'&&snapshot.error==='storage_unavailable'?<NoticeScreen title={t('storage.unreadableTitle')} detail={t('storage.unlockToRead')} actionLabel={t('common.retry')} onAction={()=>{void liveSession.start();}}/>:null;
 return <DeckInputProvider captureVoiceReply={replySpeech.capture} snapshot={snapshot} session={liveSession} client={actionClient} presentationKey={JSON.stringify([mode,locale,presentationRevision,preferences.language,preferences.screenMode,screenReader,window.fontScale])}>
  <View style={{flex:1,backgroundColor:'#0A0D12'}}>
   {unavailable}
   <View style={{flex:1,display:unavailable?'none':'flex'}} accessibilityElementsHidden={!!unavailable} importantForAccessibility={unavailable?'no-hide-descendants':'auto'}>
    <DeckHome replySpeech={replySpeech} active={!unavailable} mode={mode} screenReader={screenReader} snapshot={snapshot} session={liveSession} client={actionClient} structured={structuredClient} onSwitchList={()=>updatePreferences({screenMode:'list'})} onSwitchDeck={()=>updatePreferences({screenMode:'deck'})}/>
   </View>
  </View>
 </DeckInputProvider>;
}
