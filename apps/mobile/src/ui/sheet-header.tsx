import {useEffect,useState} from 'react';
import {Keyboard,Platform,Pressable,Text,View} from 'react-native';
import {useMessages} from '../i18n/provider';
import {S} from './theme';

/** True only while a software keyboard is actually shown. */
export function useKeyboardVisible(){
 const [visible,setVisible]=useState(()=>Keyboard.isVisible());
 useEffect(()=>{
  const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',()=>setVisible(true));
  const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>setVisible(false));
  return()=>{show.remove();hide.remove();};
 },[]);
 return visible;
}

/**
 * One fixed sheet header: a control row (keyboard dismissal only while a keyboard is shown, close
 * always at the top right) above a full-width title that may wrap. Controls never wrap under the
 * title, so their position does not depend on title length or text size.
 */
export function SheetHeader({title,onClose,testIDPrefix}:{title:string;onClose():void;testIDPrefix:string}){
 const {t}=useMessages();
 const keyboard=useKeyboardVisible();
 return <View style={{paddingHorizontal:18,paddingTop:10,paddingBottom:6,gap:6}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:48}}>
   {keyboard?<Pressable testID={`${testIDPrefix}-hide-keyboard`} android_disableSound={true} accessibilityRole="button" style={[S.secondary,{flex:0,flexShrink:1,maxWidth:'60%',minHeight:48,paddingHorizontal:14}]} onPress={()=>Keyboard.dismiss()}><Text style={S.secondaryText}>{t('input.hideKeyboard')}</Text></Pressable>:<View/>}
   <Pressable testID={`${testIDPrefix}-close`} android_disableSound={true} accessibilityRole="button" style={[S.secondary,{flex:0,flexShrink:1,maxWidth:'40%',minWidth:64,minHeight:48,paddingHorizontal:14}]} onPress={onClose}><Text style={S.secondaryText}>{t('common.close')}</Text></Pressable>
  </View>
  <Text accessibilityRole="header" style={S.heading}>{title}</Text>
 </View>;
}
