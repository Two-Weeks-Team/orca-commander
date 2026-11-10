import {RecordingDisplay,recordingTime} from './recording-display';
import type {VoiceDisplay} from '../../adapters/host-dictation';
import {DEFAULT_DECK_PHRASE,PHRASE_EDIT_MS,createPhraseGesture,type DeckPhrase} from '../../core/phrase-command';
import {DeckSurfaceSwipe,type SurfacePoint} from '../../core/deck-surface-swipe';
import {readableDisplayCache,type DeckDisplayCache,type PendingLcdDisplay} from '../../core/deck-display-cache';
import {deckClick} from '../../adapters/deck-feedback';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Animated, Easing, Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { deriveDeckView } from '../../core/deck-model';
import type { AgentState } from '../../core/types';
import { useMessages } from '../../i18n/provider';
import type { PlainMessageKey } from '../../i18n/messages';
import { deckBase, deckIcons, deckSprites, deckManifest } from './deck-assets';
import {DeckSkin} from './DeckSkin';
import { DECK_NUMERAL_FONT } from '../deck-fonts';
import {DeckText} from './deck-text';
import { percent, type UsageSnapshot } from '../../adapters/usage';
import { agentDisplay, type AgentDisplayKind } from '../../core/agent-display';
import { StateMark, displayColor, LCD_STATE_COLOR, lookFor, palette, providerIcon, useReduceMotion, type Glyph } from './state-mark';
import { controlTarget, deckLayout, dialDetents, keyTitle, LONG_PRESS_MS, STICK_REPEAT, stickRepeatInterval, swipeDirection, type DeckDirection, type DeckRect } from './deck-layout';

export interface DeckScreenProps {
 frame:{width:number;height:number};
 voiceDisplay?:VoiceDisplay;
 readAgeSeconds?:number;
 /** Targetless, expired independently; it never enters the live view/action model. */
 cachedDisplay?:DeckDisplayCache;
 /** LCD-only presentation while fresh key inventory awaits its live selection. */
 cachedLcdDisplay?:DeckDisplayCache;
 /** Display only; live transport status is independent of whether this previous identity is still present. */
 liveLcdDisplay?:PendingLcdDisplay;
 view:ReturnType<typeof deriveDeckView>;
 onPressKey:(slot:number)=>void; onStep:(direction:DeckDirection)=>void; onAttention:(direction:'prev'|'next')=>void;
 onAllow?:()=>void;onReject?:()=>void;
 claudePrompt?:{kind:'permission'|'question';enabled:boolean};
 onContent:()=>void;onInput:()=>void;onList:()=>void;onStatus:()=>void;onExplainKey:(slot:number)=>void;onReconnect:()=>void;onScan:()=>void;
 onVoice?:()=>void;onVoicePressIn?:()=>void;onVoicePressOut?:()=>void;voiceAvailable?:boolean;voiceRecording?:boolean;voiceAvailabilityReason?:string;
 onSwitchList?:()=>void;
 /** Revalidate the successful tab read at gesture capture/release, including between clock renders. */
 canNavigate?:()=>boolean;
 /** Focused Orca project and worktree, and whether the deck follows the desktop's activation. */
 focusInfo?:{project:string|null;worktree:string|null;following:boolean;synced?:boolean};usage?:UsageSnapshot;onFollow?:()=>void;
 /** The desktop status bar's usage refresh. */
 onRefreshUsage?:()=>void;
 phrase?:Readonly<DeckPhrase>;phraseReady?:boolean;phraseScope?:string;
 onPhraseConfirm?:()=>void;onPhraseEdit?:()=>void;
}
type SpriteName=keyof typeof deckSprites;
/** Chevrons sit on the knob face (radius ~37 pt in the skin), clear of the metal ring (~44-48 pt). */
const STICK_CHEVRON_RADIUS=24;
const stickChevrons:ReadonlyArray<readonly [string,number,number]>=[['⌃',0,-STICK_CHEVRON_RADIUS],['⌄',0,STICK_CHEVRON_RADIUS],['‹',-STICK_CHEVRON_RADIUS,0],['›',STICK_CHEVRON_RADIUS,0]];
/** The skin is decoration. Every label, state, number and control is native. */
export function DeckScreen(props:DeckScreenProps){
 const voice=props.voiceDisplay,showVoice=!!voice&&['loading','starting','recording','finishing','error'].includes(voice.phase);
 const {view}=props,{t,locale}=useMessages(),insets=useSafeAreaInsets();
 const layout=deckLayout(props.frame.width,props.frame.height,insets,undefined,Platform.OS==='ios'&&Platform.isPad?insets:undefined),s=layout.scale;
 const [pressed,setPressed]=useState<string|null>(null);
 const [screenReader,setScreenReader]=useState<boolean|null>(null);
 const touchVoiceHeld=useRef(false),skipVoiceActivation=useRef(false);
 const voiceCallbacks=useRef(props);voiceCallbacks.current=props;
 useEffect(()=>{
  let alive=true,receivedEvent=false;
  const setMode=(enabled:boolean)=>{
   if(!alive)return;
   if(touchVoiceHeld.current){touchVoiceHeld.current=false;skipVoiceActivation.current=true;voiceCallbacks.current.onVoicePressOut?.();setPressed(null);}
   setScreenReader(enabled);
  };
  const listener=AccessibilityInfo.addEventListener('screenReaderChanged',enabled=>{receivedEvent=true;setMode(enabled);});
  void AccessibilityInfo.isScreenReaderEnabled().then(enabled=>{if(!receivedEvent)setMode(enabled);},()=>{});
  return()=>{alive=false;listener.remove();};
 },[]);
 const [stickTilt,setStickTilt]=useState<DeckDirection|null>(null);
 // Working keys breathe together, slowly and faintly; Reduce Motion keeps them steady.
 const breath=useRef(new Animated.Value(1)).current;
 const reduceMotion=useReduceMotion();
 const voiceLabel=voice?.targetChangeBlocked?t('voice.targetLocked'):voice?.error||voice?.phase==='error'?props.voiceAvailabilityReason??t('voiceDisplay.error'):t(voice?.phase==='finishing'?'voiceDisplay.finishing':voice?.phase==='recording'?voice.preparing?'voiceDisplay.preparing':'voiceDisplay.recording':'voiceDisplay.starting');
 const nowMs=Date.now();
 const cached=readableDisplayCache(props.cachedDisplay??null,props.cachedDisplay?.hostId,nowMs);
 useEffect(()=>{if(cached&&touchVoiceHeld.current){touchVoiceHeld.current=false;skipVoiceActivation.current=true;voiceCallbacks.current.onVoicePressOut?.();setPressed(null);}},[cached]);
 const liveLcd=!cached&&view.display.link==='LIVE'&&!view.display.agent?readableDisplayCache(props.liveLcdDisplay??null,props.liveLcdDisplay?.hostId,nowMs):null;
 const lcdConnected=liveLcd!==null;
 const lcdCached=cached??liveLcd??(!view.display.agent?readableDisplayCache(props.cachedLcdDisplay??null,props.cachedLcdDisplay?.hostId,nowMs):null);
 const keys=cached?view.keys.map((slot,index)=>{const key=cached.keys[index]??null,agent=cached.rows.find(row=>row.key===key)??null;return{...slot,key,agent,state:agent?.state??'unknown',selected:key!==null&&key===cached.selectedKey,ignoring:false,unresolved:false};}):view.keys;
 const displayAgent=lcdCached?lcdCached.rows.find(row=>row.key===lcdCached.selectedKey)??null:view.display.agent;
 const displayName=displayAgent?.title??null,displayProvider=displayAgent?.provider;
 const displayState=displayAgent?.state??'unknown',displayTotal=cached?cached.items.length:view.commands.list.count;
 const cachedAt=lcdCached?.selectedKey?lcdCached.items.indexOf(lcdCached.selectedKey):-1;
 const displayPosition=lcdConnected&&props.liveLcdDisplay?.lcdSource==='retained'?null:lcdCached?(cachedAt>=0?{n:cachedAt+1,m:lcdCached.items.length}:null):view.display.position;
 const attentionKeys=cached?cached.items.filter(key=>{const row=cached.rows.find(r=>r.key===key);return row&&['permission','question','failed','review'].includes(row.state);}):[];
 const attentionCount=cached?attentionKeys.length:view.commands.nextDecision.count;
 const attentionAt=cached?.selectedKey?attentionKeys.indexOf(cached.selectedKey):-1;
 const displayDial=cached?(attentionAt>=0?{n:attentionAt+1,m:attentionKeys.length}:null):view.display.dial;
 const keylessAttention=cached?attentionKeys.filter(key=>!cached.keys.includes(key)).length:view.display.keylessAttention;
 const displayUnresolved=lcdCached?lcdCached.unresolved:view.display.unresolved,displayLink=lcdCached&&!lcdConnected?'STALE':view.display.link;
 const displayUsage=cached?cached.usage:props.usage,displayFocus=lcdCached?{...lcdCached.focusInfo,synced:false}:props.focusInfo;
 const refreshLabel=lcdCached&&!lcdConnected?t('cache.refreshing',{seconds:Math.floor(Math.max(0,nowMs-lcdCached.issuedAt)/1000)}):null;
 const displayOf=(agent:Parameters<typeof agentDisplay>[0]|null|undefined)=>agent?agentDisplay(agent,nowMs):null;
 const spinning=!cached&&!reduceMotion&&view.display.link==='LIVE'&&view.keys.some(key=>displayOf(key.agent)?.kind==='working');
 const breathing=spinning;
 useEffect(()=>{
  if(!breathing){breath.setValue(1);return;}
  const ease=Easing.inOut(Easing.sin);
  const loop=Animated.loop(Animated.sequence([Animated.timing(breath,{toValue:0.55,duration:1400,easing:ease,useNativeDriver:true}),Animated.timing(breath,{toValue:1,duration:1400,easing:ease,useNativeDriver:true})]));
  loop.start();return()=>loop.stop();
 },[breathing,breath]);
 /** One touch on the joystick, the dial or the display: where it began, steps already taken, and its current tilt. */
 const gesture=useRef<{x:number;y:number;kind:'stick'|'dial'|'lcd';steps:number;tilt:DeckDirection|null;long:boolean}|null>(null);
 // Timers outlive a render, so they call the newest handlers: an old closure would step from an old selection.
 const latest=useRef(props);latest.current=props;
 const phraseGesture=useRef(createPhraseGesture()),phraseTimer=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
 const skipPhrasePress=useRef(false);
 const [phraseProgress,setPhraseProgress]=useState(0);
 const phrase=props.phrase??DEFAULT_DECK_PHRASE;
 const phraseIdentity=(p:DeckScreenProps)=>AppState?.currentState==='active'&&p.phraseReady!==false&&!p.cachedDisplay&&!p.claudePrompt&&p.view.commands.input&&!p.voiceRecording&&(p.canNavigate?.()??true)?JSON.stringify([p.phraseScope??p.view.display.agent?.id,p.phrase??DEFAULT_DECK_PHRASE,p.frame]):null;
 const phraseScope=phraseIdentity(props);
 const stopPhraseProgress=()=>{if(phraseTimer.current!==undefined)clearInterval(phraseTimer.current);phraseTimer.current=undefined;setPhraseProgress(0);};
 const cancelPhrase=()=>{phraseGesture.current.cancel();stopPhraseProgress();setPressed(null);};
 const phraseAction=(action:'confirm'|'edit'|null)=>{if(!action)return;stopPhraseProgress();setPressed(null);deckClick();if(action==='edit'){skipPhrasePress.current=true;latest.current.onPhraseEdit?.();}else latest.current.onPhraseConfirm?.();};
 useEffect(()=>{cancelPhrase();},[phraseScope]);
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')cancelPhrase();});return()=>{listener.remove();phraseGesture.current.cancel();if(phraseTimer.current!==undefined)clearInterval(phraseTimer.current);};},[]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stopTimer=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
 useEffect(()=>stopTimer,[]);
 const n=(value:number|null|undefined)=>value===null||value===undefined?'—':String(value);
 const ageOf=(since:number|null|undefined)=>{const seconds=since===null||since===undefined?NaN:(nowMs-since)/1000;return Number.isFinite(seconds)&&seconds>=0?(seconds<60?`${Math.floor(seconds)}s`:seconds<3600?`${Math.floor(seconds/60)}m`:seconds<172800?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`):'—';};
 const stateText=(kind:AgentDisplayKind,since:number|null)=>kind==='stale'?t('state.stale',{time:ageOf(since)}):t(`state.${kind}`);
 /** This host's count; a trailing + when another host was omitted, so there may be more. */
 const countText=(value:number|null|undefined,lowerBound=false)=>value===null||value===undefined?'—':`${value}${lowerBound&&(cached?.partial??view.display.partial)?'+':''}`;
 /** The + appears only on the deck's total (the display and the key row); small badges stay plain numbers. */
 const pair=(value:{n:number;m:number}|null,total:number|null=null,lowerBound=false)=>{const m=countText(value?.m??total,lowerBound);return value?`${value.n}/${m}`:m;};
 const text=(size:number,color='#F4F7FB',extra?:StyleProp<TextStyle>):StyleProp<TextStyle>=>[{fontSize:size*s,color,fontWeight:'700'},extra];
 const num=(size:number,color='#F4F7FB'):StyleProp<TextStyle>=>[text(size,color),{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontVariant:['tabular-nums']}];
 const absolute=(x:number,y:number,w:number,h:number):DeckRect=>({left:x*s,top:y*s,width:w*s,height:h*s});
 const adaptive=layout.face!=='phone',wide=layout.face==='wide'||layout.face==='landscape',shortLandscape=layout.face==='short-landscape',art=deckSprites;
 const pxRect=(r:{left:number;top:number;width:number;height:number})=>({x:r.left*3,y:r.top*3,w:r.width*3,h:r.height*3});
 const placements=layout.spriteRects?{agentSlots:layout.spriteRects.agentKeys.map(pxRect),cmdSlots:layout.spriteRects.commands.map(pxRect),ptt:pxRect(layout.spriteRects.voice),stick:pxRect(layout.spriteRects.stick),dial:pxRect(layout.spriteRects.dial)}:deckManifest.placementsPx;
 const lcdScale=adaptive?Math.min(layout.status.height/130,layout.status.width/358):1;
 const lcdText=(size:number,color='#F4F7FB',extra?:StyleProp<TextStyle>)=>text(size*(adaptive?lcdScale/1.5:1),color,extra);
 const lcdNum=(size:number,color='#F4F7FB')=>num(size*(adaptive?lcdScale/1.5:1),color);
 const lcdRow=(top:number,height:number)=>adaptive?[styles.absolute,{left:16,right:16,top:top*lcdScale,height:height*lcdScale}]:[];
 const voiceS=adaptive?layout.stick.width/104:s;

 // Bundled art never uses the disk cache: Android keys it by resource id, and ids shift between builds, so an
 // updated app showed the previous build's green sprite for a blue key.
 const sprite=(name:SpriteName,placement:{x:number;y:number;w:number;h:number},id:string)=>
  <Image key={`${id}-${name}`} source={art[name]} contentFit="fill" transition={90} cachePolicy="memory" accessible={false} pointerEvents="none" style={[styles.absolute,{left:placement.x/3*s,top:placement.y/3*s,width:placement.w/3*s,height:placement.h/3*s}]}/>;
 const touch=(rect:DeckRect)=>[styles.absolute,controlTarget(rect,layout.width,layout.height)];
 const offline=!!cached||view.display.link!=='LIVE';
 const needsSelection=!displayAgent&&!offline&&keys.some(key=>key.agent!==null);
 const pct=(window:Parameters<typeof percent>[0])=>{const value=percent(window);return value===null?'—':`${value}%`;};
 const usageText=displayUsage?`${t('usage.claude')} ${t('usage.session')} ${pct(displayUsage.claude?.session)}, ${t('usage.weekly')} ${pct(displayUsage.claude?.weekly)}, ${t('usage.fable')} ${pct(displayUsage.claude?.fableWeekly)}; ${t('usage.codex')} ${t('usage.session')} ${pct(displayUsage.codex?.session)}, ${t('usage.weekly')} ${pct(displayUsage.codex?.weekly)}`:null;
 const lcd=displayOf(displayAgent);
 const lcdLook=lcd?lookFor(lcd.kind):palette[displayState];
 const lcdColor=lcd?displayColor(lcd.kind):LCD_STATE_COLOR[displayState];
 const lcdState=needsSelection?t('deck.chooseTabHint'):refreshLabel??(props.claudePrompt&&!cached?t(props.claudePrompt.kind==='permission'?'claude.permission':'claude.question'):(lcd?stateText(lcd.kind,lcd.since):t(`state.${displayState}`)));
 const usageSpan=(window:{session?:Parameters<typeof percent>[0];weekly?:Parameters<typeof percent>[0]}|null|undefined)=>[window?.session,window?.weekly].filter(w=>w).map(w=>pct(w)).join('·')||'—';
 const [refreshAsked,setRefreshAsked]=useState<number|null>(null);
 useEffect(()=>{if(refreshAsked!==null&&(props.usage?.observedAt??0)>refreshAsked)setRefreshAsked(null);},[props.usage?.observedAt,refreshAsked]);
 useEffect(()=>{if(refreshAsked===null)return;const id=setTimeout(()=>setRefreshAsked(null),15000);return()=>clearTimeout(id);},[refreshAsked]);
/** Orca's state mark for a look, in the key's ink unless the state has its own colour. */
 const glyph=(g:Glyph,color:string,size:number)=><StateMark onDeckFace glyph={g} color={color} size={size*s} stroke={2.6*s}/>;
 const icon=(source:typeof deckIcons[keyof typeof deckIcons],size:number,tint?:string,opacity=1)=><Image source={source} contentFit="contain" cachePolicy="memory" accessible={false} tintColor={tint} style={{width:size*s,height:size*s,opacity}}/>;
 const canNavigateNow=()=>{const p=latest.current;return !p.cachedDisplay&&p.view.display.link==='LIVE'&&(p.canNavigate?.()??true)&&(p.view.keys.some(key=>key.agent!==null)||p.view.commands.content);};
 const canDialNow=()=>{const p=latest.current;return !p.cachedDisplay&&p.view.display.link==='LIVE'&&(p.canNavigate?.()??true)&&p.view.commands.nextDecision.lit;};
 const surfaceSwipe=useRef(new DeckSurfaceSwipe());
 const surfaceLayout=JSON.stringify([props.frame.width,props.frame.height,insets.top,insets.right,insets.bottom,insets.left,layout.face]);
 const surfacePoints=(event:GestureResponderEvent,ending=false):SurfacePoint[]=>{
  const e=event.nativeEvent,points=ending?e.changedTouches:e.touches;
  return(points?.length?points:[e]).map(p=>({id:String(p.identifier??''),x:p.pageX,y:p.pageY}));
 };
 const excludeSurface=()=>surfaceSwipe.current.exclude();
 const beginSurface=(event:GestureResponderEvent)=>surfaceSwipe.current.begin(surfacePoints(event),surfaceLayout,canNavigateNow());
 const captureSurface=(event:GestureResponderEvent)=>surfaceSwipe.current.wants(surfacePoints(event),surfaceLayout,canNavigateNow());
 const finishSurface=(event:GestureResponderEvent)=>{
  const direction=surfaceSwipe.current.finish(surfacePoints(event,true)[0],surfaceLayout,canNavigateNow());
  if(direction){deckClick();latest.current.onStep(direction);}
 };
 const dialEnabled=!offline&&view.commands.nextDecision.lit;
 const navigationEnabled=!offline&&(view.keys.some(key=>key.agent!==null)||view.commands.content);
 const pairedVoiceCallbacks=!!props.onVoicePressIn&&!!props.onVoicePressOut;
 const voiceEnabled=!cached&&screenReader!==null&&!!props.voiceAvailable&&view.commands.voice&&(pairedVoiceCallbacks||!!props.onVoice);
 const microphoneColor=props.voiceRecording?'#FF0C36':voiceEnabled?'#0D1117':'#5D6775';
 const voicePressIn=()=>{if(!voiceEnabled||screenReader!==false||!pairedVoiceCallbacks)return;touchVoiceHeld.current=true;skipVoiceActivation.current=false;setPressed('voice');props.onVoicePressIn?.();};
 const voicePressOut=()=>{if(!touchVoiceHeld.current)return;touchVoiceHeld.current=false;setPressed(null);props.onVoicePressOut?.();};
 const voiceActivate=()=>{
  if(!voiceEnabled)return;
  if(skipVoiceActivation.current){skipVoiceActivation.current=false;return;}
  if(screenReader===true&&pairedVoiceCallbacks){props.onVoicePressIn?.();props.onVoicePressOut?.();}
  else if(!pairedVoiceCallbacks)props.onVoice?.();
 };
 const startGesture=(event:GestureResponderEvent,kind:'stick'|'dial'|'lcd')=>{
  stopTimer();gesture.current={x:event.nativeEvent.pageX,y:event.nativeEvent.pageY,kind,steps:0,tilt:null,long:false};setPressed(kind);
  // Holding the display still resumes following the desktop.
  if(kind==='lcd'&&!lcdCached)timer.current=setTimeout(()=>{const g=gesture.current;if(g?.kind==='lcd'&&!g.tilt){const p=latest.current;if(p.cachedDisplay||p.cachedLcdDisplay&&!p.view.display.agent||p.view.display.link!=='LIVE')return;g.long=true;deckClick();(p.onFollow??p.onStatus)();}},LONG_PRESS_MS);
 };
 const moveGesture=(event:GestureResponderEvent)=>{
  const g=gesture.current;if(!g)return;const dx=event.nativeEvent.pageX-g.x,dy=event.nativeEvent.pageY-g.y;
  // The dial turns while the finger drags: every detent picks the next or previous decision.
  if(g.kind==='dial'){if(!canDialNow()){cancelGesture();return;}const want=dialDetents(dx,dy);while(g.steps!==want){const forward=g.steps<want;g.steps+=forward?1:-1;deckClick();latest.current.onAttention(forward?'next':'prev');}return;}
  if(g.kind==='stick'&&!canNavigateNow()){cancelGesture();return;}
  const tilt=swipeDirection(dx,dy);if(tilt===g.tilt)return;g.tilt=tilt;
  if(g.kind==='lcd'){if(tilt)stopTimer();return;}
  // A held stick repeats its step after a pause, like holding a direction on a physical stick.
  setStickTilt(tilt);stopTimer();if(!tilt)return;
  const step=()=>{const current=gesture.current,p=latest.current;if(!current||current.tilt!==tilt||p.cachedDisplay||p.view.display.link!=='LIVE')return;current.steps++;deckClick();latest.current.onStep(tilt);timer.current=setTimeout(step,stickRepeatInterval(tilt));};
  timer.current=setTimeout(step,STICK_REPEAT.delayMs);
 };
 const cancelGesture=()=>{stopTimer();gesture.current=null;setPressed(null);setStickTilt(null);};
 const finishGesture=(event:GestureResponderEvent)=>{
  const g=gesture.current;cancelGesture();if(!g||g.long||g.steps!==0)return;
  const direction=swipeDirection(event.nativeEvent.pageX-g.x,event.nativeEvent.pageY-g.y),p=latest.current;
  if(g.kind==='dial'){if(canDialNow()){deckClick();p.onAttention(direction==='left'||direction==='up'?'prev':'next');}return;}
  // Every surface shares the joystick direction: right is next tab, down is next project.
  if(direction){if(g.kind==='lcd'&&p.cachedLcdDisplay&&!p.view.display.agent)return;if(canNavigateNow()){deckClick();p.onStep(direction);}return;}
  // A tap: the stick's centre opens the selected tab's content; the display opens the status.
  if(g.kind==='stick'){if(canNavigateNow()&&p.view.commands.content){deckClick();p.onContent();}return;}
  deckClick();p.onStatus();
 };
 const commands:Array<{label:PlainMessageKey;glyph:string;enabled:boolean;action?:()=>void;count?:number|null;amber?:boolean}>=[
  view.commands.scanQr?{label:'link.scan',glyph:'⌗',enabled:true,action:props.onScan}:
  view.commands.reconnect?{label:'link.reconnect',glyph:'↻',enabled:true,action:props.onReconnect}:{label:props.claudePrompt?'claude.answer':'cmd.allow',glyph:props.claudePrompt?'☷':'✓',enabled:!cached&&(props.claudePrompt?props.claudePrompt.enabled:view.commands.allow)&&!!props.onAllow,action:props.onAllow},
  {label:props.claudePrompt?'claude.cancel':'cmd.reject',glyph:'×',enabled:!cached&&(props.claudePrompt?props.claudePrompt.enabled:view.commands.reject)&&!!props.onReject,action:props.onReject},
  {label:'cmd.content',glyph:'▤',enabled:!cached&&view.commands.content,action:props.onContent},
  {label:'cmd.input',glyph:'⌨',enabled:!cached&&!props.claudePrompt&&view.commands.input,action:props.onInput},
  {label:'phrase.button',glyph:'⏵|',enabled:phraseScope!==null,action:props.onPhraseConfirm},
   {label:'cmd.list',glyph:'☷',enabled:!cached&&view.commands.list.lit,action:props.onList,count:displayTotal},
 ];
 if(layout.needsList)return <View style={[styles.root,styles.center,{paddingTop:insets.top,paddingBottom:insets.bottom}]}><Pressable android_disableSound accessibilityRole="button" onPress={props.onSwitchList??props.onList} style={{minWidth:160,minHeight:64,alignItems:'center',justifyContent:'center'}}><DeckText style={{fontSize:20,color:'#F4F7FB'}}>{t('cmd.list')}</DeckText></Pressable></View>;
 return <View style={styles.root} accessibilityLanguage={locale} testID="deck-screen"
  onStartShouldSetResponderCapture={beginSurface} onMoveShouldSetResponderCapture={captureSurface}
  onResponderGrant={()=>{surfaceSwipe.current.grant();setPressed(null);}}
  onResponderStart={event=>{if(event.nativeEvent.touches.length!==1)beginSurface(event);}}
  onResponderMove={captureSurface} onResponderRelease={finishSurface}
  onTouchEnd={event=>surfaceSwipe.current.endUnclaimed(event.nativeEvent.touches.length)} onTouchCancel={()=>surfaceSwipe.current.cancel()}
  onResponderTerminationRequest={()=>true} onResponderTerminate={()=>surfaceSwipe.current.cancel()} onResponderReject={()=>surfaceSwipe.current.cancel()}>
  <View style={[styles.absolute,{left:layout.left,top:layout.top,width:layout.width,height:layout.height,opacity:cached?0.62:1}]}>
   {adaptive?<DeckSkin layout={layout}/>:<Image source={deckBase} contentFit="fill" cachePolicy="memory" accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill}/>}
   {keys.map((key,index)=>{
    const shown=!offline||cached?displayOf(key.agent):null;
    const tone=shown?lookFor(shown.kind).tone:'off';
    const phase=pressed===`key-${index}`?'pressed':key.selected?'selected':'up';
    if(tone!=='blue'||phase==='pressed'||shown?.kind!=='working')return sprite(`agent_${tone}_${phase}` as SpriteName,placements.agentSlots[index],`agent-${index}`);
    // Working: the unlit key under a breathing blue light.
    return <View key={`agent-${index}-breath`} pointerEvents="none" style={StyleSheet.absoluteFill}>{sprite(`agent_off_${phase}` as SpriteName,placements.agentSlots[index],`agent-${index}-base`)}<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{opacity:breath}]}>{sprite(`agent_blue_${phase}` as SpriteName,placements.agentSlots[index],`agent-${index}-light`)}</Animated.View></View>;
   })}
   {commands.map((_command,index)=>sprite(pressed===`cmd-${index}`?'cmd_pressed':'cmd_up',placements.cmdSlots[index],`command-${index}`))}
   {sprite(props.voiceRecording?'ptt_active':pressed==='voice'&&voiceEnabled?'ptt_pressed':'ptt_up',placements.ptt,'ptt')}
   {sprite(stickTilt?`stick_${stickTilt}`:'stick_center',placements.stick,'stick')}{sprite('dial',placements.dial,'dial')}
   <View accessible accessibilityRole="button" accessibilityHint={[t('deck.displayGestures'),displayFocus&&!displayFocus.following?t('focus.manual'):null].filter(Boolean).join(' ')} accessibilityActions={[{name:'activate'},{name:'longpress'}]} onAccessibilityAction={event=>{deckClick();if(event.nativeEvent.actionName==='longpress'&&!lcdCached)(props.onFollow??props.onStatus)();else props.onStatus();}} accessibilityLabel={showVoice?[voiceLabel,voice?.text].filter(Boolean).join('. '):[displayFocus?.project,displayFocus?.worktree,displayName??(needsSelection?t('deck.chooseTab'):null),lcdState,pair(displayPosition,displayTotal,true),displayLink,displayFocus?.following&&displayFocus.synced===true?t('focus.following'):null,`${t('status.unresolved')} ${n(displayUnresolved)}`,usageText].filter(Boolean).join(', ')} onStartShouldSetResponderCapture={excludeSurface} onStartShouldSetResponder={()=>true} onResponderGrant={event=>startGesture(event,'lcd')} onResponderMove={moveGesture} onResponderRelease={finishGesture} onResponderTerminate={cancelGesture} style={[touch(layout.status),{paddingHorizontal:adaptive?0:16*s,paddingVertical:adaptive?0:8*s,justifyContent:'space-between',opacity:!cached&&lcdCached&&(!lcdConnected||props.liveLcdDisplay?.lcdSource==='retained')?0.62:1}]} testID="deck-status">
    {showVoice?<RecordingDisplay statusNotice={!!voice?.error||!!voice?.targetChangeBlocked||!!voice?.preparing} projectPath={[displayFocus?.project,displayFocus?.worktree].filter(Boolean).join(' › ')} label={voiceLabel} phase={voice!.phase} text={voice?.text||t('voiceDisplay.waiting')} elapsedMs={voice?.elapsedMs??0} level={voice?.level??0} position={pair(displayPosition,displayTotal,true)} counts={view.display.counts} link={displayLink} age={props.readAgeSeconds===undefined?'—':String(props.readAgeSeconds)+'s'} scale={adaptive?lcdScale:s}/>:<>
    <View style={[styles.row,...lcdRow(12,24),{height:24*s*lcdScale}]}><DeckText numberOfLines={1} style={[lcdText(11,'#A6F5D8'),{flex:1,marginRight:8*s}]}>{[displayFocus?.project,displayFocus?.worktree].filter(Boolean).join(' › ')||(needsSelection?'':'—')}</DeckText>{displayFocus?<View testID={displayFocus.following?'deck-follow-on':'deck-follow-off'} style={{marginRight:8*s}}>{displayFocus.following?icon(deckIcons.monitor,15*lcdScale,displayFocus.synced===false?'#5F7A70':'#74E0A0'):<DeckText style={lcdText(11,'#FFC24D')}>{t('focus.project')}</DeckText>}</View>:null}<DeckText style={lcdNum(22,'#E6FFF6')}>{pair(displayPosition,displayTotal,true)}</DeckText></View>
    <DeckText variant="title" numberOfLines={1} style={[{height:32*s*lcdScale},...lcdRow(38,32),lcdText(20,'#E6FFF6')]}>{keyTitle(displayName)??(needsSelection?t('deck.chooseTab'):'—')}</DeckText>
    <View style={[styles.row,...lcdRow(66,28),{justifyContent:'flex-start',gap:10*s*lcdScale,height:28*s*lcdScale}]}>{needsSelection?<DeckText numberOfLines={1} style={lcdText(11,'#A6F5D8')}>{lcdState}</DeckText>:<>{displayProvider?icon(providerIcon(displayProvider),15*lcdScale,displayProvider==='claude'?undefined:'#E6FFF6'):<DeckText style={lcdText(11,'#A6F5D8')}>—</DeckText>}<View style={[styles.row,{gap:4*s},lcdCached?{flex:1,minWidth:0}:null]}>{glyph(lcdLook.glyph,lcdColor,15*lcdScale)}<DeckText style={lcdText(13,lcdColor)}>{lcdState}</DeckText></View><DeckText style={lcdNum(17,'#E6FFF6')}>{lcdCached&&!lcdConnected?'':ageOf(lcd?.since)}</DeckText></>}<View style={[styles.row,{gap:4*s}]}><View style={{width:8*s,height:8*s,borderRadius:4*s,backgroundColor:offline||lcdCached&&!lcdConnected?'#FF7A8A':'#5FD38D'}}/>{offline&&!lcdCached?<DeckText style={lcdText(11,'#FFB3BC')}>{displayLink}</DeckText>:null}</View><DeckText style={[lcdNum(19,displayUnresolved?'#FF7A8A':'#5F7A70'),{marginLeft:'auto'}]}>!{n(displayUnresolved)}</DeckText></View>
    <View style={[styles.row,...lcdRow(96,26),{borderTopWidth:1,borderTopColor:'#315346',paddingTop:2*s,paddingRight:30*s,height:26*s*lcdScale,justifyContent:'flex-start',gap:6*s}]} testID="deck-usage-line">{icon(deckIcons.claude,14*lcdScale)}<DeckText style={lcdNum(14,'#F2B48C')}>{usageSpan(displayUsage?.claude)}</DeckText><DeckText style={[lcdText(11,'#D3C3FF'),{marginLeft:2*s}]}>{t('usage.fable')}</DeckText><DeckText style={lcdNum(14,'#D3C3FF')}>{pct(displayUsage?.claude?.fableWeekly)}</DeckText><View style={{width:8*s}}/>{icon(deckIcons.openai,14*lcdScale,'#E6FFF6')}<DeckText style={lcdNum(14,'#B9C7D6')}>{usageSpan(displayUsage?.codex)}</DeckText></View>
    </>}
   </View>
   {props.onRefreshUsage&&!showVoice?<Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('usage.refresh')} accessibilityState={{busy:refreshAsked!==null,disabled:offline}} disabled={offline} onStartShouldSetResponderCapture={excludeSurface} onPress={()=>{deckClick();setRefreshAsked(Date.now());props.onRefreshUsage?.();}} hitSlop={6*s} style={[styles.absolute,styles.center,{left:layout.status.left+layout.status.width-38*s,top:layout.status.top+layout.status.height-32*s,width:34*s,height:30*s}]} testID="deck-usage-refresh">{icon(deckIcons.refresh,15,offline?'#5F7A70':'#A6F5D8',refreshAsked!==null?0.4:1)}</Pressable>:null}
   {keys.map((key,index)=>{
    const active=!!key.agent&&!offline&&!key.ignoring;const known=!!key.agent&&(!offline||!!cached);
    const kr=layout.agentKeys[index],ks=Math.min(kr.width/110,kr.height/104);

    const shown=displayOf(key.agent);const look=shown?lookFor(shown.kind):palette[key.state];const ink=known?look.ink:'#7D8794';const mark=known?look.mark??ink:ink;
    return <Pressable android_disableSound key={index} accessibilityRole="button" accessibilityLabel={[`${t('key.slot')} ${key.index}`,keyTitle(key.agent?.title),key.agent?.provider==='claude'?t('usage.claude'):key.agent?.provider==='codex'?t('usage.codex'):null,offline&&key.agent?displayLink:shown?stateText(shown.kind,shown.since):t(`state.${key.state}`),shown&&shown.kind!=='stale'?ageOf(shown.since):null,key.unresolved?t('status.unresolved'):null].filter(Boolean).join(', ')} accessibilityState={{selected:key.selected,disabled:!active}} onPress={()=>{if(active){deckClick();props.onPressKey(index);}}} onLongPress={()=>{surfaceSwipe.current.consume();if(!cached)props.onExplainKey(index);}} delayLongPress={450} onPressIn={()=>{if(active)setPressed(`key-${index}`);}} onPressOut={()=>setPressed(null)} style={[touch(layout.agentKeys[index]),{padding:adaptive?0:8*s,borderRadius:20*s},key.selected?{borderWidth:2*s,borderColor:'#F4F7FB'}:null]} testID={`deck-key-${key.index}`}>
     {adaptive?<>
      <View style={[styles.absolute,styles.row,{left:10*ks,right:12*ks,top:8*ks,height:48*ks}]}><DeckText style={num(33,ink)}>{key.index}</DeckText>{key.agent&&(!offline||cached)?glyph(look.glyph,mark,24*ks):<DeckText style={text(24,mark)}>⊘</DeckText>}</View>
      <View style={[styles.absolute,styles.row,{left:10*ks,right:12*ks,top:kr.height-46*ks,height:22*ks}]}>{key.agent?icon(providerIcon(key.agent.provider),16*ks,key.agent.provider==='claude'&&active?undefined:ink,active?1:0.6):<DeckText style={text(10,ink)}>—</DeckText>}<DeckText style={num(17,ink)}>{ageOf(shown?.since)}</DeckText></View>
      <DeckText variant="title" numberOfLines={1} style={[text(12,ink),styles.absolute,{left:10*ks,right:10*ks,top:kr.height-24*ks,height:24*ks}]}>{keyTitle(key.agent?.title)??'—'}</DeckText>
     </>:<>
     <View style={[styles.row,{height:Math.max(0,48*s-Math.max(0,24-18*s))}]}><DeckText style={num(33,ink)}>{key.index}</DeckText>{key.agent&&(!offline||cached)?glyph(look.glyph,mark,24):<DeckText style={text(24,mark)}>⊘</DeckText>}</View>
     <View style={[styles.row,{marginTop:'auto',marginBottom:2*s,height:20*s}]}>{key.agent?icon(providerIcon(key.agent.provider),16,key.agent.provider==='claude'&&active?undefined:ink,active?1:0.6):<DeckText style={text(10,ink)}>—</DeckText>}<DeckText style={num(17,ink)}>{ageOf(shown?.since)}</DeckText></View>
     <DeckText variant="title" numberOfLines={1} style={[text(12,ink),{height:Math.max(24,18*s)}]}>{keyTitle(key.agent?.title)??'—'}</DeckText>
     </>}

     {key.unresolved?<DeckText style={[num(21,'#FF465F'),styles.absolute,{right:8*s,bottom:28*s}]}>!</DeckText>:null}
    </Pressable>;
   })}
   <View pointerEvents="none" style={[styles.absolute,layout.keyStrip,styles.row]}><DeckText style={num(18,'#9AA6B5')}>1–{keys.length} / {countText(displayTotal,true)}</DeckText><DeckText style={num(18,keylessAttention?'#FFC24D':'#5D6775')}>▲{(cached||view.display.counts)?countText(keylessAttention):'—'}</DeckText></View>
   {commands.map((command,index)=>{
    const rect=layout.commands[index],color=command.enabled?(command.amber?'#FFB020':'#F4F7FB'):'#5D6775';
    const label=index===4?phrase.name:t(command.label);
    const labelHeight=Math.max(48,48*s),labelWidth=Math.max(0,rect.width-8*s);
    return <Pressable android_disableSound key={index} accessibilityRole="button" accessibilityLabel={index===4?`${phrase.name}: ${phrase.text}`:[label,command.count===undefined?null:countText(command.count)].filter(Boolean).join(', ')} accessibilityHint={index===4?t('phrase.editHint'):undefined} accessibilityActions={index===4?[{name:'activate'},{name:'edit',label:t('phrase.title')}]:undefined} onAccessibilityAction={index===4?event=>{if(phraseIdentity(latest.current)===null||!['activate','edit'].includes(event.nativeEvent.actionName))return;cancelPhrase();phraseAction(event.nativeEvent.actionName==='edit'?'edit':'confirm');}:undefined} accessibilityState={{disabled:!command.enabled}} disabled={!command.enabled} delayLongPress={index===4?PHRASE_EDIT_MS:undefined} onLongPress={index===4?()=>phraseAction(phraseGesture.current.long(phraseIdentity(latest.current),Date.now())):undefined} onTouchCancel={index===4?cancelPhrase:undefined} onPress={()=>{if(index===4){if(skipPhrasePress.current){skipPhrasePress.current=false;return;}if(screenReader===true){if(phraseIdentity(latest.current)!==null)phraseAction('confirm');}else phraseAction(phraseGesture.current.release(phraseIdentity(latest.current),Date.now()));}else if(command.enabled&&command.action){deckClick();command.action();}}} onPressIn={()=>{setPressed(`cmd-${index}`);if(index===4){skipPhrasePress.current=false;stopPhraseProgress();phraseGesture.current.begin(phraseIdentity(latest.current),Date.now());phraseTimer.current=setInterval(()=>{if(phraseIdentity(latest.current)!==phraseScope){cancelPhrase();return;}setPhraseProgress(phraseGesture.current.progress(Date.now()));},30);}}} onPressOut={()=>{setPressed(null);if(index===4)stopPhraseProgress();}} style={[touch(rect),styles.center]} testID={`deck-command-${index}`}>
     {command.count!==undefined?<DeckText style={[num(16,command.enabled?'#FFD27A':'#7A8594'),styles.absolute,{right:9*s,top:wide?3*s:5*s,...(wide?{height:20*s}:{})}]}>{countText(command.count)}</DeckText>:null}
     {index===4?<View pointerEvents="none" style={[styles.absolute,{left:0,right:0,top:adaptive?rect.height*.4-12*s:2*s,height:adaptive?24*s:Math.max(0,rect.height-labelHeight-6*s),flexDirection:'row',alignItems:'center',justifyContent:'center',gap:2*s}]}><View style={{width:0,height:0,borderTopWidth:7*s,borderBottomWidth:7*s,borderLeftWidth:10*s,borderTopColor:'transparent',borderBottomColor:'transparent',borderLeftColor:color}}/><View style={{width:3*s,height:14*s,backgroundColor:color,borderRadius:s}}/></View>:<DeckText style={[text(28,color),styles.absolute,{left:0,right:0,textAlign:'center',top:adaptive?rect.height*.4-Math.min(70,rect.height*.35)/2:2*s,height:adaptive?Math.min(70,rect.height*.35):Math.max(0,rect.height-labelHeight-6*s)}]}>{command.glyph}</DeckText>}
     {adaptive?<DeckText variant="command" testID={`deck-label-${index}`} numberOfLines={1} style={[text(13,color),styles.absolute,{left:4*s,top:rect.height*.72-Math.min(44,rect.height*.28)/2,width:labelWidth,textAlign:'center',fontSize:Math.max(13,13*s),lineHeight:Math.max(16,16*s),height:Math.min(44,rect.height*.28)}]}>{label}</DeckText>:<View pointerEvents="none" style={[styles.absolute,{left:4*s,bottom:4*s,width:labelWidth,height:labelHeight,justifyContent:'center'}]}><DeckText variant="command" testID={`deck-label-${index}`} numberOfLines={1} style={[text(13,color),{width:labelWidth,textAlign:'center',fontSize:Math.max(13,13*s),lineHeight:Math.max(16,16*s)}]}>{label}</DeckText></View>}
     {index===4&&phraseProgress>0?<View pointerEvents="none" style={{position:'absolute',left:8*s,bottom:6*s,right:8*s,height:3*s,borderRadius:2,overflow:'hidden'}}><View style={{height:'100%',width:`${phraseProgress*100}%`,backgroundColor:'#A8C6EB'}}/></View>:null}
    </Pressable>;
   })}

   <View accessible accessibilityRole="adjustable" accessibilityLabel={t('deck.joystick')} accessibilityState={{disabled:!navigationEnabled}} accessibilityValue={{text:pair(displayPosition,displayTotal,true)}} accessibilityActions={[{name:'increment'},{name:'decrement'},{name:'rowUp',label:t('deck.projectUp')},{name:'rowDown',label:t('deck.projectDown')}]} onAccessibilityAction={event=>{if(navigationEnabled)props.onStep(event.nativeEvent.actionName==='rowUp'?'up':event.nativeEvent.actionName==='rowDown'?'down':event.nativeEvent.actionName==='increment'?'right':'left');}} onStartShouldSetResponderCapture={excludeSurface} onStartShouldSetResponder={()=>navigationEnabled} onResponderGrant={event=>startGesture(event,'stick')} onResponderMove={moveGesture} onResponderRelease={finishGesture} onResponderTerminate={cancelGesture} style={[touch(layout.stick),styles.center]} testID="deck-joystick">
    {stickChevrons.map(([glyph,dx,dy])=>{const box=(adaptive?28:18)*s;const reach=adaptive?30*layout.stick.width/104/STICK_CHEVRON_RADIUS:1;return <DeckText key={glyph} style={[text(14,'#AEB8C6'),styles.absolute,{width:box,height:box,textAlign:'center',left:'50%',top:'50%',marginLeft:dx*s*reach-box/2,marginTop:dy*s*reach-box/2}]}>{glyph}</DeckText>;})}
   </View>
   <Pressable android_disableSound accessibilityRole="button" accessibilityLabel={`${t(props.voiceRecording?'ptt.recording':'ptt.hold')}. ${voiceEnabled?'':screenReader===null?t('common.loading'):props.voiceAvailabilityReason??t('deck.voicePending')}`} accessibilityState={{disabled:!voiceEnabled}} disabled={!voiceEnabled} onStartShouldSetResponderCapture={excludeSurface} onPress={screenReader===true||!pairedVoiceCallbacks?voiceActivate:undefined} onPressIn={voicePressIn} onPressOut={voicePressOut} style={[touch(layout.voice),styles.center]} testID="deck-voice">
    <View testID="deck-voice-microphone" style={{width:17*voiceS,height:30*voiceS,borderRadius:9*voiceS,borderWidth:3*voiceS,borderColor:microphoneColor}}/><View style={{width:29*voiceS,height:13*voiceS,borderBottomLeftRadius:16*voiceS,borderBottomRightRadius:16*voiceS,borderBottomWidth:3*voiceS,borderLeftWidth:3*voiceS,borderRightWidth:3*voiceS,borderColor:microphoneColor,marginTop:-11*voiceS}}/><View style={{width:3*voiceS,height:7*voiceS,backgroundColor:microphoneColor}}/>
    <DeckText variant={layout.face==='cover'?'title':undefined} numberOfLines={wide||shortLandscape?1:2} style={[text(11,voiceEnabled?'#0D1117':'#5D6775'),{textAlign:'center',marginTop:5*voiceS,fontSize:adaptive?13:Math.max(13,11*voiceS),maxWidth:adaptive?layout.voice.width*.9:undefined},layout.face==='cover'?{width:layout.voice.width*.86,lineHeight:16}:null]}>{props.voiceRecording?recordingTime(voice?.elapsedMs??0):t(shortLandscape?'ptt.talk':'ptt.hold')}</DeckText>
   </Pressable>
   <View accessible accessibilityRole="adjustable" accessibilityLabel={t('deck.dial')} accessibilityState={{disabled:!dialEnabled}} accessibilityValue={{text:pair(displayDial,attentionCount)}} accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={event=>{if(canDialNow())props.onAttention(event.nativeEvent.actionName==='increment'?'next':'prev');}} onStartShouldSetResponderCapture={excludeSurface} onStartShouldSetResponder={()=>dialEnabled} onResponderGrant={event=>startGesture(event,'dial')} onResponderMove={moveGesture} onResponderRelease={finishGesture} onResponderTerminate={cancelGesture} style={[touch(layout.dial),styles.center]} testID="deck-dial"><DeckText style={num(24,'#10141A')}>{pair(displayDial,attentionCount)}</DeckText></View>
   {props.onSwitchList?<Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('cmd.list')} onPress={props.onSwitchList} style={[touch(absolute((layout.plane.width-100)/2,layout.plane.height-48,100,48)),styles.center]} testID="deck-switch-list"><DeckText style={text(11,'#9AA6B5')}>☷ {t('cmd.list')}</DeckText></Pressable>:null}
  </View>
 </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#0A0D12'},absolute:{position:'absolute'},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},center:{alignItems:'center',justifyContent:'center'}});
