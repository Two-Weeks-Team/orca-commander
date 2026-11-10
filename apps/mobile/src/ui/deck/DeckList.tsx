import type {VoiceDisplay} from '../../adapters/host-dictation';
import {readableDisplayCache,type DeckDisplayCache} from '../../core/deck-display-cache';
import {deckClick} from '../../adapters/deck-feedback';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {DeckInventory,DeckView} from '../../core/deck-model';
import {useMessages} from '../../i18n/provider';
import {stateName} from '../theme';
import {filterAgents,type AgentSearchScope} from '../decision-card-model';
import {ListSearch} from './ListSearch';
import {Image} from 'expo-image';
import {agentDisplay} from '../../core/agent-display';
import {keyTitle} from './deck-layout';
import {StateMark,displayColor,lookFor,providerIcon,type Glyph} from './state-mark';

export type DeckAgentSnapshot=DeckInventory['agents'][number];
export interface DeckListProps {
 view:DeckView;
 voiceDisplay?:VoiceDisplay;
 cachedDisplay?:DeckDisplayCache;
 /** Slot numbers are presentation numbers (1 through 6), never zero-based indices. */
 rows:readonly{key:string;agent:DeckAgentSnapshot;slot:number|null}[];
 selectedKey:string|null;
 onSelect(key:string):void;onExplainKey?(slot:number):void;onContent():void;onInput():void;onStatus():void;onScan():void;onReconnect():void;
 voiceAvailable:boolean;voiceRecording:boolean;voiceReason:string;
 onVoicePressIn():void;onVoicePressOut():void;screenReader:boolean|null;children?:ReactNode;
}
/** The same focus, source rows and global voice as the rendered deck, with native flowing text. */
export function DeckList(props:DeckListProps){
 const {t,locale}=useMessages(),{view}=props;
 const voice=props.voiceDisplay,showVoice=!!voice&&['loading','starting','recording','finishing','error'].includes(voice.phase);
 const [query,setQuery]=useState(''),[scope,setScope]=useState<AgentSearchScope>('all');
 const matches=new Set(filterAgents(props.rows.map(row=>row.agent),query,scope)),rows=props.rows.filter(row=>matches.has(row.agent));
 const current=useRef(props);current.current=props;
 const held=useRef(false),skipActivation=useRef(false),previousReader=useRef(props.screenReader);
 const cached=readableDisplayCache(props.cachedDisplay??null,props.cachedDisplay?.hostId,Date.now());
 const voiceEnabled=!cached&&props.screenReader!==null&&props.voiceAvailable&&view.commands.voice;
 useEffect(()=>{if(cached&&held.current){held.current=false;skipActivation.current=true;current.current.onVoicePressOut();}},[cached]);
 const canSelect=view.display.link==='LIVE'&&view.commands.list.lit;
 const number=(value:number|null|undefined)=>value===null||value===undefined?'—':String(value);
 const valueLabel=(value:number|null|undefined)=>value===null||value===undefined?t('common.unconfirmedValue'):String(value);
 /** This host's total; + when another host was omitted (there may be more), never a dash for a known count. */
 const total=`${number(view.commands.list.count)}${view.display.partial&&view.commands.list.count!==null?'+':''}`;
 const position=view.display.position?`${view.display.position.n}/${total}`:null;
 const now=Date.now();
 const ageOf=(since:number|null)=>{const seconds=since===null?NaN:(now-since)/1000;return Number.isFinite(seconds)&&seconds>=0?(seconds<60?`${Math.floor(seconds)}s`:seconds<3600?`${Math.floor(seconds/60)}m`:seconds<172800?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`):null;};
 const voiceLabel=t(props.voiceRecording?'ptt.recording':'ptt.hold');
 const voiceReason=props.screenReader===null?t('common.loading'):props.voiceReason;
 // Balance a physical hold if the actual accessibility mode changes while this surface stays mounted.
 useEffect(()=>{
  if(previousReader.current!==props.screenReader&&held.current){held.current=false;skipActivation.current=true;current.current.onVoicePressOut();}
  previousReader.current=props.screenReader;
 },[props.screenReader]);
 useEffect(()=>()=>{if(held.current){held.current=false;current.current.onVoicePressOut();}},[]);
 const pressIn=()=>{if(!voiceEnabled||props.screenReader!==false)return;held.current=true;skipActivation.current=false;props.onVoicePressIn();};
 const pressOut=()=>{if(!held.current)return;held.current=false;props.onVoicePressOut();};
 const activateVoice=()=>{
  if(!voiceEnabled||props.screenReader!==true)return;
  if(skipActivation.current){skipActivation.current=false;return;}
  props.onVoicePressIn();props.onVoicePressOut();
 };
 // Orca's own marks and colours (AgentStateDot), the same as the deck keys.
 const counts:{id:string;label:string;mark:Glyph;color:string;value:number|null|undefined}[]=[
  {id:'attention',label:t('cmd.next'),mark:lookFor('question').glyph,color:displayColor('question'),value:view.display.counts?.attention},
  {id:'working',label:t('state.working'),mark:lookFor('working').glyph,color:displayColor('working'),value:view.display.counts?.working},
  {id:'monitoring',label:t('state.monitoring'),mark:lookFor('monitoring').glyph,color:displayColor('monitoring'),value:view.display.counts?.monitoring},
  {id:'done',label:t('state.done'),mark:lookFor('done').glyph,color:displayColor('done'),value:view.display.counts?.done},
  {id:'unknown',label:t('state.unknown'),mark:lookFor('unknown').glyph,color:displayColor('unknown'),value:view.display.counts?.unknown},
 ];
 const voicePanel=showVoice?<View testID="deck-list-voice-display" style={styles.status}>
    <Text accessibilityLiveRegion="polite" style={styles.rowTitle}>{voice?.targetChangeBlocked?t('voice.targetLocked'):voice?.error?props.voiceReason||t('voiceDisplay.error'):t(voice?.phase==='finishing'?'voiceDisplay.finishing':voice?.phase==='recording'?voice.preparing?'voiceDisplay.preparing':'voiceDisplay.recording':'voiceDisplay.starting')}</Text>
    <Text style={styles.text}>{voice?.text||t('voiceDisplay.waiting')}</Text>
    <View accessible={false} style={{height:6,backgroundColor:'#315346',overflow:'hidden'}}><View style={{height:'100%',width:`${Math.max(0,Math.min(1,Number.isFinite(voice?.level)?voice!.level!:0))*100}%`,backgroundColor:'#A6F5D8'}}/></View>
   </View>:null;
 if(cached)return <SafeAreaView style={styles.screen} accessibilityLanguage={locale} testID="deck-list-cached">
  <ScrollView style={styles.body} contentContainerStyle={styles.content}>
   <Text accessibilityRole="header" style={styles.heading}>{t('cmd.list')}</Text>
   {voicePanel}
   <Text accessibilityLiveRegion="polite" style={styles.text}>{t('cache.refreshing',{seconds:Math.floor(Math.max(0,now-cached.issuedAt)/1000)})}</Text>
   <Text style={styles.secondary}>{t('list.all')}: {cached.rows.length}{cached.partial?'+':''}</Text>
   <View style={{opacity:0.62,gap:16}}>{cached.rows.map(row=>{const shown=agentDisplay(row,now),age=ageOf(shown.since);return <View key={row.key} style={styles.row} accessible accessibilityLabel={[row.title,stateName(row.state,t),age].filter(Boolean).join('. ')}>
    <Text style={styles.rowTitle}>{row.title}</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image cachePolicy="memory" source={providerIcon(row.provider)} contentFit="contain" accessible={false} style={{width:18,height:18}}/><StateMark glyph={lookFor(shown.kind).glyph} color={displayColor(shown.kind)} size={18}/><Text style={styles.secondary}>{stateName(row.state,t)} {age}</Text></View><Text style={styles.secondary}>{[row.project,row.worktree].filter(Boolean).join(' › ')}</Text>
   </View>;})}</View>
  </ScrollView>
  <View style={styles.footerContent}><Pressable android_disableSound accessibilityRole="button" onPress={props.onStatus} style={styles.control}><Text style={styles.controlText}>{t('set.title')}</Text></Pressable><Pressable android_disableSound accessibilityRole="button" onPress={props.onReconnect} style={styles.control}><Text style={styles.controlText}>{t('link.reconnect')}</Text></Pressable></View>
 </SafeAreaView>;
 return <SafeAreaView style={styles.screen} accessibilityLanguage={locale} testID="deck-list">
  <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
   {voicePanel}
   <View style={styles.header}>
    <Text accessibilityRole="header" style={styles.heading}>{t('cmd.list')}</Text>
    <Text style={styles.text} accessibilityLiveRegion="polite">{view.display.link}</Text>
    <Text style={styles.text}>{t('list.all')}: {position??total}</Text>
    <Pressable android_disableSound={true} accessibilityRole="button" accessibilityLabel={`${t('status.unresolved')}: ${valueLabel(view.display.unresolved)}`} onPress={()=>{deckClick();props.onStatus();}} style={styles.status} testID="deck-list-unresolved">
     <Text style={styles.unresolved} accessibilityLiveRegion="polite">!{number(view.display.unresolved)}</Text><Text style={styles.text}>{t('status.unresolved')}</Text>
    </Pressable>
    {view.display.partial?<Text style={styles.secondary}>{t('deck.partial')}</Text>:null}
    <View style={styles.counts}>{counts.map(count=><View key={count.id} style={styles.count} accessible accessibilityLabel={`${count.label}: ${valueLabel(count.value)}`}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><StateMark glyph={count.mark} color={count.color} size={22} stroke={2.4}/><Text style={styles.countNumber}>{number(count.value)}</Text></View><Text style={styles.secondary}>{count.label}</Text></View>)}</View>
   </View>
   <Text accessibilityRole="header" style={styles.subheading}>{view.display.name??t('deck.noSelection')}</Text>
   <ListSearch query={query} onQuery={setQuery} scope={scope} onScope={setScope}/>
   <View accessibilityRole="radiogroup" style={styles.rows}>
    {rows.map(row=>{
     const state=canSelect?row.agent.state:'unknown',selected=props.selectedKey===row.key;
     const shown=canSelect?agentDisplay(row.agent,now):null,kind=shown?.kind??'unknown';
     const stateLabel=kind==='stale'?t('state.stale',{time:ageOf(shown?.since??null)??''}):kind==='monitoring'||kind==='stopping'||kind==='unconfirmed'?t(`state.${kind}`):stateName(state,t);
     const title=keyTitle(row.agent.title)??row.agent.title,age=shown&&kind!=='stale'?ageOf(shown.since):null;
     const slot=row.slot===null?t('list.noSlot'):`${t('key.slot')} ${row.slot}`;
     const provider=row.agent.provider==='claude'?t('usage.claude'):row.agent.provider==='codex'?t('usage.codex'):row.agent.provider;
     const slotIndex=row.slot!==null&&Number.isInteger(row.slot)&&row.slot>=1&&row.slot<=6?row.slot-1:null;
     return <View key={row.key} style={styles.rowGroup}><Pressable testID={`deck-item-${row.key}`} android_disableSound={true} accessibilityRole="radio" accessibilityState={{checked:selected,disabled:!canSelect}} accessibilityLabel={[title,provider,stateLabel,age,slot].filter(Boolean).join('. ')} disabled={!canSelect} onPress={()=>{deckClick();props.onSelect(row.key);}} style={[styles.row,selected?styles.selected:null]}>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image source={providerIcon(row.agent.provider)} contentFit="contain" cachePolicy="memory" accessible={false} tintColor={row.agent.provider==='claude'?undefined:'#C9D3DF'} style={{width:18,height:18}}/><StateMark glyph={lookFor(kind).glyph} color={displayColor(kind)} size={18} stroke={2.2}/><Text style={[styles.text,{color:displayColor(kind)}]}>{stateLabel}</Text>{age?<Text style={styles.secondary}>{age}</Text>:null}</View>
      <Text style={styles.secondary}>{slot}</Text>
     </Pressable>{slotIndex!==null&&props.onExplainKey?<Pressable android_disableSound={true} accessibilityRole="button" accessibilityLabel={`${t('key.slot')} ${row.slot} · ${t('status.guide')}`} onPress={()=>props.onExplainKey?.(slotIndex)} style={styles.control}><Text style={styles.controlText}>{t('key.slot')} {row.slot} · {t('status.guide')}</Text></Pressable>:null}</View>;
    })}
   </View>
   {!rows.length?<Text style={styles.text}>{t(props.rows.length?'list.noMatches':'deck.none')}</Text>:null}
   {view.commands.scanQr?<Pressable android_disableSound={true} accessibilityRole="button" onPress={()=>{deckClick();props.onScan();}} style={styles.control} testID="deck-list-scan"><Text style={styles.controlText}>{t('link.scan')}</Text></Pressable>:null}
   {view.commands.reconnect?<Pressable android_disableSound={true} accessibilityRole="button" onPress={()=>{deckClick();props.onReconnect();}} style={styles.control} testID="deck-list-reconnect"><Text style={styles.controlText}>{t('link.reconnect')}</Text></Pressable>:null}
   {props.children}
  </ScrollView>
  {/* A scrollable footer keeps every control reachable when system text makes it taller. */}
  <ScrollView style={styles.footer} contentContainerStyle={styles.footerContent} keyboardShouldPersistTaps="handled">
   <View style={styles.controls}>
    <Pressable android_disableSound={true} accessibilityRole="button" accessibilityState={{disabled:!view.commands.content}} disabled={!view.commands.content} onPress={()=>{deckClick();props.onContent();}} style={[styles.control,styles.flexControl,!view.commands.content?styles.disabled:null]} testID="deck-list-content"><Text style={styles.controlText}>{t('cmd.content')}</Text></Pressable>
    <Pressable android_disableSound={true} accessibilityRole="button" accessibilityState={{disabled:!view.commands.input}} disabled={!view.commands.input} onPress={()=>{deckClick();props.onInput();}} style={[styles.control,styles.flexControl,!view.commands.input?styles.disabled:null]} testID="deck-list-input"><Text style={styles.controlText}>{t('cmd.input')}</Text></Pressable>
    <Pressable android_disableSound={true} accessibilityRole="button" onPress={()=>{deckClick();props.onStatus();}} style={[styles.control,styles.flexControl]} testID="deck-list-status"><Text style={styles.controlText}>{t('set.title')}</Text></Pressable>
   </View>
   <Pressable android_disableSound={true} accessibilityRole="button" accessibilityLabel={`${voiceLabel}. ${voiceReason}`} accessibilityState={{disabled:!voiceEnabled}} disabled={!voiceEnabled} onPressIn={pressIn} onPressOut={pressOut} onPress={props.screenReader===true?activateVoice:undefined} style={[styles.voice,!voiceEnabled?styles.disabled:null]} testID="deck-list-voice"><Text style={styles.voiceText}>{voiceLabel}</Text></Pressable>
   <Text style={styles.secondary}>{voiceReason}</Text>
  </ScrollView>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#0A0D12'},body:{flex:1},content:{padding:18,paddingBottom:28,gap:16},header:{gap:12},heading:{fontSize:28,fontWeight:'800',color:'#F4F7FB'},subheading:{fontSize:20,fontWeight:'700',color:'#F4F7FB'},text:{fontSize:17,color:'#E1E7EF'},secondary:{fontSize:15,color:'#B6C3D3'},status:{minHeight:48,padding:12,borderWidth:1,borderColor:'#A84355',borderRadius:10,gap:6},unresolved:{fontSize:26,fontWeight:'800',color:'#FF9BA9'},counts:{flexDirection:'row',flexWrap:'wrap',gap:14},count:{minWidth:100,gap:4},countNumber:{fontSize:24,fontWeight:'700',color:'#F4F7FB',fontVariant:['tabular-nums']},rows:{gap:16},rowGroup:{gap:8},row:{minHeight:72,padding:16,borderWidth:1,borderColor:'#526176',borderRadius:12,gap:8},selected:{borderWidth:2,borderColor:'#A6F5D8',backgroundColor:'#16332C'},rowTitle:{fontSize:19,fontWeight:'700',color:'#FFFFFF'},footer:{flexGrow:0,maxHeight:'45%',borderTopWidth:1,borderTopColor:'#526176',backgroundColor:'#101822'},footerContent:{padding:16,gap:12},controls:{flexDirection:'row',flexWrap:'wrap',gap:10},control:{minHeight:48,paddingHorizontal:12,paddingVertical:14,borderWidth:1,borderColor:'#718399',borderRadius:10,alignItems:'center',justifyContent:'center'},flexControl:{flexGrow:1,flexBasis:90},controlText:{fontSize:17,fontWeight:'700',color:'#FFFFFF',textAlign:'center'},voice:{minHeight:56,padding:16,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#DCEFE7'},voiceText:{fontSize:18,fontWeight:'800',color:'#0B2820',textAlign:'center'},disabled:{opacity:0.45},
});
