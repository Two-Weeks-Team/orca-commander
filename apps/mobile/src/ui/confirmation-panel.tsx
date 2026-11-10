import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AccessibilityInfo,AppState,Modal,Pressable,ScrollView,Text,View,type GestureResponderEvent,type LayoutChangeEvent,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {createConfirmationGesture} from '../core/confirmation-gesture';
import {useMessages} from '../i18n/provider';
import {S,CS} from './theme';

export type ConfirmPanelHeaderState=ReturnType<ReturnType<typeof createConfirmationGesture>['snapshot']>;
export interface ConfirmPanelProps {
 /** A caller-owned native Modal can embed gestures/content without nesting native controllers. */
 embedded?:boolean;holdLabel?:string;deckCancelLabel?:string;
 preparedAt:number;
 /** Keep this native owner mounted until iOS reports dismissal. Display-only, never gesture identity. */
 visible?:boolean;onDismiss?:()=>void;
 /** Must cover every identity/content/action revision. This is a UI fence, never target authority. */
 scopeKey:string;
 /** Identity and content must flow in full; callers must not truncate or hide their own body. */
 identity:ReactNode;content:ReactNode;sourceLabel:string;characterCount?:number;
 disabled:boolean;onConfirm():void;onCancel():void;resultLabel?:string;cancelDisabled?:boolean;
 title?:string;cancelLabel?:string;explanation?:string;confirmLabel?:string;confirmAccessibilityHint?:string;
 /** Presentation only: changing this notice must not rearm or extend the original gesture. */
 beforeConfirmNotice?:string;processingLabel?:string;
 deck?:boolean;hideResultLabel?:boolean;header?:(state:ConfirmPanelHeaderState)=>ReactNode;
}
const monotonicNow=()=>performance.now();
// Authority still pulses every 40ms. Gap-only diagnostics are captured on the next visible
// change, including every terminal transition, rather than scheduling another React render.
const confirmationDisplayKey=(state:ReturnType<ReturnType<typeof createConfirmationGesture>['snapshot']>)=>JSON.stringify([
 state.phase,state.readEnd,state.phase==='holding'?Math.min(0.8,state.holdMs/1000).toFixed(1):'',state.cancellationReason,
]);
/** Presentation and gestures only. The caller owns the exact original ticket, cancellation and revalidation. */
export function ConfirmPanel(props:ConfirmPanelProps){
 const {locale,presentationRevision}=useMessages();
 const scope=JSON.stringify([props.scopeKey,props.preparedAt,locale,presentationRevision,props.sourceLabel,props.characterCount,props.title,props.cancelLabel,props.explanation,props.confirmLabel,props.confirmAccessibilityHint]);
 const nativeScope=useRef(scope);if(props.visible!==false)nativeScope.current=scope;
 return <ConfirmationPanel key={nativeScope.current} {...props}/>;
}

function ConfirmationPanel({embedded=false,holdLabel,deckCancelLabel,visible=true,onDismiss,preparedAt,identity,content,sourceLabel,characterCount,disabled,onConfirm,onCancel,title,cancelLabel,explanation,confirmLabel,confirmAccessibilityHint,resultLabel,cancelDisabled=false,beforeConfirmNotice,processingLabel,deck=false,header,hideResultLabel=false}:ConfirmPanelProps){
 const {t}=useMessages();
 const [gesture]=useState(()=>createConfirmationGesture({now:monotonicNow(),wallNow:Date.now(),preparedAt}));
 const [state,setState]=useState(gesture.snapshot());
 const publishedDisplay=useRef(confirmationDisplayKey(state));
 const [undelivered,setUndelivered]=useState(false);
 const [screenReader,setScreenReader]=useState<boolean|null>(null);
 const mode=useRef<boolean|null>(null),delivered=useRef(false),releaseAccepted=useRef(false);
 const hasResult=resultLabel!==undefined;
 const callbacks=useRef({onConfirm,onCancel,disabled,cancelDisabled,hasResult});callbacks.current={onConfirm,onCancel,disabled,cancelDisabled,hasResult};
 const geometry=useRef({offset:0,viewport:0,targetEnd:Infinity,contentEnd:Infinity,identitySeen:false});
 const reviewedTarget=useRef(false);
 const [targetReviewed,setTargetReviewed]=useState(false);
 // Disable synchronously, rather than waiting for an effect after a new context was rendered.
 gesture.setDisabled(disabled||cancelDisabled||hasResult);
 const publish=()=>{
  const next=gesture.snapshot(),key=confirmationDisplayKey(next);
  if(key===publishedDisplay.current)return;
  publishedDisplay.current=key;setState(next);
 };
 const cancel=()=>{if(callbacks.current.cancelDisabled)return;gesture.cancel();releaseAccepted.current=false;publish();callbacks.current.onCancel();};
 const confirmOnce=()=>{if(delivered.current||callbacks.current.disabled||callbacks.current.cancelDisabled||callbacks.current.hasResult||AppState.currentState!=='active')return;delivered.current=true;callbacks.current.onConfirm();};
 const observeGeometry=()=>{
  if(mode.current!==false)return;
  const g=geometry.current;
  if(g.viewport<=0)return;
  const visible=(y:number)=>Number.isFinite(y)&&y>=g.offset-1&&y<=g.offset+g.viewport+1;
  if(visible(g.targetEnd))g.identitySeen=true;
  if(g.identitySeen&&visible(g.contentEnd)){gesture.setReadEnd(true);publish();}
 };
 useEffect(()=>{
  let alive=true;
  const setMode=(enabled:boolean)=>{if(!alive)return;if(mode.current!==null&&mode.current!==enabled){gesture.cancel('context');if(!callbacks.current.cancelDisabled&&!callbacks.current.hasResult)callbacks.current.onCancel();}mode.current=enabled;setScreenReader(enabled);observeGeometry();};
  void AccessibilityInfo.isScreenReaderEnabled().then(setMode,()=>{if(alive)setScreenReader(null);});
  const reader=AccessibilityInfo.addEventListener('screenReaderChanged',setMode);
  const app=AppState.addEventListener('change',value=>{if(value!=='active'){gesture.cancel('lifecycle');releaseAccepted.current=false;if(!callbacks.current.cancelDisabled&&!callbacks.current.hasResult)callbacks.current.onCancel();}});
  const timer=setInterval(()=>{gesture.pulse(monotonicNow(),Date.now());if(alive)publish();},40);
  return()=>{alive=false;clearInterval(timer);reader.remove();app.remove();gesture.cancel('context');releaseAccepted.current=false;};
 },[gesture]);
 useEffect(()=>{if(state.phase!=='consumed'||delivered.current)return;const timer=setTimeout(()=>{if(!delivered.current)setUndelivered(true);},0);return()=>clearTimeout(timer);},[state.phase]);
 const terminal=state.phase==='consumed'||state.phase==='cancelled';
 const unavailable=disabled||cancelDisabled||hasResult||terminal||screenReader===null||!state.readEnd;
 const start=(event:GestureResponderEvent)=>{releaseAccepted.current=false;if(screenReader!==false||unavailable)return;gesture.startHold(monotonicNow(),Date.now(),event.nativeEvent.timestamp);publish();};
 const release=(event:GestureResponderEvent)=>{if(screenReader!==false)return;releaseAccepted.current=gesture.releaseHold(monotonicNow(),Date.now(),event.nativeEvent.timestamp);publish();};
 const activate=()=>{
  if(callbacks.current.disabled||callbacks.current.cancelDisabled||callbacks.current.hasResult||screenReader===null)return;
  if(screenReader){if(gesture.accessibleActivate(monotonicNow(),Date.now()))confirmOnce();publish();}
  else if(releaseAccepted.current){releaseAccepted.current=false;if(gesture.snapshot().phase==='consumed')confirmOnce();}
 };
 const scroll=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{geometry.current.offset=event.nativeEvent.contentOffset.y;observeGeometry();};
 const targetLayout=(event:LayoutChangeEvent)=>{geometry.current.targetEnd=event.nativeEvent.layout.y+event.nativeEvent.layout.height;observeGeometry();};
 const endLayout=(event:LayoutChangeEvent)=>{geometry.current.contentEnd=event.nativeEvent.layout.y+event.nativeEvent.layout.height;observeGeometry();};
 const buttonText=state.phase==='ready'?t('confirm.ready'):holdLabel??(screenReader?(confirmLabel??t('confirm.send')):t('send.hold'));
 const Shell=embedded?View:Modal;
 return <Shell {...(embedded?{style:{flex:1}}:{visible,onDismiss,transparent:deck,animationType:'slide' as const,presentationStyle:deck?'overFullScreen' as const:'fullScreen' as const,onRequestClose:cancel})}>
  <SafeAreaProvider style={{flex:1,backgroundColor:deck?'transparent':undefined}}><SafeAreaView edges={deck?['left','right']:undefined} style={deck?CS.overlay:S.screen} accessibilityViewIsModal>
   <View style={deck?CS.sheet:{flex:1}} testID={deck?'deck-confirm-sheet':undefined}>
   {deck?<View accessible={false} style={CS.grip}/>:null}
   <ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={deck?CS.scroll:[S.container,{gap:16}]} onLayout={event=>{geometry.current.viewport=event.nativeEvent.layout.height;observeGeometry();}} onScroll={scroll} scrollEventThrottle={16}>
    {header?header(state):<Text testID={`deck-confirm-state-${state.phase}-${state.cancellationReason??'none'}-${state.maxGapMs}`} accessibilityState={{busy:cancelDisabled,disabled:disabled}} accessibilityValue={{text:!hasResult&&!cancelDisabled&&state.phase==='cancelled'?t('confirm.interrupted'):title??t('confirm.title')}} maxFontSizeMultiplier={deck?1.5:undefined} style={deck?CS.heading:S.heading} accessibilityRole="header">{title??t('confirm.title')}</Text>}
    <View onLayout={targetLayout}>
     {identity}
     {!hasResult&&screenReader?<Pressable android_disableSound accessibilityRole="checkbox" accessibilityState={{checked:targetReviewed}} style={[deck?CS.cancel:S.secondary,{minHeight:48,marginTop:12}]} onPress={()=>{reviewedTarget.current=true;setTargetReviewed(true);}}><Text maxFontSizeMultiplier={1.5} style={deck?CS.cancelText:S.secondaryText}>{t('confirm.reviewTarget')}</Text></Pressable>:null}
    </View>
    {hasResult&&!hideResultLabel?<Text selectable testID="deck-confirm-result" accessibilityRole="alert" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.5} style={deck?CS.hint:S.noticeText}>{resultLabel}</Text>:null}
    {!hasResult||deck?<>
    {!deck?<Text style={S.footer}>{t('field.source')}: {sourceLabel}{characterCount===undefined?'':` · ${characterCount===1?t('count.chars.one',{n:characterCount}):t('count.chars.other',{n:characterCount})}`}</Text>:null}
    {content}
    <View collapsable={false} style={deck?{minHeight:1}:undefined} onLayout={endLayout}>
     {!hasResult&&screenReader?<Pressable android_disableSound accessibilityRole="checkbox" accessibilityState={{checked:state.readEnd,disabled:!targetReviewed}} disabled={!targetReviewed} style={[deck?CS.cancel:S.secondary,{minHeight:48,opacity:targetReviewed?1:0.45}]} onPress={()=>{if(reviewedTarget.current){gesture.setReadEnd(true);publish();}}}><Text maxFontSizeMultiplier={1.5} style={deck?CS.cancelText:S.secondaryText}>{t('confirm.reviewContent')}</Text></Pressable>:null}
     {!deck?<Text style={S.footer}>{explanation??t('confirm.genericExplanation')}</Text>:null}
    </View>
    </>:null}
   </ScrollView>
   <SafeAreaView edges={deck?['bottom']:[]} style={deck?CS.footer:{padding:18,gap:10}}>
    {!hasResult&&cancelDisabled?<Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.5} style={deck?CS.hint:S.noticeText}>{processingLabel??t('confirm.processing')}</Text>:null}
    {!hasResult&&!cancelDisabled?<>
     {state.phase==='cancelled'?<Text maxFontSizeMultiplier={1.5} style={deck?CS.notice:S.noticeText}>{t('confirm.interrupted')}</Text>:!state.readEnd?<Text maxFontSizeMultiplier={1.5} style={deck?CS.hint:S.noticeText}>{t('confirm.readFirst')}</Text>:null}
     {undelivered?<Text accessibilityRole="alert" maxFontSizeMultiplier={1.5} style={deck?CS.notice:S.noticeText}>{t('confirm.releaseInside')}</Text>:null}
     {beforeConfirmNotice?<Text testID="deck-confirm-playback-unavailable" accessibilityRole="alert" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.5} style={deck?CS.notice:S.noticeText}>{beforeConfirmNotice}</Text>:null}
    </>:null}
    <View style={deck?CS.actions:{gap:10}}>
    {deck&&!hasResult?<Pressable android_disableSound testID="deck-confirm-cancel" disabled={cancelDisabled} accessibilityState={{disabled:cancelDisabled}} accessibilityRole="button" style={[CS.cancel,{opacity:cancelDisabled?0.45:1}]} onPress={cancel}><View style={CS.buttonContent}><View accessible={false} style={CS.icon}><View style={[CS.iconLine,{left:3,top:13,width:22,backgroundColor:'#E6FFF6',transform:[{rotate:'45deg'}]}]}/><View style={[CS.iconLine,{left:3,top:13,width:22,backgroundColor:'#E6FFF6',transform:[{rotate:'-45deg'}]}]}/></View><Text maxFontSizeMultiplier={1.5} style={CS.cancelText}>{deckCancelLabel??t('send.cancel')}</Text></View></Pressable>:null}
    {!hasResult&&!cancelDisabled?<Pressable android_disableSound testID="deck-confirm-send" accessibilityRole="button" disabled={unavailable} accessibilityState={{disabled:unavailable}} accessibilityLabel={screenReader||holdLabel?buttonText:t('send.hold')} accessibilityHint={confirmAccessibilityHint??t('confirm.readFirst')} style={[deck?CS.hold:S.primary,{minHeight:48,opacity:unavailable?0.45:1}]} onPressIn={start} onPressOut={release} onPress={activate} onTouchCancel={()=>{gesture.cancel('touch-cancel');releaseAccepted.current=false;publish();}}>
     {deck?<View pointerEvents="none" style={[CS.holdProgress,{width:`${state.phase==='holding'?Math.min(100,state.holdMs/8):0}%`}]}/>:null}
     {deck?<View style={CS.buttonContent}><View accessible={false} style={CS.icon}><View style={[CS.iconLine,{left:1,top:13,width:24,backgroundColor:'#111820'}]}/><View style={[CS.iconLine,{left:15,top:8,width:14,backgroundColor:'#111820',transform:[{rotate:'45deg'}]}]}/><View style={[CS.iconLine,{left:15,top:18,width:14,backgroundColor:'#111820',transform:[{rotate:'-45deg'}]}]}/></View><Text maxFontSizeMultiplier={1.5} style={CS.holdText}>{buttonText}</Text><Text maxFontSizeMultiplier={1.5} style={CS.buttonNumber}>0.8s</Text></View>:<Text maxFontSizeMultiplier={1.5} style={S.primaryText}>{buttonText}{state.phase==='holding'?` ${Math.min(0.8,state.holdMs/1000).toFixed(1)}/0.8s`:''}</Text>}
    </Pressable>:null}
    {!deck||hasResult?<Pressable android_disableSound testID="deck-confirm-cancel" disabled={cancelDisabled} accessibilityState={{disabled:cancelDisabled}} accessibilityRole="button" style={[deck?CS.cancel:S.secondary,{flex:deck?1:0,minHeight:48,opacity:cancelDisabled?0.45:1}]} onPress={cancel}><Text maxFontSizeMultiplier={1.5} style={deck?CS.cancelText:S.secondaryText}>{hasResult?t('common.close'):undelivered?t('confirm.reviewAgain'):cancelLabel??t('send.cancel')}</Text></Pressable>:null}
    </View>
   </SafeAreaView>
   </View>
  </SafeAreaView></SafeAreaProvider>
 </Shell>;
}
