import {useEffect,useState,useSyncExternalStore} from 'react';
import {feedbackStatus} from '../../adapters/deck-feedback';
import {Pressable,View,useWindowDimensions} from 'react-native';
import {useMessages} from '../../i18n/provider';
import type {AppPreferences} from '../../i18n/preferences';
import {CommandKey,LCD,MetalToggle,SheetText as Text,useSheetSkin} from './sheet-controls';
import {S} from '../theme';
import {LanguagePacks} from './language-packs';
import {ReplySpeechSettings} from './reply-speech-settings';
import {languagePacks} from '../../i18n/installed-packs';
import {languagePackLocale} from '../../i18n/pack';
import type {InstalledLanguage} from '../../i18n/preferences';
/** Mode and language changes synchronously flow into existing confirmation-context fences. */
export function Customize({onInstruct,showTitle=true}:{showTitle?:boolean;onInstruct?:(prompt:string)=>void}){
 const physical=useSheetSkin(),{fontScale,width}=useWindowDimensions();
 const packs=useSyncExternalStore(languagePacks.subscribe,languagePacks.getSnapshot);
 const [sound,setSound]=useState<ReturnType<typeof feedbackStatus>>();
 useEffect(()=>{setSound(feedbackStatus());const timer=setInterval(()=>setSound(feedbackStatus()),1000);return()=>clearInterval(timer);},[]);
 const {t,preferences,preferencesReady,preferencesWritable,preferencesError,preferencesRecoveryLanguage,recoverPreferencesLanguage,reloadPreferences,updatePreferences}=useMessages();
 const choice=<K extends 'language'|'screenMode'>(field:K,value:AppPreferences[K],label:string,visibleLabel=label)=>{
  const recovery=field==='language'&&!!preferencesRecoveryLanguage&&(value==='en'||value==='ko'),disabled=!preferencesReady||!preferencesWritable&&!recovery;
  const onPress=()=>{if(recovery)recoverPreferencesLanguage(value as 'en'|'ko');else updatePreferences({[field]:value});};
  return physical?<CommandKey key={value} symbol={field==='language'?value==='auto'?'A':value==='en'?'EN':value==='ko'?t('set.koreanSymbol'):undefined:value==='auto'?'A':value==='deck'?'▦':'☷'} label={label} accessibilityRole="radio" accessibilityState={{selected:preferences[field]===value,checked:preferences[field]===value,disabled}} selected={preferences[field]===value} led={preferences[field]===value?'#A6F5D8':undefined} disabled={disabled} onPress={onPress} style={fontScale>1.15&&width<700?{width:'48%',minWidth:88*Math.min(1.5,fontScale),flexGrow:0}:{flex:1,minWidth:88*Math.min(1.5,fontScale)}}><Text numberOfLines={field==='screenMode'||['auto','en','ko'].includes(value)?1:undefined} style={{fontWeight:'800',fontSize:18,textAlign:'center'}}>{visibleLabel}</Text></CommandKey>:<Pressable android_disableSound key={value} accessibilityRole="radio" accessibilityState={{selected:preferences[field]===value,checked:preferences[field]===value,disabled}} disabled={disabled} style={[S.secondary,{flex:0,padding:14,borderWidth:preferences[field]===value?2:1}]} onPress={onPress}><Text style={S.secondaryText}>{label}</Text></Pressable>;
 };
 if(physical)return <View style={{gap:18}}>{showTitle?<Text accessibilityRole="header" style={{fontSize:24,fontWeight:'800'}}>{t('set.title')}</Text>:null}
 {preferencesError?<LCD><Text accessibilityRole="alert">{preferencesRecoveryLanguage?t('set.languageUnavailable',{locale:preferencesRecoveryLanguage}):t(preferencesWritable?'set.storageUnavailable':'set.readUnavailable')}</Text>{!preferencesWritable?<CommandKey onPress={reloadPreferences}><Text>{t('common.retry')}</Text></CommandKey>:null}</LCD>:null}
 <Text accessibilityRole="header" style={{fontWeight:'800'}}>{t('set.language')}</Text><View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{choice('language','auto',t('set.auto'),physical?t('set.autoShort'):t('set.auto'))}{choice('language','en',t('set.english'),physical?t('set.englishAutonym'):t('set.english'))}{choice('language','ko',t('set.korean'),physical?t('set.koreanAutonym'):t('set.korean'))}{packs.packs.map(pack=>choice('language',languagePackLocale(pack) as InstalledLanguage,pack.name))}</View>
 <LCD testID="deck-settings-auto-hint"><Text>{t('set.autoConservative')}</Text></LCD>
 <Text accessibilityRole="header" style={{fontWeight:'800'}}>{t('set.layout')}</Text><View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{choice('screenMode','auto',t('set.layoutAuto'))}{choice('screenMode','deck',t('mode.deck'))}{choice('screenMode','list',t('mode.list'))}</View>
 <View testID="deck-settings-sound-row" style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Text accessibilityRole="header" style={{fontWeight:'800',flex:1}}>{t('set.sound')}</Text><MetalToggle label={t('set.sound')} checked={preferences.clicks} disabled={!sound?.supported||!sound?.ready||!preferencesReady||!preferencesWritable} onPress={()=>updatePreferences({clicks:!preferences.clicks})}/></View>{!sound?.supported||!sound?.ready?<LCD><Text>{t('set.soundPending')}</Text></LCD>:null}
 <LanguagePacks onInstruct={onInstruct}/><ReplySpeechSettings/></View>;
 return <View style={{gap:14}}><Text accessibilityRole="header" style={S.heading}>{t('set.title')}</Text>
  {preferencesError?<View style={{gap:10}}><Text accessibilityRole="alert" style={S.noticeText}>{preferencesRecoveryLanguage?t('set.languageUnavailable',{locale:preferencesRecoveryLanguage}):t(preferencesWritable?'set.storageUnavailable':'set.readUnavailable')}</Text>{!preferencesWritable?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={reloadPreferences}><Text style={S.secondaryText}>{t('common.retry')}</Text></Pressable>:null}</View>:null}
  <Text style={S.heading}>{t('set.language')}</Text><View accessibilityRole="radiogroup" style={{gap:10}}>{choice('language','auto',t('set.auto'),physical?t('set.autoShort'):t('set.auto'))}{choice('language','en',t('set.english'),physical?t('set.englishAutonym'):t('set.english'))}{choice('language','ko',t('set.korean'),physical?t('set.koreanAutonym'):t('set.korean'))}{packs.packs.map(pack=>choice('language',languagePackLocale(pack) as InstalledLanguage,pack.name))}</View>
  <LanguagePacks onInstruct={onInstruct}/>
  <ReplySpeechSettings/>
  <Text style={S.heading}>{t('set.layout')}</Text><View accessibilityRole="radiogroup" style={{gap:10}}>{choice('screenMode','auto',t('set.layoutAuto'))}{choice('screenMode','deck',t('mode.deck'))}{choice('screenMode','list',t('mode.list'))}</View>
  <Text style={S.noticeText}>{t('set.autoConservative')}</Text>
  <Text style={S.heading}>{t('set.sound')}</Text><Pressable android_disableSound accessibilityRole="switch" accessibilityState={{checked:preferences.clicks,disabled:!sound?.supported||!sound?.ready||!preferencesReady||!preferencesWritable}} disabled={!sound?.supported||!sound?.ready||!preferencesReady||!preferencesWritable} style={[S.secondary,{flex:0,padding:14}]} onPress={()=>updatePreferences({clicks:!preferences.clicks})}><Text style={S.secondaryText}>{t(preferences.clicks?'set.soundOn':'set.soundOff')}</Text></Pressable>{!sound?.supported||!sound?.ready?<Text style={S.noticeText}>{t('set.soundPending')}</Text>:null}
 </View>;
}
