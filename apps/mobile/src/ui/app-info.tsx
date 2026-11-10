import {CommandKey,useSheetSkin} from './deck/sheet-controls';
import { useMessages } from '../i18n/provider';
import {useState} from 'react';
import {Image,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import appConfig from '../../app.json';
import {S} from './theme';

const sections=[
 ['info.0.title','info.0.body'],
 ['info.1.title','info.1.body'],
 ['info.2.title','info.2.body'],
 ['info.3.title','info.3.body'],
 ['info.4.title','info.4.body'],
 ['info.5.title','info.5.body'],
 ['info.6.title','info.6.body'],
] as const;

const orcaMit=`MIT License

Copyright (c) 2026 Lovecast Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** Local disclosure only: no transport, storage, permission or action dependency. */
export function AppInfoButton(){
 const {t} = useMessages();const physical=useSheetSkin();
 const [visible,setVisible]=useState(false);
 return <>
  {physical?<CommandKey symbol="ⓘ" testID="deck-app-info" label={t('info.open')} onPress={()=>setVisible(true)}><Text allowFontScaling maxFontSizeMultiplier={1.5} style={S.secondaryText}>{t('status.guide')}</Text></CommandKey>:(<Pressable android_disableSound testID="deck-app-info" accessibilityRole="button" accessibilityLabel={t('info.open')} style={[S.secondary,{flex:0,paddingHorizontal:14}]} onPress={()=>setVisible(true)}><Text style={S.secondaryText}>{t('status.guide')}</Text></Pressable>)}

  <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>setVisible(false)}>
   <SafeAreaProvider style={S.screen}><SafeAreaView testID="deck-app-info-screen" style={S.screen}>
    <ScrollView contentContainerStyle={[S.container,{paddingTop:32}]}>
     <Image testID="deck-app-info-logo" accessible={false} source={require('../../assets/branding/orca-deck-logo.png')} resizeMode="contain" style={{width:128,height:128,alignSelf:'center'}}/>
     <Text accessibilityRole="header" style={S.detailTitle}>{t('info.title')}</Text>
     <Text selectable style={S.desc}>{t('info.build',{version:appConfig.expo.version})}</Text>
     {sections.map(([title,body])=><View key={title} style={S.detail}><Text accessibilityRole="header" style={S.heading}>{t(title)}</Text><Text selectable style={S.desc}>{t(body)}</Text></View>)}
     <Text accessibilityRole="header" style={S.heading}>Orca MIT License</Text><Text selectable style={S.noticeText}>{orcaMit}</Text>
    </ScrollView>
    <View style={{paddingHorizontal:18,paddingTop:12,paddingBottom:32}}><Pressable android_disableSound testID="deck-app-info-close" accessibilityRole="button" accessibilityLabel={t('info.close')} style={S.primary} onPress={()=>setVisible(false)}><Text style={S.primaryText}>{t('common.close')}</Text></Pressable></View>
   </SafeAreaView></SafeAreaProvider>
  </Modal>
 </>;
}
