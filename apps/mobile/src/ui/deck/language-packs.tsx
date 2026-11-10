import {SheetButton as Pressable,SheetText as Text,LCD,useSheetSkin} from './sheet-controls';
import {useRef,useState,useSyncExternalStore} from 'react';
import {Alert,TextInput,View} from 'react-native';
import {importLanguagePackFile,exportLanguagePackSource,exportLanguagePackPrompt} from '../../adapters/language-pack-files';
import {en,type MessageKey} from '../../i18n/en';
import {isCriticalMessage,isCriticalReviewCurrent} from '../../i18n/critical-review';
import {languagePacks} from '../../i18n/installed-packs';
import {englishSourceVersion,languagePackLocale,type LanguagePack} from '../../i18n/pack';
import type {PlainMessageKey} from '../../i18n/messages';
import {useMessages} from '../../i18n/provider';
import {buildTranslationPrompt} from '../../i18n/translation-prompt';
import {S} from '../theme';

/** File selection and exact-pair review only. No host lookup, launch, clipboard read or automatic file return. */
export function LanguagePacks({onInstruct}:{onInstruct?:(prompt:string)=>void}){
 const physical=useSheetSkin();
 const {t}=useMessages(),state=useSyncExternalStore(languagePacks.subscribe,languagePacks.getSnapshot);
 const [expanded,setExpanded]=useState(false),[locale,setLocale]=useState('ja'),[selected,setSelected]=useState<string>(),[page,setPage]=useState(0),[message,setMessage]=useState<PlainMessageKey>(),[issues,setIssues]=useState<number>(),[working,setWorking]=useState(false);
 const busy=useRef(false),disabled=working||state.busy;
 const button=(label:string,onPress:()=>void,unavailable=disabled,visibleLabel=label)=><Pressable symbol={physical?(label===t('pack.import')?'+':label===t('pack.title')?'☷':label===t('pack.instructions')?'+':'⇧'):undefined} android_disableSound accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:unavailable}} disabled={unavailable} style={[S.secondary,{flex:0,minHeight:48,opacity:unavailable?0.45:1}]} onPress={onPress}><Text style={S.secondaryText}>{visibleLabel}</Text></Pressable>;
 const run=async(work:()=>Promise<void>)=>{if(busy.current||languagePacks.getSnapshot().busy)return;busy.current=true;setWorking(true);setMessage(undefined);try{await work();}catch{setMessage('pack.failed');}finally{busy.current=false;setWorking(false);}};
 const install=async(pack:LanguagePack,count:number)=>run(async()=>{
  const result=await languagePacks.importPack(JSON.stringify(pack));
  if(result.ok){setSelected(result.locale);setPage(0);setIssues(count);setMessage('pack.ready');}
  else setMessage(result.reason==='pack_limit'?'pack.limit':result.reason==='invalid_pack'?'pack.invalid':'pack.failed');
 });
 const importFile=()=>run(async()=>{
  const selected=await importLanguagePackFile();if(selected.status==='canceled')return;
  if(selected.status==='error'){setMessage(selected.reason==='too_large'?'pack.tooLarge':'pack.failed');return;}
  if(!selected.result.ok){setMessage(selected.result.reason==='too_large'?'pack.tooLarge':'pack.invalid');return;}
  const {pack,issues}=selected.result;
  if(state.locales.includes(languagePackLocale(pack))){
   Alert.alert(t('pack.replaceTitle'),t('pack.replaceHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('pack.replace'),onPress:()=>{void install(pack,issues.length);}}]);return;
  }
  const result=await languagePacks.importPack(JSON.stringify(pack));
  if(result.ok){setSelected(result.locale);setPage(0);setIssues(issues.length);setMessage('pack.ready');}else setMessage(result.reason==='pack_limit'?'pack.limit':'pack.failed');
 });
 const share=(kind:'source'|'prompt')=>run(async()=>{
  if(kind==='prompt'){try{buildTranslationPrompt(locale);}catch{setMessage('pack.invalidLocale');return;}}
  const result=await(kind==='source'?exportLanguagePackSource():exportLanguagePackPrompt(locale));
  setMessage(result.status==='share_sheet_closed'?'pack.shared':result.reason==='unavailable'?'pack.shareUnavailable':'pack.failed');
 });
 const pack=state.packs.find(pack=>languagePackLocale(pack)===selected),critical=pack?Object.keys(pack.strings).filter(key=>isCriticalMessage(key)) as MessageKey[]:[];
 const remove=(pack:LanguagePack)=>{
  const locale=languagePackLocale(pack);
  Alert.alert(t('pack.removeTitle',{name:pack.name,locale}),t('pack.removeHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('pack.remove'),style:'destructive',onPress:()=>{void run(async()=>{
   if(languagePacks.getSnapshot().packs.find(item=>languagePackLocale(item)===locale)!==pack){setMessage('pack.failed');return;}
   const result=await languagePacks.removePack(locale,pack);if(result.ok){setSelected(undefined);setPage(0);setIssues(undefined);setMessage('pack.removed');}else setMessage('pack.failed');
  });}}]);
 };
 const unreview=(pack:LanguagePack,key:MessageKey,source:string,translation:string)=>Alert.alert(t('pack.unreviewTitle'),t('pack.unreviewHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('pack.unreview'),onPress:()=>{void run(async()=>{
  const current=languagePacks.getSnapshot().packs.find(item=>languagePackLocale(item)===languagePackLocale(pack));
  if(current!==pack||en[key]!==source||current.strings[key]!==translation){setMessage('pack.failed');return;}
  const result=await languagePacks.unreview(languagePackLocale(pack),key,pack);setMessage(result.ok?'pack.reviewWithdrawn':'pack.failed');
 });}}]);
 return <View style={{gap:12}}>
  {physical?<Text accessibilityRole="header" style={S.heading}>{t('pack.count',{n:state.packs.length})}</Text>:null}
  {physical?<View style={{flexDirection:'row',gap:10}}><View style={{flex:1}}>{button(t('pack.import'),()=>{void importFile();},disabled||!state.writable,t('pack.importShort'))}</View><View style={{flex:1}}>{button(t('pack.title'),()=>setExpanded(value=>!value),false)}</View></View>:button(t('pack.title'),()=>setExpanded(value=>!value),false)}
  {expanded?<>
   {!physical?<Text accessibilityRole="header" style={S.heading}>{t('pack.title')}</Text>:null}<LCD><Text style={S.noticeText}>{t('pack.filesHint')}</Text><Text style={S.noticeText}>{t('pack.readLimit')}</Text></LCD>
   {state.phase==='blocked'?<><Text accessibilityRole="alert" style={S.noticeText}>{t('pack.failed')}</Text>{button(t('common.retry'),()=>{void languagePacks.retry();})}</>:null}
   {!physical?button(t('pack.import'),()=>{void importFile();},disabled||!state.writable):null}{button(t('pack.export'),()=>{void share('source');})}
   <TextInput accessibilityLabel={t('pack.targetLocale')} value={locale} onChangeText={setLocale} autoCapitalize="none" autoCorrect={false} maxLength={35} style={[S.desc,{borderWidth:1,padding:14,minHeight:48}]}/>
   {button(t('pack.exportPrompt'),()=>{void share('prompt');})}
   {onInstruct?button(t('pack.instructions'),()=>{try{onInstruct(buildTranslationPrompt(locale));}catch{setMessage('pack.invalidLocale');}}):null}
   {message?<Text selectable accessibilityRole="alert" style={S.noticeText}>{t(message)}</Text>:null}{issues!==undefined?<Text style={S.noticeText}>{t('pack.issues',{n:issues})}</Text>:null}
   {!state.packs.length?<Text style={S.desc}>{t('pack.none')}</Text>:state.packs.map(pack=>{const id=languagePackLocale(pack);return <View key={id}>{button(`${pack.name} · ${id}`,()=>{setSelected(id);setPage(0);})}</View>;})}
   {pack?<View style={{gap:14}}><Text accessibilityRole="header" style={S.heading}>{t('pack.review')} · {pack.name}</Text><Text style={S.noticeText}>{t('pack.reviewHint')}</Text>{pack.sourceVersion!==englishSourceVersion()?<Text style={S.noticeText}>{t('pack.outdated')}</Text>:null}
    {button(t('pack.remove'),()=>remove(pack),disabled||!state.writable)}
    {critical.slice(page*10,page*10+10).map(key=>{const translated=pack.strings[key]!,source=en[key],reviewed=state.reviews.some(review=>isCriticalReviewCurrent(pack,key,review));return <View key={key} style={{gap:8,borderWidth:1,padding:14}}><Text selectable style={S.footer}>{key}</Text><Text style={S.heading}>{t('pack.english')}</Text><Text selectable style={S.desc}>{source}</Text><Text style={S.heading}>{t('pack.translation')}</Text><Text selectable style={S.desc}>{translated}</Text><Pressable android_disableSound accessibilityRole="checkbox" accessibilityState={{checked:reviewed,disabled:reviewed||disabled||!state.writable}} disabled={reviewed||disabled||!state.writable} style={[S.secondary,{flex:0,minHeight:48}]} onPress={()=>{void run(async()=>{const result=await languagePacks.review(languagePackLocale(pack),key,source,translated);if(!result.ok)setMessage('pack.failed');});}}><Text style={S.secondaryText}>{t(reviewed?'pack.reviewed':'pack.reviewPair')}</Text></Pressable>{reviewed?button(t('pack.unreview'),()=>unreview(pack,key,source,translated),disabled||!state.writable):null}</View>;})}
    <Text style={S.noticeText}>{page+1} / {Math.max(1,Math.ceil(critical.length/10))}</Text>
    {page>0?button(t('pack.previousPage'),()=>setPage(value=>value-1)):null}{(page+1)*10<critical.length?button(t('pack.nextPage'),()=>setPage(value=>value+1)):null}
   </View>:null}
  </>:null}
 </View>;
}
