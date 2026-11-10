import {useEffect,useRef,useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {DEFAULT_DECK_PHRASE,validDeckPhrase} from '../../core/phrase-command';
import {phrasePreferences,type PhraseSnapshot} from '../../adapters/phrase-preferences';
import {useMessages} from '../../i18n/provider';
import {CS} from '../theme';

/** Local settings only. This sheet has no host, target, pairing or send port. */
export function PhraseEditor({snapshot,onClose}:{snapshot:Readonly<PhraseSnapshot>;onClose:()=>void}){
 const {t}=useMessages();
 const [draft,setDraft]=useState(()=>({...snapshot.value})),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false);
 const busy=useRef(false),opened=useRef(true),drag=useRef<number|null>(null);
 useEffect(()=>()=>{opened.current=false;},[]);
 const close=()=>{if(busy.current||!opened.current)return;opened.current=false;Keyboard.dismiss();onClose();};
 const valid=validDeckPhrase(draft),ready=snapshot.phase==='ready';
 const save=async()=>{
  if(busy.current||!opened.current||!valid||!ready)return;
  busy.current=true;setSaving(true);setFailed(false);
  const ok=await phrasePreferences.save(draft);
  if(!opened.current)return;
  busy.current=false;setSaving(false);if(ok)close();else setFailed(true);
 };
 const inputStyle={color:'#F3FCF8',fontSize:18,fontWeight:'700' as const,textAlignVertical:'top' as const,padding:0};
 return <Modal transparent visible animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}>
  <SafeAreaProvider style={{flex:1}}><KeyboardAvoidingView style={CS.overlay} behavior={Platform.OS==='ios'?'padding':undefined}>
   <Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} style={{position:'absolute',left:0,top:0,right:0,bottom:0}}/>
   <SafeAreaView edges={['bottom']} accessibilityViewIsModal onAccessibilityEscape={close} style={[CS.sheet,{flex:0,maxHeight:'90%'}]} testID="deck-phrase-editor">
    <View onStartShouldSetResponder={()=>true} onResponderGrant={event=>{drag.current=event.nativeEvent.pageY;}} onResponderRelease={event=>{if(drag.current!==null&&event.nativeEvent.pageY-drag.current>45)close();drag.current=null;}} onResponderTerminate={()=>{drag.current=null;}} style={{paddingBottom:6,paddingTop:2}}><View style={CS.grip}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} contentContainerStyle={[CS.scroll,{gap:16,padding:20,paddingBottom:24}]}>
     <Text maxFontSizeMultiplier={1.5} accessibilityRole="header" style={CS.heading}>{t('phrase.title')}</Text>
     <Text maxFontSizeMultiplier={1.5} style={CS.hint}>{t('phrase.help')}</Text>
     <Text maxFontSizeMultiplier={1.5} style={CS.label}>{t('phrase.name')}</Text>
     <View style={CS.card}><TextInput maxFontSizeMultiplier={1.5} testID="deck-phrase-name" accessibilityLabel={t('phrase.name')} editable={!saving} value={draft.name} onChangeText={name=>{if(Array.from(name).length<=6)setDraft(value=>({...value,name}));}} style={inputStyle}/><Text maxFontSizeMultiplier={1.5} style={[CS.label,{alignSelf:'flex-end'}]}>{t('phrase.nameCount',{n:Array.from(draft.name).length})}</Text></View>
     <Text maxFontSizeMultiplier={1.5} style={CS.label}>{t('phrase.text')}</Text>
     <View style={CS.card}><TextInput maxFontSizeMultiplier={1.5} testID="deck-phrase-text" accessibilityLabel={t('phrase.text')} editable={!saving} multiline maxLength={32768} value={draft.text} onChangeText={text=>setDraft(value=>({...value,text}))} style={[inputStyle,{minHeight:90}]}/><Text maxFontSizeMultiplier={1.5} style={[CS.label,{alignSelf:'flex-end'}]}>{t('phrase.characters',{n:draft.text.length})}</Text></View>
     {!valid?<Text maxFontSizeMultiplier={1.5} accessibilityRole="alert" style={CS.hint}>{t('phrase.invalid')}</Text>:null}
     {failed||snapshot.error?<View style={{gap:8}}><Text maxFontSizeMultiplier={1.5} accessibilityRole="alert" style={CS.hint}>{t('phrase.storage')}</Text>{snapshot.phase==='blocked'?<Pressable android_disableSound accessibilityRole="button" onPress={()=>{void phrasePreferences.retry();}}><Text maxFontSizeMultiplier={1.5} style={CS.label}>{t('common.retry')}</Text></Pressable>:null}</View>:null}
     <View style={{flexDirection:'row',gap:10}}>
      <Pressable android_disableSound testID="deck-phrase-defaults" accessibilityRole="button" disabled={saving} accessibilityState={{disabled:saving}} onPress={()=>setDraft({...DEFAULT_DECK_PHRASE})} style={[CS.cancel,{flex:1,minHeight:64,justifyContent:'center'}]}><Text maxFontSizeMultiplier={1.5} style={CS.cancelText}>{t('phrase.defaults')}</Text></Pressable>
      <Pressable android_disableSound testID="deck-phrase-save" accessibilityRole="button" disabled={!valid||!ready||saving} accessibilityState={{disabled:!valid||!ready||saving,busy:saving}} onPress={()=>{void save();}} style={[CS.hold,{flex:1,minHeight:64,justifyContent:'center',opacity:valid&&ready&&!saving?1:.45}]}><Text maxFontSizeMultiplier={1.5} style={CS.holdText}>{t('phrase.save')}</Text></Pressable>
     </View>
     <Text maxFontSizeMultiplier={1.5} style={[CS.hint,{fontSize:13}]}>{t('phrase.closeHint')}</Text>
    </ScrollView>
   </SafeAreaView>
  </KeyboardAvoidingView></SafeAreaProvider>
 </Modal>;
}
