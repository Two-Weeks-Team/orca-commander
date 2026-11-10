import { useMessages } from '../i18n/provider';
import { Pressable, Text, View } from 'react-native';
import type { ActionClientState } from '../adapters/action-client';
import { S } from './theme';

export function ActionJournalStatus({state,onReload}:{state:ActionClientState;onReload:()=>void}){
 const {t} = useMessages();
 if(state.journal==='ready')return null;
 return <View style={[S.notice,{gap:12}]}>
  <Text style={S.noticeText} accessibilityLiveRegion="polite">{state.journal==='loading'
   ? t('journal.loading')
   : t('journal.unavailable')}</Text>
  {state.journal==='unavailable'?<Pressable android_disableSound accessibilityRole="button" disabled={state.busy} style={S.secondary} onPress={onReload}><Text style={S.secondaryText}>{t('journal.reload')}</Text></Pressable>:null}
 </View>;
}
