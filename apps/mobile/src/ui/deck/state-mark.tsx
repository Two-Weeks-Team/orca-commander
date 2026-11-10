import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { AgentState } from '../../core/types';
import type { AgentDisplayKind } from '../../core/agent-display';
import { deckIcons } from './deck-assets';
import {DeckText} from './deck-text';

/**
 * Key state marks are Orca's own (AgentStateDot.tsx, Lucide 0.577): working spins a ring with an open top, monitoring
 * is Activity, done is CircleCheck, questions and permission are MessageCircleQuestion, an unproven state is
 * CircleDashed, faults are a dot and a user's stop a muted dot. Lit keys ask for the owner or are working (breathing);
 * finished rows rest unlit so the eye goes to what needs it. A lost connection unlights every key with ⊘.
 */
export type Glyph={kind:'spinner'}|{kind:'icon';source:keyof typeof deckIcons}|{kind:'dot'}|{kind:'text';text:string};
export type Look={tone:string;ink:string;glyph:Glyph;mark?:string};
/** Orca's tokens: --agent-working (yellow-500), emerald-500 done, amber-500 unproven, muted foreground for a stop. */
export const ORCA_WORKING='#F0B100',ORCA_DONE='#00BC7D',ORCA_UNPROVEN='#C26A00',ORCA_STOPPED='#8C96A3';
/** State colours on the dark display, after Orca's tokens. */
export const LCD_STATE_COLOR:Record<AgentState,string>={permission:'#FF8A3D',question:'#FF8A3D',review:'#D3C3FF',working:'#F0B100',done:'#00BC7D',failed:'#FF6B6B',idle:'#8C96A3',unknown:'#F5B451'};
export const lookFor=(kind:AgentDisplayKind):Look=>kind==='monitoring'?monitoringLook:kind==='stopping'?stoppingLook:kind==='stale'||kind==='unconfirmed'?unprovenLook:palette[kind];
export const displayColor=(kind:AgentDisplayKind)=>kind==='monitoring'?'#F0B100':kind==='stopping'?'#8C96A3':kind==='stale'||kind==='unconfirmed'?'#F5B451':LCD_STATE_COLOR[kind];
const icon_=(source:keyof typeof deckIcons):Glyph=>({kind:'icon',source});
/** A finished turn held open only by a background monitor: unlit, Orca's Activity mark, no breathing. */
export const monitoringLook:Look={tone:'off',ink:'#DCE3EA',glyph:icon_('activity'),mark:ORCA_WORKING};
/** Stop pressed, turn ending: still lit, no breathing, a muted dot. */
export const stoppingLook:Look={tone:'blue',ink:'#08224D',glyph:{kind:'dot'}};
/** No proof of the state: silent past 30 minutes with a live terminal, or an unconfirmed end (Orca's CircleDashed). */
export const unprovenLook:Look={tone:'off',ink:'#DCE3EA',glyph:{kind:'icon',source:'unproven'},mark:'#F5B451'};
export const palette:Record<AgentState,Look>={
 permission:{tone:'amber',ink:'#2B1800',glyph:icon_('question')},question:{tone:'amber',ink:'#2B1800',glyph:icon_('question')},
 review:{tone:'violet',ink:'#1F1546',glyph:{kind:'text',text:'◉'}},working:{tone:'blue',ink:'#08224D',glyph:{kind:'spinner'}},
 done:{tone:'off',ink:'#DCE3EA',glyph:icon_('check'),mark:ORCA_DONE},
 failed:{tone:'red',ink:'#3A0B14',glyph:{kind:'dot'}},idle:{tone:'off',ink:'#AEB8C6',glyph:{kind:'dot'},mark:ORCA_STOPPED},
 unknown:{tone:'gray',ink:'#18212C',glyph:icon_('unproven'),mark:ORCA_UNPROVEN},
};
/** Provider marks instead of letters: Claude's mark, OpenAI's mark for Codex, a terminal for anything else. */
export const providerIcon=(provider:string|null|undefined)=>provider==='claude'?deckIcons.claude:provider==='codex'?deckIcons.openai:deckIcons.terminal;

/** Reduce Motion, read once and kept current. */
export function useReduceMotion():boolean{
 const [reduce,setReduce]=useState(false);
 useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduce(value);},()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduce);return()=>{alive=false;listener.remove();};},[]);
 return reduce;
}

/** One state mark at `size` points (already scaled), drawn as Orca draws it; the spinner turns unless Reduce Motion. */
export function StateMark({glyph,color,size,stroke=2.6,animate=true,onDeckFace=false}:{glyph:Glyph;color:string;size:number;stroke?:number;animate?:boolean;onDeckFace?:boolean}){
 const reduce=useReduceMotion(),spin=useRef(new Animated.Value(0)).current,turning=glyph.kind==='spinner'&&animate&&!reduce;
 useEffect(()=>{if(!turning){spin.setValue(0);return;}const loop=Animated.loop(Animated.timing(spin,{toValue:1,duration:1100,easing:Easing.linear,useNativeDriver:true}));loop.start();return()=>loop.stop();},[turning,spin]);
 const box={width:size,height:size,alignItems:'center' as const,justifyContent:'center' as const};
 if(glyph.kind==='spinner'){const d=size*0.62;return <View style={box}><Animated.View style={{width:d,height:d,borderRadius:d/2,borderWidth:stroke,borderColor:color,borderTopColor:turning?'transparent':color,transform:[{rotate:spin.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})}]}}/></View>;}
 if(glyph.kind==='icon')return <Image source={deckIcons[glyph.source]} contentFit="contain" cachePolicy="memory" accessible={false} tintColor={color} style={{width:size,height:size}}/>;
 if(glyph.kind==='dot'){const d=size*0.42;return <View style={box}><View style={{width:d,height:d,borderRadius:d/2,backgroundColor:color}}/></View>;}
 return onDeckFace?<DeckText style={{fontSize:size,color,fontWeight:'700',width:size,height:size,textAlign:'center'}}>{glyph.text}</DeckText>:<Text style={{fontSize:size,color,fontWeight:'700'}}>{glyph.text}</Text>;
}
