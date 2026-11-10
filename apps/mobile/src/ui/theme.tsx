import {DECK_NUMERAL_FONT} from './deck-fonts';
import type { MessageKey } from '../i18n/en';
import type { Translator } from '../i18n/messages';
import { StyleSheet, Text, View } from 'react-native';
import type { AgentSnapshot } from '../core/types';

export const C = { bg:'#111827',panel:'#1F2937',border:'#374151',white:'#F9FAFB',muted:'#CBD5E1',
  yellow:'#FBBF24',blue:'#93C5FD',green:'#4ADE80',red:'#FB7185' };
const stateKeys = {
 working:'state.working', permission:'state.permissionSignal', question:'state.question', failed:'state.failed',
 review:'state.review', done:'state.done', idle:'state.idle', unknown:'common.unconfirmedValue'
} as const satisfies Record<AgentSnapshot['state'], MessageKey>;
export const stateName = (state:AgentSnapshot['state'], t:Translator) => t(stateKeys[state]);
export const color = (s:AgentSnapshot['state']) => s==='failed'?C.red :
  s==='permission'||s==='question'?C.yellow:s==='done'?C.green:s==='working'?C.blue:C.muted;

export function Metric({label,value,tint}:{label:string;value:number|string;tint:string}) {
  return <View style={S.metric}><Text style={[S.metricNum,{color:tint}]}>{value}</Text>
    <Text style={S.metricLabel}>{label}</Text></View>;
}

export const S=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.bg},
  container:{paddingHorizontal:18,paddingTop:32,paddingBottom:48,gap:14},
  brand:{color:C.white,fontSize:28,fontWeight:'800',letterSpacing:2},
  sub:{color:C.muted,fontSize:14,marginTop:-7},
  banner:{borderRadius:12,borderWidth:1,borderColor:'#8B5E18',padding:12,backgroundColor:'#413114'},
  bannerText:{color:'#FDE68A',fontSize:13,fontWeight:'700',textAlign:'center'},
  stats:{flexDirection:'row',gap:9},
  metric:{flex:1,borderRadius:13,backgroundColor:C.panel,paddingVertical:13,alignItems:'center',gap:3},
  metricNum:{fontSize:28,fontWeight:'800'},
  metricLabel:{fontSize:12,color:C.muted},
  heading:{color:C.white,fontSize:18,fontWeight:'700',marginTop:7},
  queueItem:{backgroundColor:C.panel,borderRadius:14,borderWidth:1,borderColor:C.border,padding:14,gap:5,minHeight:82},
  selected:{borderColor:C.yellow,borderWidth:2},
  rowSpread:{flexDirection:'row',justifyContent:'space-between'},
  provider:{color:C.muted,fontSize:12,fontWeight:'700'},
  status:{fontSize:12,fontWeight:'800'},
  itemTitle:{color:C.white,fontSize:17,fontWeight:'700'},
  detail:{padding:17,borderRadius:17,borderColor:C.border,borderWidth:1,backgroundColor:C.panel,gap:14},
  detailTitle:{color:C.white,fontSize:23,fontWeight:'800',lineHeight:30},
  desc:{color:C.muted,fontSize:16,lineHeight:24},
  notice:{backgroundColor:'#364152',padding:12,borderRadius:10},
  noticeText:{color:C.muted,fontSize:13,lineHeight:20},
  primary:{borderRadius:12,backgroundColor:'#E5E7EB',padding:17,alignItems:'center',minHeight:52},
  primaryText:{color:C.bg,fontSize:16,fontWeight:'800'},
  actions:{flexDirection:'row',gap:10},
  secondary:{flex:1,alignItems:'center',justifyContent:'center',minHeight:50,borderRadius:12,borderWidth:1,borderColor:'#64748B'},
  secondaryText:{color:C.white,fontSize:16,fontWeight:'700'},
  footer:{color:'#94A3B8',fontSize:12,lineHeight:18,marginTop:10}
});

/** Approved SheetConfirm palette. Localized text keeps the system face and its 1.5 ceiling. */
export const CS=StyleSheet.create({
 overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.68)',justifyContent:'flex-end',alignItems:'center'},
 sheet:{width:'100%',maxWidth:700,maxHeight:'90%',flex:1,backgroundColor:'#0B1511',borderColor:'#31584A',borderWidth:1,borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},
 grip:{width:44,height:5,borderRadius:3,backgroundColor:'#315346',alignSelf:'center',marginTop:12,marginBottom:6},
 scroll:{padding:16,gap:12,paddingBottom:8,flexGrow:1},
 header:{gap:12,padding:4,paddingBottom:4},
 row:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},
 heading:{color:'#E6FFF6',fontSize:28,fontWeight:'800',flexShrink:1},
 hint:{color:'#86A99C',fontSize:15,lineHeight:23},
 amber:{color:'#FFC24D'},
 number:{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontSize:76,color:'#E6FFF6',fontVariant:['tabular-nums'],includeFontPadding:false},
 total:{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontSize:24,color:'#75988A',includeFontPadding:false},
 chip:{borderRadius:18,borderWidth:1,borderColor:'#31584A',paddingHorizontal:12,paddingVertical:6},
 chipText:{color:'#91E5BD',fontSize:13,fontWeight:'800'},
 meterRow:{width:'100%',flexDirection:'column',alignItems:'stretch',gap:12},
 meterRowWide:{flexDirection:'row',alignItems:'center'},
 meterSlot:{width:'100%'},
 meterSlotWide:{flex:1,width:'auto'},
 track:{width:'100%',aspectRatio:360/22,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},
 segment:{width:'1.666667%',height:'100%',borderRadius:3,backgroundColor:'#203D31'},
 card:{borderRadius:18,borderColor:'#254C3D',borderWidth:1,backgroundColor:'#0E1C16',padding:14,gap:10},
 provider:{backgroundColor:'#1C382D',borderRadius:14,paddingHorizontal:10,paddingVertical:5},
 providerText:{color:'#E6FFF6',fontSize:13,fontWeight:'800'},
 title:{color:'#E6FFF6',fontSize:18,fontWeight:'800',flexShrink:1,textDecorationLine:'none'},
 metaRow:{flexDirection:'row',alignItems:'flex-start',gap:12},
 metaLabel:{width:76,flexShrink:0,color:'#6FA897',fontSize:12,fontWeight:'800',letterSpacing:0.8,lineHeight:20,textDecorationLine:'none'},
 label:{color:'#6FA897',fontSize:14,fontWeight:'800',textDecorationLine:'none'},
 value:{color:'#DDECE5',fontSize:15,lineHeight:22,flexShrink:1,textDecorationLine:'none'},
 body:{color:'#F3FCF8',fontSize:22,fontWeight:'700',lineHeight:33},
 bodyCard:{minHeight:180,flexGrow:1},
 bodyCount:{color:'#E6FFF6',fontSize:22,fontWeight:'800'},
 bodyCountNumber:{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontSize:28,color:'#E6FFF6',includeFontPadding:false},
 bodyPage:{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontSize:24,color:'#6FA897',includeFontPadding:false},
 footer:{padding:16,gap:10},
 actions:{flexDirection:'row',gap:10,alignItems:'stretch'},
 hold:{flex:2.3,minHeight:72,borderRadius:20,backgroundColor:'#E4ECF8',borderWidth:1,borderColor:'#F3F7FF',overflow:'hidden',alignItems:'center',justifyContent:'center',padding:12,boxShadow:[{offsetX:0,offsetY:1,color:'rgba(255,255,255,0.6)',inset:true},{offsetX:0,offsetY:-6,color:'rgba(0,0,0,0.18)',inset:true},{offsetX:0,offsetY:3,color:'#04060A'}]},
 holdProgress:{position:'absolute',left:0,top:0,bottom:0,backgroundColor:'#9DB6D8'},
 buttonContent:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap',maxWidth:'100%'},
 holdText:{color:'#111820',fontSize:18,fontWeight:'800',textAlign:'center',flexShrink:1},
 buttonNumber:{fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal',fontSize:28,color:'#111820',includeFontPadding:false},
 cancel:{flex:1,minHeight:72,borderRadius:20,borderWidth:1,borderColor:'#455466',backgroundColor:'#252E38',alignItems:'center',justifyContent:'center',padding:12,boxShadow:[{offsetX:0,offsetY:1,color:'rgba(255,255,255,0.14)',inset:true},{offsetX:0,offsetY:-6,color:'rgba(0,0,0,0.35)',inset:true},{offsetX:0,offsetY:3,color:'#04060A'}]},
 cancelText:{color:'#E6FFF6',fontSize:18,fontWeight:'800',textAlign:'center'},
 icon:{width:28,height:28,flexShrink:0},
 iconLine:{position:'absolute',height:3,borderRadius:2},
 statusCircle:{width:32,height:32,borderRadius:16,borderWidth:2,borderColor:'#FFC24D',alignItems:'center',justifyContent:'center'},
 statusQuestion:{color:'#FFC24D',fontSize:16,fontWeight:'800',lineHeight:20},
 statusBang:{color:'#FFC24D',fontSize:32,fontWeight:'800'},
 notice:{color:'#FFC24D',fontSize:13,lineHeight:20},
});
