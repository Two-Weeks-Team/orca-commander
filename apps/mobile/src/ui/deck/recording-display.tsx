import {View} from 'react-native';
import type {VoiceDisplay} from '../../adapters/host-dictation';
import {DeckText} from './deck-text';
import {DECK_NUMERAL_FONT} from '../deck-fonts';
export function recordingTime(ms:number){const seconds=Math.floor(Math.max(0,Number.isFinite(ms)?ms:0)/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
// Presentation-only waveform. It scales the current level, retaining no audio samples.
const WAVE=[.2,.45,.7,.35,1,.55,.25,.6,.4,.85,.3,.15,.55,.25,.95,.45,.2,.65,.35,.8,.25,.5,1,.45,.2,.7,.35,.6,.25,.9];
/** Display-only overlay on existing deck LCD parts. It owns no microphone, model, TTS or send port. */
export function RecordingDisplay({label,projectPath,statusNotice=false,text,phase,elapsedMs,level,position,counts,link,age,scale}:{label:string;projectPath?:string;statusNotice?:boolean;text:string;phase:VoiceDisplay['phase'];elapsedMs:number;level:number;position:string;counts:{attention:number;working:number;done:number;unknown:number}|null;link:string;age:string;scale:number}){
 const num={fontFamily:DECK_NUMERAL_FONT,fontWeight:'normal' as const},font=(size:number)=>({fontSize:size*scale,color:'#A6F5D8'}),volume=Math.max(0,Math.min(1,Number.isFinite(level)?level:0));
 return <View pointerEvents="none" testID="deck-voice-display" style={{flex:1,minHeight:0,gap:3*scale,padding:4*scale,justifyContent:'space-between'}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}><DeckText testID="deck-recording-status" numberOfLines={1} accessibilityLiveRegion="polite" accessibilityLabel={label} style={[font(12),{flex:1,fontWeight:'700'}]}>{statusNotice||phase!=='recording'?label:projectPath||'—'}</DeckText><DeckText style={[font(18),num]}>{position}</DeckText></View>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}><DeckText style={[font(12),{color:'#FF7A8A'}]}>{phase==='recording'?'● REC':''}</DeckText><DeckText style={[font(22),num]}>{recordingTime(elapsedMs)}</DeckText><View testID="deck-voice-level" accessible={false} style={{flex:1,flexDirection:'row',alignItems:'flex-end',gap:2*scale,height:24*scale}}>{WAVE.map((amplitude,i)=><View testID={'deck-recording-tick-'+i} key={i} style={{flex:1,height:Math.max(2,(3+volume*21*amplitude))*scale,borderRadius:scale,backgroundColor:'#A6F5D8'}}/>)}</View></View>
  <DeckText testID="deck-recording-transcript" numberOfLines={1} ellipsizeMode="head" style={font(12)}>{text}</DeckText>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4,borderTopWidth:1,borderTopColor:'#315346',paddingTop:2*scale}}><DeckText style={[font(15),num]}><DeckText style={{color:'#FF8A3D'}}>▲{counts?.attention??'—'} </DeckText><DeckText style={{color:'#F0B100'}}>●{counts?.working??'—'} </DeckText><DeckText style={{color:'#00BC7D'}}>✓{counts?.done??'—'} </DeckText><DeckText style={{color:'#F5B451'}}> ?{counts?.unknown??'—'}</DeckText></DeckText><DeckText style={[font(12),num]}>● {link} {age}</DeckText></View>
 </View>;
}
