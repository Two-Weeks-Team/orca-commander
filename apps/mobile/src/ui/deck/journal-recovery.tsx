import {SheetButton as Pressable,SheetText as Text,LCD,useSheetSkin} from './sheet-controls';
import {useRef,useState,useSyncExternalStore} from 'react';
import {View} from 'react-native';
import type {DeckActionClient} from '../../adapters/action-client';
import type {StructuredActionClient} from '../../adapters/structured-action-client';
import {useMessages} from '../../i18n/provider';
import {ActionJournalStatus} from '../action-journal-status';
import {S} from '../theme';

/** Explicit storage reread only. Recovery never reconciles or resends a recorded action. */
export function JournalRecovery({client,structured}:{client:DeckActionClient;structured:StructuredActionClient}){
 const {t}=useMessages();
 const actions=useSyncExternalStore(fn=>client.subscribe(fn),()=>client.getSnapshot());
 const requests=useSyncExternalStore(fn=>structured.subscribe(fn),()=>structured.getSnapshot());
 const inFlight=useRef(false),[reloading,setReloading]=useState(false);
 const disabled=actions.busy||requests.busy||reloading;
 const reload=async(target:DeckActionClient|StructuredActionClient)=>{
  if(inFlight.current||client.getSnapshot().busy||structured.getSnapshot().busy||target.getSnapshot().journal!=='unavailable')return;
  inFlight.current=true;setReloading(true);
  try{await target.reloadJournal();}catch{/* The client snapshot remains the source of storage truth. */}
  finally{inFlight.current=false;setReloading(false);}
 };
 if(actions.journal==='ready'&&requests.journal==='ready')return null;
 return <View style={{gap:12}}>
  <ActionJournalStatus state={{...actions,busy:disabled}} onReload={()=>{void reload(client);}}/>
  {requests.journal!=='ready'?<View style={[S.notice,{gap:12}]}>
   <Text style={S.noticeText} accessibilityLiveRegion="polite">{t(requests.journal==='loading'?'native.journalLoading':'native.journalUnavailable')}</Text>
   {requests.journal==='unavailable'?<Pressable android_disableSound accessibilityRole="button" disabled={disabled} style={S.secondary} onPress={()=>{void reload(structured);}}><Text style={S.secondaryText}>{t('native.reloadHistory')}</Text></Pressable>:null}
  </View>:null}
 </View>;
}
