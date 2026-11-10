import type {PlainMessageKey} from '../i18n/messages';
import { useMessages } from '../i18n/provider';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ActionReceipt,ActionStatus } from '../adapters/action-client';
import { describeActionOutcome } from './action-outcome';
import {CommandKey,LCD,SheetText,sheetNumber,useSheetSkin} from './deck/sheet-controls';
import {Image} from 'expo-image';
import {deckSprites} from './deck/deck-assets';
import {formatAge} from '../core/agent-display';
import { S } from './theme';

/** Presentation only: acknowledgement never upgrades an uncertain/failed outcome to green. */
const resultLook:Record<ActionStatus,{label:PlainMessageKey;led:string}>={
 accepted:{label:'history.shortAccepted',led:'#00BC7D'},
 refused:{label:'history.shortRefused',led:'#FF6B6B'},
 target_changed:{label:'history.shortChanged',led:'#FFB020'},
 expired:{label:'history.shortExpired',led:'#FFB020'},
 not_connected:{label:'history.shortDisconnected',led:'#FF7A8A'},
 busy:{label:'history.shortBusy',led:'#FFB020'},
 unavailable:{label:'history.shortUnavailable',led:'#FFB020'},
 storage_unavailable:{label:'history.shortStorage',led:'#FF6B6B'},
 already_submitted:{label:'history.shortSubmitted',led:'#8C96A3'},
 cursor_required:{label:'history.shortCursor',led:'#FFB020'},
 partial:{label:'history.shortPartial',led:'#FF6B6B'},
 unknown:{label:'history.shortUnknown',led:'#FF6B6B'},
};

/** Kept outside the target editor so changing cards cannot hide an in-flight result. */
export function ActionHistory({receipts,busy,onAcknowledge,kind='all',titleFor,now=Date.now()}:{titleFor?:(receipt:ActionReceipt)=>string|undefined;now?:number;kind?:'all'|'unresolved'|'settled';receipts:readonly ActionReceipt[];busy:boolean;onAcknowledge:(id:string)=>Promise<boolean>}){
 const {t,locale} = useMessages();const physical=useSheetSkin();
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const unresolved=(r:ActionReceipt)=>!r.acknowledged&&(r.status==='unknown'||r.status==='partial');
 const visible=kind==='settled'?[]:receipts.filter(unresolved);
 const latest=receipts.filter(r=>!unresolved(r)).at(-1);if(kind!=='unresolved'&&latest)visible.push(latest);
 if(!visible.length)return null;
 const resultStrip=visible.length>=3;
 const resultKeys=physical?visible.map((receipt,index)=><View key={receipt.id} style={{width:resultStrip?180:'48%',minWidth:140}}><Pressable testID={'deck-result-'+receipt.id} android_disableSound accessibilityRole="button" accessibilityLabel={[titleFor?.(receipt)||t('history.previousTarget'),describeActionOutcome(receipt,t),formatAge(receipt.at,now)].filter(Boolean).join(', ')} accessibilityState={{expanded:!!expanded[receipt.id]}} onPress={()=>setExpanded(v=>({...v,[receipt.id]:!v[receipt.id]}))} style={{minHeight:146,padding:14,gap:4}}><Image cachePolicy="memory" pointerEvents="none" accessible={false} source={unresolved(receipt)?deckSprites.agent_red_up:deckSprites.agent_off_up} contentFit="fill" style={{position:'absolute',inset:0}}/><View pointerEvents="none" style={{position:'absolute',right:18,top:18,width:7,height:7,borderRadius:4,backgroundColor:resultLook[receipt.status].led}}/><SheetText style={[sheetNumber,{fontSize:40,lineHeight:46,color:unresolved(receipt)?'#3A0B14':'#DCE3EA'}]}>!{index+1}</SheetText><SheetText numberOfLines={2} style={{fontWeight:'800',fontSize:12,lineHeight:16,color:unresolved(receipt)?'#3A0B14':'#DCE3EA'}}>{titleFor?.(receipt)||t('history.previousTarget')}</SheetText><View style={{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',gap:6}}><SheetText accessibilityLiveRegion="polite" numberOfLines={2} style={{flex:1,fontSize:11,fontWeight:'800',color:unresolved(receipt)?'#3A0B14':'#DCE3EA'}}>{t(resultLook[receipt.status].label)}</SheetText><SheetText style={[sheetNumber,{fontSize:26,lineHeight:32,color:unresolved(receipt)?'#3A0B14':'#DCE3EA'}]}>{formatAge(receipt.at,now)??'—'}</SheetText></View></Pressable></View>):null;
 if(physical)return <View style={{gap:16}}>{resultStrip?<ScrollView testID="deck-result-strip" horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{flexGrow:0}} contentContainerStyle={{gap:12}}>{resultKeys}</ScrollView>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{resultKeys}</View>}{visible.filter(r=>expanded[r.id]).map(receipt=><View key={receipt.id} style={{gap:14}}><LCD><ScrollView nestedScrollEnabled style={{maxHeight:260}}><SheetText selectable style={{fontSize:14,lineHeight:23}}>{describeActionOutcome(receipt,t)}{'\n'}{new Date(receipt.at).toLocaleString()}{'\n'}{t('field.host')}: {receipt.hostId}{'\n'}{t('field.worktree')}: {receipt.worktreeId}{'\n'}{t('field.terminal')}: {receipt.paneKey}{'\n'}{t('field.hostVersion')}: {receipt.hostVersion}{'\n'}{t('field.handle')}: {receipt.handle}{'\n'}{t('field.incarnation')}: {receipt.incarnationId}{'\n'}{receipt.acknowledged?t('history.acknowledged'):unresolved(receipt)?t('history.acknowledgeHint'):''}</SheetText></ScrollView></LCD>{unresolved(receipt)?<CommandKey label={t('history.acknowledge')} disabled={busy} accessibilityState={{disabled:busy}} onPress={()=>{void onAcknowledge(receipt.id);}} style={{minHeight:112,paddingHorizontal:24}}><SheetText testID="deck-result-ack-label" style={{textAlign:'center',fontWeight:'800',fontSize:15,lineHeight:24}}>{locale.startsWith('ko')?t('history.acknowledge').slice(0,t('history.acknowledge').lastIndexOf(' ')+1)+'\n'+t('history.acknowledge').slice(t('history.acknowledge').lastIndexOf(' ')+1):t('history.acknowledge')}</SheetText></CommandKey>:null}</View>)}</View>;
 return <View style={{gap:12}}>
  <Text style={S.heading}>{t('history.results')}</Text>
  {visible.map(receipt=><View key={receipt.id} style={[S.notice,{gap:10}]}>
   <Text style={S.noticeText} accessibilityLiveRegion="polite">{describeActionOutcome(receipt,t)}</Text>
   {receipt.acknowledged?<Text style={S.noticeText}>{t('history.acknowledged')}</Text>:null}
   {!unresolved(receipt)?<Pressable android_disableSound accessibilityRole="button" accessibilityState={{expanded:!!expanded[receipt.id]}} style={[S.secondary,{padding:12}]} onPress={()=>setExpanded(v=>({...v,[receipt.id]:!v[receipt.id]}))}><Text style={S.secondaryText}>{expanded[receipt.id]?t('history.collapse'):t('history.expand')}</Text></Pressable>:null}
   {expanded[receipt.id]||unresolved(receipt)?<Text selectable style={S.footer}>{new Date(receipt.at).toLocaleString()}{'\n'}{t('field.host')}: {receipt.hostId}{'\n'}{t('field.worktree')}: {receipt.worktreeId}{'\n'}{t('field.terminal')}: {receipt.paneKey}{'\n'}{t('field.hostVersion')}: {receipt.hostVersion}{'\n'}{t('field.handle')}: {receipt.handle}{'\n'}{t('field.incarnation')}: {receipt.incarnationId}</Text>:null}
   {(receipt.status==='unknown'||receipt.status==='partial')&&!receipt.acknowledged?<>
    <Text style={S.noticeText}>{t('history.acknowledgeHint')}</Text>
    <Pressable android_disableSound accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} style={S.secondary} onPress={()=>{void onAcknowledge(receipt.id);}}><Text style={S.secondaryText}>{t('history.acknowledge')}</Text></Pressable>
   </>:null}
  </View>)}
 </View>;
}
