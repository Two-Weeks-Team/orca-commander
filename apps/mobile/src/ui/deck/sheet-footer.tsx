import type {ComponentProps} from 'react';
import {View,type ViewProps} from 'react-native';
import {useMessages} from '../../i18n/provider';
import {CommandKey,SheetPTT,SheetText} from './sheet-controls';
/** The same reading-sheet controls and voice callbacks, with the approved physical key labels. */
export function DeckSheetFooter({kind,onSettings,onHistory,onContent,onClose,pttProps,onLayout}:{onLayout?:ViewProps['onLayout'];kind:'status'|'settings'|'list'|'content';onSettings():void;onHistory():void;onContent():void;onClose():void;pttProps:ComponentProps<typeof SheetPTT>}){
 const {t}=useMessages(),status=kind==='status'||kind==='settings',list=kind==='list';
 const command=(symbol:string,label:string,onPress:()=>void)=><CommandKey label={label} onPress={onPress} style={{flex:1,minHeight:56,padding:8}}><View style={{flexDirection:'row',gap:5,alignItems:'center',justifyContent:'center'}}><SheetText style={{fontSize:18,fontWeight:'800'}}>{symbol}</SheetText><SheetText style={{fontSize:12,fontWeight:'800',flexShrink:1}}>{label}</SheetText></View></CommandKey>;
 return <View onLayout={onLayout} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-around',gap:10,paddingTop:10}}>{status?command('⚙',t('set.title'),onSettings):list?command('▤',t('cmd.content'),onContent):null}<SheetPTT {...pttProps} label={t('ptt.talk')}/>{status?command('◷',t('status.history'),onHistory):list?command('✕',t('common.close'),onClose):null}</View>;
}
