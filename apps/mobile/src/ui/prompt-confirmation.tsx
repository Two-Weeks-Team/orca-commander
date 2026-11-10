import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {ActionStatus,PromptConfirmation} from '../adapters/action-client';
import {useMessages} from '../i18n/provider';
import {ConfirmPanel,type ConfirmPanelHeaderState} from './confirmation-panel';
import {CS} from './theme';

export interface PromptTargetLabels {readonly provider:string;readonly project:string;readonly worktree:string;readonly host:string}
export type PromptVoiceStage='idle'|'speaking'|'preparing'|'listening'|'transcribing';
interface Props {
 confirmation?:PromptConfirmation;visible?:boolean;onDismiss?:()=>void;disabled:boolean;onConfirm:()=>void;onCancel:()=>void;
 origin?:'typed'|'voice';target?:PromptTargetLabels;voicePromptUnavailable?:boolean;
 voiceStage?:PromptVoiceStage;listeningRemainingMs?:number;resultLabel?:string;resultStatus?:ActionStatus;
 cancelDisabled?:boolean;readReply?:boolean;processingLabel?:string;
}
/** Decorative reading activity, not measured audio volume. Geometry follows the board's 6:22 ticks. */
export function ConfirmationMeter({mode,fraction=1}:{mode:'reading'|'listening';fraction?:number}){
 const wave=[.4,.72,.55,.94,.67,.82,.46,.76,.58,1,.51,.85,.64,.9,.43,.7,.98,.62,.8,.52,.92,.68,.48,.86,.57,.96,.73,.45,.83,.6];
 const fill=Number.isFinite(fraction)?Math.max(0,Math.min(1,fraction)):0;
 return <View testID={mode==='reading'?'deck-confirm-reading-wave':`deck-confirm-${mode}-meter`} accessible={false} style={CS.track}>
  {Array.from({length:30},(_,i)=><View key={i} style={[CS.segment,{height:`${mode==='reading'?wave[i]*100:100}%`,backgroundColor:mode==='reading'?'#74E0A0':i<fill*30?mode==='listening'?'#FFC24D':'#91E5BD':'#203D31'}]}/>)}
 </View>;
}
/** Labels are captured beside the original ticket, never resolved back into target authority. */
export function PromptConfirmationDialog({confirmation,visible=true,onDismiss,disabled,onConfirm,onCancel,origin='typed',target,voicePromptUnavailable=false,voiceStage='idle',listeningRemainingMs=3500,resultLabel,resultStatus,cancelDisabled=false,readReply=false,processingLabel}:Props){
 const {t,locale}=useMessages();
 const [headerWidth,setHeaderWidth]=useState(0),wide=headerWidth>=600;
 if(!confirmation)return null;
 const scope=JSON.stringify([confirmation,locale,origin]);
 const uncertain=resultStatus==='unknown'||resultStatus==='partial';
 const settled=resultLabel!==undefined,accepted=resultStatus==='accepted';
 const stage=accepted?'sent':uncertain?'unknown':settled?'result':cancelDisabled?'sending':voicePromptUnavailable?'unavailable':voiceStage;
 const title=accepted?t('confirmSheet.sent'):uncertain?t('confirmSheet.unknown'):settled?t('history.results'):cancelDisabled?t('input.sending'):voicePromptUnavailable?t('confirmSheet.unavailable'):voiceStage==='speaking'?t('confirmSheet.reading'):voiceStage==='preparing'?t('confirmSheet.preparing'):voiceStage==='listening'?t('confirmSheet.listening'):voiceStage==='transcribing'?t('confirmSheet.transcribing'):t('confirmSheet.review');
 const hint=accepted?(readReply?t('confirmSheet.replyHint'):undefined):uncertain?t('confirmSheet.unknownHint'):settled?resultLabel:voiceStage==='speaking'?t('confirmSheet.readingHint'):voiceStage==='listening'?t('confirmSheet.listeningHint'):undefined;
 const remainingListen=Math.max(0,Math.min(3500,listeningRemainingMs));
 const header=(state:ConfirmPanelHeaderState)=><View testID={`deck-confirm-stage-${stage}`} style={CS.header} onLayout={event=>setHeaderWidth(event.nativeEvent.layout.width)}>
  <View style={[CS.row,{justifyContent:'space-between'}]}>
   <View style={[CS.row,{flex:1}]}>
    {stage==='speaking'?<View accessible={false} style={{width:28,height:28}}><View style={{position:'absolute',left:0,top:10,width:6,height:8,backgroundColor:'#74E0A0'}}/><View style={{position:'absolute',left:5,top:4,borderTopWidth:10,borderBottomWidth:10,borderRightWidth:11,borderTopColor:'transparent',borderBottomColor:'transparent',borderRightColor:'#74E0A0'}}/><View style={{position:'absolute',right:0,top:4,width:9,height:20,borderRightWidth:2,borderColor:'#74E0A0',borderRadius:10}}/></View>:stage==='listening'?<View accessible={false} style={{width:28,height:32}}><View style={{position:'absolute',left:9,top:0,width:10,height:18,borderWidth:2,borderColor:'#FFC24D',borderRadius:7}}/><View style={{position:'absolute',left:4,top:7,width:20,height:18,borderWidth:2,borderTopWidth:0,borderColor:'#FFC24D',borderRadius:9}}/><View style={{position:'absolute',left:12,top:24,width:3,height:7,backgroundColor:'#FFC24D'}}/></View>:stage==='unknown'?<View testID="deck-confirm-unknown-icon" accessible={false} style={CS.statusCircle}><Text accessible={false} maxFontSizeMultiplier={1.5} style={CS.statusQuestion}>?</Text></View>:stage==='unavailable'?<Text accessible={false} maxFontSizeMultiplier={1.5} style={CS.statusBang}>!</Text>:stage==='sent'?<View accessible={false} style={CS.icon}><View style={[CS.iconLine,{left:2,top:17,width:12,backgroundColor:'#91E5BD',transform:[{rotate:'45deg'}]}]}/><View style={[CS.iconLine,{left:9,top:13,width:24,backgroundColor:'#91E5BD',transform:[{rotate:'-45deg'}]}]}/></View>:null}
    <Text testID={`deck-confirm-state-${state.phase}-${state.cancellationReason??'none'}-${state.maxGapMs}`} accessibilityState={{busy:cancelDisabled,disabled}} accessibilityValue={{text:!settled&&!cancelDisabled&&state.phase==='cancelled'?t('confirm.interrupted'):title}} maxFontSizeMultiplier={1.5} accessibilityRole="header" accessibilityLiveRegion="polite" style={CS.heading}>{title}</Text>
    {stage==='listening'?<View style={[CS.row,{alignItems:'baseline',gap:6}]}><Text testID="deck-confirm-countdown" maxFontSizeMultiplier={1.5} style={CS.number}>{Math.min(3,Math.ceil(remainingListen/1000))}</Text><Text maxFontSizeMultiplier={1.5} style={CS.total}>/3.5s</Text></View>:null}
   </View>
   <View style={CS.chip}><Text maxFontSizeMultiplier={1.5} style={CS.chipText}>{t(origin==='voice'?'send.voiceDraft':'confirm.typedDraft')}</Text></View>
  </View>
  {hint&&stage!=='listening'?<Text testID="deck-confirm-stage-hint" maxFontSizeMultiplier={1.5} style={CS.hint}>{hint}</Text>:null}
  {stage==='speaking'?<ConfirmationMeter mode="reading"/>:stage==='listening'?<View style={[CS.meterRow,wide&&CS.meterRowWide]}>
   <Text testID="deck-confirm-stage-hint" maxFontSizeMultiplier={1.5} style={[CS.hint,CS.amber,CS.meterSlot,wide&&CS.meterSlotWide]}>{hint}</Text><View style={[CS.meterSlot,wide&&CS.meterSlotWide]}><ConfirmationMeter mode="listening" fraction={remainingListen/3500}/></View>
  </View>:!settled&&!cancelDisabled&&(voicePromptUnavailable||voiceStage==='idle')?<Text maxFontSizeMultiplier={1.5} style={CS.hint}>{t('confirm.explanation')}</Text>:null}
 </View>;
 const fallback=t('common.unconfirmedValue');
 const identity=<View testID="deck-confirm-target-card" style={CS.card}>
  <View style={CS.row}><View style={CS.provider}><Text maxFontSizeMultiplier={1.5} style={CS.providerText}>{target?.provider??fallback}</Text></View><Text maxFontSizeMultiplier={1.5} style={CS.title}>{confirmation.title}</Text></View>
  <View style={CS.metaRow}><Text maxFontSizeMultiplier={1.5} style={CS.metaLabel}>{t('focus.project')}</Text><Text maxFontSizeMultiplier={1.5} style={[CS.value,{flex:1}]}>{target?.project??fallback}</Text></View>
  <View style={CS.metaRow}><Text maxFontSizeMultiplier={1.5} style={CS.metaLabel}>{t('field.worktree')}</Text><Text maxFontSizeMultiplier={1.5} style={[CS.value,{flex:1}]}>{target?.worktree??fallback}</Text></View>
  <View style={CS.metaRow}><Text maxFontSizeMultiplier={1.5} style={CS.metaLabel}>{t('field.host')}</Text><Text maxFontSizeMultiplier={1.5} style={[CS.value,{flex:1}]}>{target?.host??fallback} · {confirmation.hostVersion}</Text></View>
 </View>;
 const count=Array.from(confirmation.text).length,marker='\uFFF0',countParts=t(count===1?'count.chars.one':'count.chars.other',{n:marker}).split(marker);
 const content=<View style={[CS.card,CS.bodyCard]} testID="deck-confirm-body-card">
  <View style={[CS.row,{justifyContent:'space-between'}]}>
   <View style={[CS.row,{alignItems:'baseline',gap:8}]}><Text maxFontSizeMultiplier={1.5} style={CS.label}>{t('cmd.content')}</Text><Text maxFontSizeMultiplier={1.5} style={CS.bodyCount}>{countParts.map((part,i)=><Text key={i} maxFontSizeMultiplier={1.5}>{i>0?<Text maxFontSizeMultiplier={1.5} style={CS.bodyCountNumber}>{count}</Text>:null}{part}</Text>)}</Text><Text maxFontSizeMultiplier={1.5} style={CS.bodyPage}>1/1</Text></View>
   {!settled?<Pressable android_disableSound accessibilityRole="button" accessibilityLabel={t('confirm.edit')} onPress={onCancel} disabled={cancelDisabled} style={[CS.cancel,{flex:0,minHeight:48,minWidth:48,borderRadius:14}]}><Text maxFontSizeMultiplier={1.5} style={CS.cancelText}>✎</Text></Pressable>:null}
  </View>
  <Text maxFontSizeMultiplier={1.5} style={CS.body} testID="deck-confirm-full-body">{confirmation.text}</Text>
 </View>;
 return <ConfirmPanel processingLabel={processingLabel} visible={visible} onDismiss={onDismiss} deck hideResultLabel header={header} preparedAt={confirmation.preparedAt} scopeKey={scope} identity={identity} content={content} sourceLabel={t(origin==='voice'?'send.voiceDraft':'confirm.typedDraft')} characterCount={count} disabled={disabled} onConfirm={onConfirm} onCancel={onCancel} title={t('confirm.title')} cancelLabel={t('confirm.edit')} explanation={t('confirm.explanation')} confirmLabel={t('confirm.send')} confirmAccessibilityHint={t('confirm.sendLabel')} beforeConfirmNotice={voicePromptUnavailable&&!settled?t('voice.promptUnavailable'):undefined} cancelDisabled={cancelDisabled} resultLabel={uncertain?t('confirmSheet.unknownHint'):resultLabel}/>;
}
