import {createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {useLocales} from 'expo-localization';
import {prepareFeedback,setFeedbackEnabled} from '../adapters/deck-feedback';
import {expoSecureValueStore} from '../adapters/secure-store';
import {createTranslator,type MessageKey,type Translator} from './messages';
import {DEFAULT_PREFERENCES,encodePreferences,isLanguagePreference,missingLanguagePreferences,parsePreferences,resolvePreferenceLocale,type AppPreferences} from './preferences';
import {ensureLanguagePacksLoaded,languagePacks} from './installed-packs';
import {languagePackLocale,resolvePackMessage} from './pack';

interface Messages {locale:string;presentationRevision:string;t:Translator;preferences:Readonly<AppPreferences>;preferencesReady:boolean;preferencesWritable:boolean;preferencesError:boolean;preferencesRecoveryLanguage:string|null;recoverPreferencesLanguage(language:'en'|'ko'):void;reloadPreferences():void;updatePreferences(patch:Partial<Pick<AppPreferences,'language'|'screenMode'|'clicks'>>):void}
const Context=createContext<Messages>({locale:'en',presentationRevision:'en:0',t:createTranslator('en'),preferences:DEFAULT_PREFERENCES,preferencesReady:false,preferencesWritable:false,preferencesError:false,preferencesRecoveryLanguage:null,recoverPreferencesLanguage:()=>undefined,reloadPreferences:()=>undefined,updatePreferences:()=>undefined});
const STORE='deck.preferences.v1';
/** Preferences contain only UI enums. Protected journal and pairing stores are independent. */
export function MessagesProvider({children}:{children:ReactNode}){
 const locales=useLocales();
 const packs=useSyncExternalStore(languagePacks.subscribe,languagePacks.getSnapshot);
 useEffect(()=>{prepareFeedback();return()=>setFeedbackEnabled(false);},[]);
 const [preferences,setPreferences]=useState<Readonly<AppPreferences>>(DEFAULT_PREFERENCES),[preferencesReady,setReady]=useState(false),[preferencesWritable,setWritable]=useState(false),[preferencesError,setError]=useState(false),[loadVersion,setLoadVersion]=useState(0);
 const latest=useRef(preferences),ready=useRef(false),writable=useRef(false),readAuthorized=useRef(false),previousPackLocales=useRef(packs.locales),queue=useRef(Promise.resolve()),revision=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;let active=true;readAuthorized.current=false;writable.current=false;setWritable(false);setError(false);revision.current++;void(async()=>{
  try{
   await ensureLanguagePacksLoaded();
   if(loadVersion>0&&languagePacks.getSnapshot().phase==='blocked')await languagePacks.retry();
   await queue.current.catch(()=>undefined);
   const raw=await expoSecureValueStore.get(STORE);let parsed=parsePreferences(raw,languagePacks.getSnapshot().locales);
   if(raw===null&&(await expoSecureValueStore.get('deck.screen-mode.v1'))==='deck')parsed={ok:true,value:{...DEFAULT_PREFERENCES,screenMode:'deck'},source:'defaults'};
   if(!active)return;
   const missing=parsed.ok?null:missingLanguagePreferences(raw,languagePacks.getSnapshot().locales);
   const value=parsed.ok?parsed.value:missing;
   if(value){latest.current=value;setPreferences(value);readAuthorized.current=true;writable.current=parsed.ok;setWritable(parsed.ok);setError(!parsed.ok);}else setError(true);
  }catch{if(active)setError(true);}
  finally{if(active){ready.current=true;setReady(true);}}
 })();return()=>{active=false;mounted.current=false;};},[loadVersion]);
 const missing=readAuthorized.current?missingLanguagePreferences(JSON.stringify(preferences),packs.locales):null;
 const preferencesRecoveryLanguage=missing?.language??null,canWrite=preferencesWritable&&!missing;
 useEffect(()=>setFeedbackEnabled(preferencesReady&&canWrite&&preferences.clicks),[preferencesReady,canWrite,preferences.clicks]);
 const commitPreferences=(next:Readonly<AppPreferences>)=>{
  let encoded:string;try{encoded=encodePreferences(next,languagePacks.getSnapshot().locales);}catch{setError(true);return;}
  const ticket=++revision.current;
  writable.current=true;setWritable(true);setFeedbackEnabled(next.clicks);latest.current=next;setPreferences(next);setError(false);
  queue.current=queue.current.catch(()=>undefined).then(()=>expoSecureValueStore.set(STORE,encoded)).then(()=>{if(mounted.current&&revision.current===ticket)setError(false);},()=>{if(mounted.current&&revision.current===ticket)setError(true);});
 };
 const updatePreferences:Messages['updatePreferences']=patch=>{
  if(!ready.current||!writable.current||!readAuthorized.current)return;
  if(missingLanguagePreferences(JSON.stringify(latest.current),languagePacks.getSnapshot().locales)){setError(true);return;}
  commitPreferences({...latest.current,...patch});
 };
 const recoverPreferencesLanguage:Messages['recoverPreferencesLanguage']=language=>{
  if(!ready.current||!readAuthorized.current||language!=='en'&&language!=='ko')return;
  const candidate=missingLanguagePreferences(JSON.stringify(latest.current),languagePacks.getSnapshot().locales);
  if(candidate)commitPreferences({...candidate,language});
 };
 const reloadPreferences=()=>{readAuthorized.current=false;writable.current=false;setWritable(false);setLoadVersion(value=>value+1);};
 useEffect(()=>{
  const previous=previousPackLocales.current;previousPackLocales.current=packs.locales;
  if(ready.current&&readAuthorized.current&&!isLanguagePreference(latest.current.language,previous)&&isLanguagePreference(latest.current.language,packs.locales))reloadPreferences();
 },[packs.revision]);
 const locale=resolvePreferenceLocale(preferences.language,locales,packs.locales);
 const value=useMemo(()=>{
  const pack=packs.packs.find(pack=>languagePackLocale(pack)===locale);
  const t:Translator=pack?((key:MessageKey,parameters:Readonly<Record<string,string|number>>={})=>resolvePackMessage(pack,key,packs.reviews,parameters)) as Translator:createTranslator(locale);
  return{locale,presentationRevision:`${locale}:${pack?packs.revision:0}`,t,preferences,preferencesReady,preferencesWritable:canWrite,preferencesError:preferencesError||!!missing,preferencesRecoveryLanguage,recoverPreferencesLanguage,reloadPreferences,updatePreferences};
 },[locale,preferences,preferencesReady,canWrite,preferencesError,preferencesRecoveryLanguage,packs]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useMessages=():Messages=>useContext(Context);
