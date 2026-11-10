import type {ReactNode} from 'react';
import {Keyboard,View,StyleSheet,useWindowDimensions} from 'react-native';
import {Image} from 'expo-image';
import {SafeAreaProvider,SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMessages} from '../../i18n/provider';
import {SheetHeader} from '../sheet-header';
import {S} from '../theme';
import {sheetParts} from './sheet-assets';
import {CommandKey,SheetText,SheetSkinContext} from './sheet-controls';
/** Native Modal ownership is unchanged. Only the three D30 reading sheets opt into the physical plate. */
export function DeckSheetFrame({children,physical,title,onClose,keyboardVisible,count}:{count?:number;children:ReactNode;physical:boolean;title:string;onClose():void;keyboardVisible:boolean}){
 const {t}=useMessages(),{width,height}=useWindowDimensions(),safe=useSafeAreaInsets();
 if(!physical)return <SafeAreaProvider style={S.screen}><SafeAreaView style={S.screen} accessibilityViewIsModal><SheetHeader testIDPrefix="deck-sheet" title={title} onClose={onClose}/>{children}</SafeAreaView></SafeAreaProvider>;
 return <SheetSkinContext.Provider value={true}><View testID="deck-sheet-backdrop" style={{flex:1,backgroundColor:'#0A0D12'}}><View style={{flex:1,backgroundColor:'rgba(0,0,0,0.68)',justifyContent:'flex-end',alignItems:'center'}} accessibilityViewIsModal><View style={{width:Math.min(700,width),height:Math.min(height-safe.top,height*0.9),paddingBottom:Math.max(16,safe.bottom),paddingHorizontal:14,paddingTop:12,gap:10}}>
  <Image cachePolicy="memory" testID="deck-sheet-metal" source={sheetParts['metal.png']} pointerEvents="none" accessible={false} contentFit="fill" style={StyleSheet.absoluteFill}/>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,minHeight:52}}><SheetText accessibilityRole="header" style={{fontSize:24,fontWeight:'800',flex:1}}>{title}{count===undefined?null:<SheetText style={{fontFamily:'BarlowCondensed-Bold',fontSize:40}}>{' '}{count}</SheetText>}</SheetText>{keyboardVisible?<CommandKey testID="deck-sheet-hide-keyboard" onPress={()=>Keyboard.dismiss()} label={t('input.hideKeyboard')}><SheetText>{t('input.hideKeyboard')}</SheetText></CommandKey>:null}<CommandKey testID="deck-sheet-close" label={t('common.close')} onPress={onClose} style={{width:48,minHeight:48,padding:6}}><SheetText style={{fontSize:24}}>×</SheetText></CommandKey></View>
  {children}
 </View></View></View></SheetSkinContext.Provider>;
}
