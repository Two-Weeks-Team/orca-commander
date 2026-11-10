import {useEffect,useRef,useState,useSyncExternalStore,type ComponentProps} from 'react';
import type {AgentInstructionDraftStore} from '../../core/agent-instruction-draft-store';
import {Alert,AppState,Pressable,Text,TextInput,View} from 'react-native';
import type {HostDefaultAgentClient,HostDefaultAgentConfirmation,HostDefaultAgentReason,EligibleInstructionWorktree} from '../../adapters/host-default-agent-client';
import {unresolvedHostDefaultLaunch} from '../../adapters/host-default-agent-journal';
import type {PlainMessageKey} from '../../i18n/messages';
import {useMessages} from '../../i18n/provider';
import {ConfirmPanel} from '../confirmation-panel';
import {S} from '../theme';

const refusal=(reason:HostDefaultAgentReason):PlainMessageKey=>reason==='storage_unavailable'?'agent.storage':reason==='reconciliation_required'?'agent.unknown':reason==='busy'?'agent.busy':reason==='target_changed'||reason==='not_connected'?'agent.changed':reason==='invalid_prompt'?'agent.empty':'agent.unsupported';
/** A deliberate new-session action. No timer launches, automatic retries, result polling or file-path assumptions. */
export function AgentInstructionSheet({client,active,presentationKey,draft,onDraftChange,worktreeId,onWorktreeChange,onConfirmationChange}:{client:HostDefaultAgentClient;active:boolean;presentationKey:string;draft:string;onDraftChange(text:string):void;worktreeId:string;onWorktreeChange(id:string):void;onConfirmationChange?(open:boolean):void}){
 const {t,locale,presentationRevision}=useMessages(),snapshot=useSyncExternalStore(fn=>client.subscribe(fn),()=>client.getSnapshot());
 const [worktrees,setWorktrees]=useState<readonly EligibleInstructionWorktree[]>([]),[loading,setLoading]=useState(false),[prepared,setPrepared]=useState<HostDefaultAgentConfirmation>(),[result,setResult]=useState<PlainMessageKey>(),[notice,setNotice]=useState<PlainMessageKey>(),[hostWarning,setHostWarning]=useState<string>();
 const held=useRef<HostDefaultAgentConfirmation|undefined>(undefined),presented=useRef<HostDefaultAgentConfirmation|undefined>(undefined),finished=useRef(false),sending=useRef(false),pending=useRef(false),epoch=useRef(0),mounted=useRef(true),scope=useRef('');
 const confirmationObserver=useRef(onConfirmationChange);confirmationObserver.current=onConfirmationChange;
 const nextScope=JSON.stringify([active,presentationKey,locale,presentationRevision,draft,worktreeId]);
 // Updating this fence during render also catches a stale asynchronous prepare before effects run.
 if(scope.current!==nextScope){scope.current=nextScope;epoch.current++;client.invalidate();}
 const close=(expected:HostDefaultAgentConfirmation)=>{if(sending.current||presented.current!==expected)return;epoch.current++;if(held.current)client.cancel(held.current);held.current=undefined;presented.current=undefined;finished.current=false;setPrepared(undefined);setResult(undefined);setHostWarning(undefined);confirmationObserver.current?.(false);};
 useEffect(()=>{if(!sending.current&&!finished.current){if(held.current)client.cancel(held.current);held.current=undefined;presented.current=undefined;setPrepared(undefined);setResult(undefined);confirmationObserver.current?.(false);}},[nextScope,client]);
 useEffect(()=>{mounted.current=true;const listener=AppState.addEventListener('change',phase=>{if(phase!=='active'){epoch.current++;client.invalidate();if(!sending.current&&!finished.current){if(held.current)client.cancel(held.current);held.current=undefined;presented.current=undefined;setPrepared(undefined);setResult(undefined);confirmationObserver.current?.(false);}}});return()=>{mounted.current=false;epoch.current++;client.invalidate();listener.remove();if(held.current)client.cancel(held.current);confirmationObserver.current?.(false);};},[client]);
 const load=async()=>{if(pending.current||sending.current)return;pending.current=true;setLoading(true);setNotice(undefined);const ticket=epoch.current;try{const value=await client.listEligibleWorktrees();if(!mounted.current||ticket!==epoch.current)return;if(value.ok){setWorktrees(value.worktrees);if(!value.worktrees.length)setNotice('agent.noWorktrees');}else setNotice(refusal(value.reason));}finally{pending.current=false;if(mounted.current)setLoading(false);}};
 const prepare=async()=>{
  if(pending.current||sending.current||presented.current||!active||!draft.trim()||!worktrees.some(row=>row.worktreeId===worktreeId))return;
  pending.current=true;setLoading(true);setNotice(undefined);const ticket=epoch.current;let opened=false;
  // Cancel an existing global toggle before preparation, then keep it disabled through the result panel.
  confirmationObserver.current?.(true);
  try{const value=await client.prepare({worktreeId,prompt:draft});if(!mounted.current||ticket!==epoch.current){if(value.ok)client.cancel(value.confirmation);return;}if(value.ok){opened=true;held.current=value.confirmation;presented.current=value.confirmation;setPrepared(value.confirmation);setResult(undefined);}else setNotice(refusal(value.reason));}
  finally{pending.current=false;if(!opened)confirmationObserver.current?.(false);if(mounted.current)setLoading(false);}
 };
 const submit=async(expected:HostDefaultAgentConfirmation)=>{
  if(held.current!==expected||sending.current||!active)return;
  held.current=undefined;sending.current=true;setLoading(true);
  let value:Awaited<ReturnType<HostDefaultAgentClient['confirm']>>;
  try{value=await client.confirm(expected);}catch{value={status:'unknown'};}
  client.cancel(expected);sending.current=false;if(!mounted.current)return;
  const labels={journaled:'agent.accepted',unknown:'agent.unknown',refused:'agent.refused',changed:'agent.changed',storage_unavailable:'agent.storage',already_submitted:'native.result.submitted',busy:'agent.busy'} as const;
  finished.current=true;setHostWarning(value.warning);setResult(labels[value.status]);setLoading(false);
 };
 const disabled=loading||snapshot.busy;
 const selectedWorktree=worktrees.find(row=>row.worktreeId===worktreeId);
 const button=(label:string,onPress:()=>void,unavailable=disabled,testID?:string)=><Pressable testID={testID} android_disableSound accessibilityRole="button" accessibilityState={{disabled:unavailable}} disabled={unavailable} style={[S.secondary,{flex:0,minHeight:48,opacity:unavailable?0.45:1}]} onPress={onPress}><Text style={S.secondaryText}>{label}</Text></Pressable>;
 return <View style={{display:active?'flex':'none',gap:14}}>
  <Text style={S.noticeText}>{t('agent.quota')}</Text><Text style={S.noticeText}>{t('agent.manual')}</Text>
  {button(t('agent.load'),()=>{void load();},disabled,'deck-agent-load')}<Text style={S.heading}>{t('agent.worktree')}</Text>
  {selectedWorktree?<View testID="deck-agent-selected-worktree" style={{gap:8}}><Text selectable style={S.noticeText}>{selectedWorktree.title}</Text><Text selectable style={S.noticeText}>{t('field.worktree')}: {selectedWorktree.worktreeId}</Text>{selectedWorktree.path?<Text selectable style={S.noticeText}>{selectedWorktree.path}</Text>:null}</View>:<Text testID="deck-agent-worktree-required" style={S.noticeText}>{t('agent.empty')}</Text>}
  <TextInput testID="deck-agent-draft" accessibilityLabel={t('agent.prompt')} multiline value={draft} onChangeText={onDraftChange} editable={!disabled} style={[S.desc,{borderWidth:1,padding:14,minHeight:180,textAlignVertical:'top'}]}/>
  {button(t('agent.prepare'),()=>{void prepare();},disabled||!draft.trim()||!worktrees.some(row=>row.worktreeId===worktreeId),'deck-agent-prepare')}
  {notice?<Text selectable accessibilityRole="alert" style={S.noticeText}>{t(notice)}</Text>:null}
  {snapshot.journal==='unavailable'?<><Text accessibilityRole="alert" style={S.noticeText}>{t('agent.storage')}</Text>{button(t('common.retry'),()=>{void client.reloadJournal();})}</>:null}
  <View accessibilityRole="radiogroup" accessibilityLabel={t('agent.worktree')} style={{gap:10}}>{worktrees.map(row=><Pressable testID={`deck-agent-worktree-${row.worktreeId}`} android_disableSound key={row.worktreeId} accessibilityRole="radio" accessibilityState={{checked:worktreeId===row.worktreeId,disabled}} disabled={disabled} style={[S.secondary,{flex:0,padding:14,borderWidth:worktreeId===row.worktreeId?2:1}]} onPress={()=>onWorktreeChange(row.worktreeId)}><Text selectable style={S.secondaryText}>{row.title}{'\n'}{row.path??row.worktreeId}</Text></Pressable>)}</View>
  <Text style={S.heading}>{t('agent.records')}</Text>{snapshot.receipts.map(receipt=><View key={receipt.operationId} style={{gap:8}}><Text selectable style={S.noticeText}>{receipt.worktreeId}{'\n'}{t(receipt.status==='journaled'?'agent.accepted':receipt.status==='unknown'?'agent.unknown':receipt.status==='changed'?'agent.changed':'agent.refused')}</Text>{unresolvedHostDefaultLaunch(receipt)?button(t('agent.verified'),()=>Alert.alert(t('agent.verifiedTitle'),t('agent.verifiedHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('agent.verified'),onPress:()=>{void client.acknowledge(receipt.operationId);}}])):null}</View>)}
  {prepared?<ConfirmPanel preparedAt={prepared.preparedAt} scopeKey={JSON.stringify([prepared.operationId,presentationKey])} title={t('agent.confirm')} identity={<Text selectable style={S.noticeText}>{t('field.host')}: {prepared.hostId}{'\n'}{t('field.worktree')}: {prepared.worktreeId}{'\n'}{prepared.agent}{'\n'}{t('agent.quota')}</Text>} content={<Text selectable style={S.desc}>{prepared.prompt}</Text>} sourceLabel={t('agent.source')} characterCount={Array.from(prepared.prompt).length} disabled={disabled} cancelDisabled={sending.current} resultLabel={result?[t(result),hostWarning].filter(Boolean).join('\n'):undefined} onCancel={()=>close(prepared)} onConfirm={()=>{void submit(prepared);}}/>:null}
 </View>;
}

/** Subscribe below DeckHome so native per-character changes do not update its screen state. */
export function OwnedAgentInstructionSheet({owner,...props}:{owner:AgentInstructionDraftStore}&Omit<ComponentProps<typeof AgentInstructionSheet>,'draft'|'onDraftChange'|'worktreeId'|'onWorktreeChange'>){
 const snapshot=useSyncExternalStore(owner.subscribe,owner.getSnapshot);
 return <AgentInstructionSheet {...props} draft={snapshot.draft} onDraftChange={owner.setDraft} worktreeId={snapshot.worktreeId} onWorktreeChange={owner.setWorktreeId}/>;
}
