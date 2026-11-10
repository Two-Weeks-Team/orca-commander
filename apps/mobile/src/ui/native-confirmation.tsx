import {Text,View} from 'react-native';
import type {StructuredConfirmation,NativeReplyConfirmation} from '../adapters/structured-action-client';
import {useMessages} from '../i18n/provider';
import {ConfirmPanel} from './confirmation-panel';
import {S} from './theme';

export interface NativeConfirmationDialogProps {
 confirmation?:StructuredConfirmation|NativeReplyConfirmation;
 visible?:boolean;onDismiss?:()=>void;disabled:boolean;onConfirm():void;onCancel():void;presentationKey?:string;resultLabel?:string;cancelDisabled?:boolean;
}
const isReply=(value:StructuredConfirmation|NativeReplyConfirmation):value is NativeReplyConfirmation=>'kind' in value&&value.kind==='async_reply';
/** Original native tickets remain with the caller. This wrapper performs no client calls or target joins. */
export function NativeConfirmationDialog({confirmation,visible=true,onDismiss,disabled,onConfirm,onCancel,presentationKey,resultLabel,cancelDisabled}:NativeConfirmationDialogProps){
 const {t,locale}=useMessages();
 if(!confirmation)return null;
 const entry=confirmation.entry,reply=isReply(confirmation);
 const scope=JSON.stringify([confirmation,presentationKey,locale]);
 const date=new Date(confirmation.preparedAt),time=Number.isFinite(date.getTime())?date.toISOString():String(confirmation.preparedAt);
 const provenance=t('native.provenance',{host:entry.hostId,version:entry.hostVersion,worktree:entry.target.worktreeId,tab:entry.target.tabId,session:entry.target.sessionId,provider:entry.target.agent});
 const identity=<View style={{gap:12}}>
  <Text selectable style={S.itemTitle}>{entry.target.title}</Text>
  <Text selectable style={S.noticeText}>{provenance}</Text>
  <Text selectable style={S.noticeText}>{t('field.generation')}: {entry.generation}</Text>
  <Text selectable style={S.noticeText}>{JSON.stringify({operationId:confirmation.operationId,fence:entry.fence,marker:entry.marker,preparedAt:confirmation.preparedAt},null,2)}</Text>
  {!reply?<Text selectable style={S.noticeText}>{t('native.receiptIdentity',{host:entry.hostId,version:entry.hostVersion,worktree:entry.target.worktreeId,tab:entry.target.tabId,session:entry.target.sessionId,item:confirmation.item.itemId,revision:confirmation.item.revision,operation:confirmation.operationId,time})}</Text>:null}
 </View>;
 // This count is actual reply code points, or the full rendered request-body JSON code points.
 // It is never a byte count or an estimate of the option-response RPC payload.
 const countedText=reply?confirmation.text:JSON.stringify(confirmation.item.body,null,2);
 const characterCount=Array.from(countedText).length;
 const characterLabel=characterCount===1?t('count.chars.one',{n:characterCount}):t('count.chars.other',{n:characterCount});
 const content=reply?<View style={{gap:16}}>
  <Text accessibilityRole="header" style={S.heading}>{t('native.originalQuestions')}</Text>
  {confirmation.entry.questions.map((group,index)=><View key={index} style={{gap:12}}>
   <Text selectable style={S.noticeText}>{t('native.questionIdentity',{item:group.itemId,revision:group.revision,call:group.callId})}</Text>
   <Text selectable style={S.noticeText}>{JSON.stringify({callSlot:group.callSlot},null,2)}</Text>
   {group.questions.map((question,questionIndex)=><View key={questionIndex} style={S.detail}>
    <Text selectable style={S.itemTitle}>{question.title}</Text>
    {question.options.map((option,optionIndex)=><Text key={optionIndex} selectable style={S.desc}>{optionIndex+1}. {option}</Text>)}
   </View>)}
  </View>)}
  <Text accessibilityRole="header" style={S.heading}>{t('native.actualText')} · {characterLabel}</Text>
  <Text selectable style={S.desc}>{confirmation.text}</Text>
 </View>:<View style={{gap:16}}>
  <Text selectable style={S.heading}>{t('native.requestIdentity',{item:confirmation.item.itemId,revision:confirmation.item.revision})} · {characterLabel}</Text>
  <Text selectable style={S.desc}>{countedText}</Text>
  <Text selectable style={S.heading}>{t('native.selectedChoice',{choice:confirmation.option.label})}</Text>
  <Text selectable style={S.desc}>{JSON.stringify(confirmation.option,null,2)}</Text>
 </View>;
 return <ConfirmPanel visible={visible} onDismiss={onDismiss} preparedAt={confirmation.preparedAt} scopeKey={scope} identity={identity} content={content} sourceLabel={t('confirm.nativeSource')} characterCount={characterCount} disabled={disabled} resultLabel={resultLabel} cancelDisabled={cancelDisabled} onConfirm={onConfirm} onCancel={onCancel} title={t(reply?'native.confirmReply':'native.confirmResponse')} cancelLabel={t(reply?'native.returnDraft':'send.cancel')} explanation={t(reply?'native.replyHint':'native.requestWarning')} confirmLabel={t(reply?'native.sendReply':'native.sendResponse')} confirmAccessibilityHint={t(reply?'native.sendReplyLabel':'native.sendResponseLabel')}/>;
}
