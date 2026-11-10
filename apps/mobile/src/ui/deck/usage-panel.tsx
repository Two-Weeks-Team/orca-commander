import {SheetText as Text,sheetNumber,useSheetSkin} from './sheet-controls';
import {View,useWindowDimensions} from 'react-native';
import {percent,untilReset,type ProviderUsage,type UsageSnapshot,type UsageWindow} from '../../adapters/usage';
import {useMessages} from '../../i18n/provider';
import type {PlainMessageKey} from '../../i18n/messages';
import {S} from '../theme';

const bar=(value:number|null)=>({height:6,borderRadius:3,width:`${value??0}%` as const,backgroundColor:value===null?'#3A4250':value>=80?'#FF7A8A':value>=50?'#FFB020':'#5FD38D'});

/** The desktop Usage panel's numbers for Codex and Claude: session (5h), weekly and Fable weekly, with reset times. */
export function UsagePanel({usage,now}:{usage?:UsageSnapshot;now:number}){
 const {t}=useMessages();const physical=useSheetSkin(),{fontScale}=useWindowDimensions(),largeType=fontScale>1.15;
 if(physical){
  const gauge=(label:PlainMessageKey,window:UsageWindow|null|undefined)=>{const value=percent(window),reset=untilReset(window,now);return <View key={label} style={{flex:1,minWidth:0,gap:2}} accessible accessibilityLabel={`${t(label)} ${value===null?'—':`${value}%`}${reset?`, ${t('usage.resets',{time:reset})}`:''}`}><View testID={'deck-usage-'+label} style={{flexDirection:largeType?'column':'row',alignItems:largeType?'flex-start':'baseline',justifyContent:'space-between',gap:3}}><Text numberOfLines={1} style={{fontSize:9,lineHeight:12,color:'#86CDB4'}}>{t(label)}</Text><Text numberOfLines={1} style={[sheetNumber,{fontSize:25,lineHeight:32,paddingTop:2,color:'#E6FFF6'}]}>{value===null?'—':`${value}%`}</Text></View><View accessible={false} style={{height:7,flexDirection:'row',gap:1}}>{Array.from({length:30},(_,i)=><View key={i} style={{flex:1,backgroundColor:value!==null&&i<value*.3?(value>=80?'#FF7A8A':'#A6F5D8'):'#315346'}}/>)}</View></View>;};
  const compact=(name:PlainMessageKey,data:ProviderUsage|null|undefined,claude:boolean)=><View key={name} testID={claude?'deck-usage-claude-row':'deck-usage-codex-row'} style={{flexDirection:largeType?'column':'row',alignItems:largeType?'stretch':'center',gap:8}}><Text numberOfLines={1} style={{minWidth:54*Math.min(1.5,fontScale),width:largeType?undefined:54*Math.min(1.5,fontScale),fontSize:11,fontWeight:'800',color:'#A6F5D8'}}>{t(name)}</Text>{!data||data.status==='unavailable'&&!data.session&&!data.weekly?<Text style={{flex:1}}>{t('usage.unavailable')}</Text>:<View style={{flexDirection:'row',flex:1,gap:8}}>{gauge('usage.session',data.session)}{gauge('usage.weekly',data.weekly)}{claude?gauge('usage.fable',data.fableWeekly):<View style={{flex:1}}/>}</View>}</View>;
  return <View testID="deck-usage-panel" style={{gap:6}}>{compact('usage.claude',usage?.claude,true)}{compact('usage.codex',usage?.codex,false)}</View>;
 }
 const row=(label:PlainMessageKey,window:UsageWindow|null|undefined)=>{
  const value=percent(window),reset=untilReset(window,now);
  return <View key={label} style={{gap:4,flex:1}} accessible accessibilityLabel={`${t(label)} ${value===null?'—':`${value}%`}${reset?`, ${t('usage.resets',{time:reset})}`:''}`}>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={S.noticeText}>{t(label)}</Text><Text style={[S.noticeText,physical?sheetNumber:{},{fontSize:physical?26:14,fontVariant:['tabular-nums']}]}>{value===null?'—':`${value}%`}</Text></View>
   <View accessible={false} style={{height:physical?10:6,flexDirection:'row',gap:1}}>{physical?Array.from({length:30},(_,i)=><View key={i} style={{flex:1,backgroundColor:value===null?'#315346':i<value*0.3?(value>=80?'#FF7A8A':'#A6F5D8'):'#315346'}}/>):<View style={bar(value)}/>}</View>
   <Text style={[S.footer,{fontVariant:['tabular-nums']}]}>{reset?t('usage.resets',{time:reset}):' '}</Text>
  </View>;
 };
 const provider=(name:PlainMessageKey,data:ProviderUsage|null|undefined,claude:boolean)=><View key={name} style={{gap:8}}>
  <Text style={S.itemTitle}>{t(name)}</Text>
  {!data||data.status==='unavailable'&&!data.session&&!data.weekly?<Text style={S.noticeText}>{t('usage.unavailable')}</Text>:
  <View style={{flexDirection:'row',gap:14}}>
   {row('usage.session',data.session)}{row('usage.weekly',data.weekly)}{claude?row('usage.fable',data.fableWeekly):null}
  </View>}
 </View>;
 return <View style={[physical?{}:S.detail,{gap:14}]} testID="deck-usage-panel">
  <Text accessibilityRole="header" style={S.heading}>{t('usage.title')}</Text>
  {provider('usage.codex',usage?.codex,false)}
  {provider('usage.claude',usage?.claude,true)}
 </View>;
}
