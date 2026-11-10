import {Pressable,Text,TextInput,View} from 'react-native';
import {useMessages} from '../../i18n/provider';
import type {AgentSearchScope} from '../decision-card-model';
import {CommandKey,LCD,SheetSkinContext,SheetText} from './sheet-controls';
import {displayColor} from './state-mark';
import {S} from '../theme';

/** Local display filtering only; it never changes focus, key assignments, counts or action authority. */
export function ListSearch({query,onQuery,scope,onScope,deck=false,counts}:{counts?:Partial<Record<AgentSearchScope,number>>;deck?:boolean;query:string;onQuery(value:string):void;scope:AgentSearchScope;onScope(value:AgentSearchScope):void}){
 const {t}=useMessages();
 const labels={all:t('list.all'),attention:t('list.attention'),working:t('state.working'),done:t('state.done'),unknown:t('state.unknown')};
 if(deck)return <SheetSkinContext.Provider value={true}><View style={{gap:12}}><LCD style={{padding:0}}><TextInput testID="deck-list-search" accessibilityLabel={t('list.search')} placeholder={t('list.search')} placeholderTextColor="#A6C7B8" value={query} onChangeText={onQuery} autoCapitalize="none" autoCorrect={false} maxLength={1024} allowFontScaling maxFontSizeMultiplier={1.5} style={{minHeight:52,padding:14,color:'#E6FFF6',fontSize:15}}/></LCD><View accessibilityRole="radiogroup" style={{flexDirection:'row',gap:6}}>{(Object.keys(labels) as AgentSearchScope[]).map(value=><CommandKey key={value} label={labels[value]} accessibilityRole="radio" accessibilityState={{checked:scope===value}} selected={scope===value} led={value==='all'?'#A6F5D8':displayColor(value==='attention'?'permission':value)} onPress={()=>onScope(value)} style={{flex:1,paddingHorizontal:3,flexDirection:'row',flexWrap:'wrap',gap:3}}><SheetText style={{fontWeight:'800',color:value==='all'?'#E6FFF6':displayColor(value==='attention'?'permission':value)}}>{({all:labels.all,attention:'▲',working:'●',done:'✓',unknown:'?'})[value]}</SheetText>{counts?.[value]!==undefined?<SheetText style={{fontFamily:'BarlowCondensed-Bold',fontSize:28,fontWeight:'normal',color:value==='all'?'#E6FFF6':displayColor(value==='attention'?'permission':value)}}>{counts[value]}</SheetText>:null}</CommandKey>)}</View></View></SheetSkinContext.Provider>;
 return <View style={{gap:10}}>
  <TextInput testID="deck-list-search" accessibilityLabel={t('list.search')} placeholder={t('list.search')} placeholderTextColor="#B6C3D3" value={query} onChangeText={onQuery} autoCapitalize="none" autoCorrect={false} maxLength={1024} style={[S.desc,{minHeight:48,borderWidth:1,borderColor:'#718399',padding:12,borderRadius:10}]}/>
  <View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(Object.keys(labels) as AgentSearchScope[]).map(value=><Pressable android_disableSound key={value} accessibilityRole="radio" accessibilityState={{checked:scope===value}} style={[S.secondary,{flex:0,minHeight:48,padding:12,borderWidth:scope===value?2:1}]} onPress={()=>onScope(value)}><Text style={S.secondaryText}>{labels[value]}</Text></Pressable>)}</View>
 </View>;
}
