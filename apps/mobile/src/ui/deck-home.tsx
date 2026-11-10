import {SheetButton as Pressable,SheetText as Text,SheetSkinContext,LCD,SheetPTT,CommandKey} from './deck/sheet-controls';
import {DeckSheetFooter} from './deck/sheet-footer';
import {DeckSheetFrame} from './deck/sheet-frame';
import {AgentKeyList,DeckContent,StatusDisplay} from './deck/deck-sheets';
import type {VoiceReplyPhase} from '../adapters/voice-reply-service';
import {currentFrontendFocus} from '../adapters/frontend-focus';
import {DISPLAY_CACHE_MS,pendingSelectionDisplay,displayMetadata,liveDeckDisplayReady,captureDisplayCache,encodeDisplayCache,readableDisplayCache,type DeckDisplayCache} from '../core/deck-display-cache';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Alert,AppState,Keyboard,KeyboardAvoidingView,Modal,Platform,ScrollView,StyleSheet,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import type {LiveSession,LiveSnapshot} from '../adapters/live-session';
import type {DeckActionClient,ClaudePromptReview} from '../adapters/action-client';
import {isClaudeTerminalWaiting} from '../core/claude-terminal-prompt';
import {ClaudePromptSheet} from './deck/claude-prompt-sheet';
import type {StructuredActionClient,StructuredConfirmation,StructuredResult} from '../adapters/structured-action-client';
import {combineDeckInventory} from '../adapters/deck-inventory';
import {resolveDeckNativeCommands,type DeckNativeCommandReference} from '../core/deck-native-commands';
import {createConfirmationContext,type ConfirmationContextTicket} from './confirmation-context';
import type {PlainMessageKey} from '../i18n/messages';
import {logVoiceTargetStage} from './voice-target-log';
import {NativeConfirmationDialog} from './native-confirmation';
import {presentedDeckBindings} from '../core/deck-presented-bindings';
import {bindKey,deriveDeckView,emptyDeckState,itemsInOrder,reconcileDeck,deckStoreFingerprint,stepAttention,type DeckState} from '../core/deck-model';
import {deckSlotStore,deckDisplayCacheStore,hostDefaultAgentClient} from '../app-session';
import {useMessages} from '../i18n/provider';
import {Customize} from './deck/customize';
import {DeckList} from './deck/DeckList';
import {StructuredRequests} from './structured-requests';
import {DeckScreen} from './deck/DeckScreen';
import {PhraseEditor} from './deck/phrase-editor';
import {phrasePreferences} from '../adapters/phrase-preferences';
import {ActionHistory} from './action-history';
import {AppInfoButton} from './app-info';
import {PairCard} from './pair-card';
import {placeLabel,useDeckInput} from './deck-input-sheet';
import {useGlobalDeckVoice} from './use-global-deck-voice';
import type {CapturedVoiceDraft} from '../core/ptt-gesture';
import {resolveVoiceDestination} from '../core/voice-destination';
import {appendVoiceDraft,beginVoiceCapture,cancelVoiceCapture,discardVoiceDraft,editVoiceDraft,emptyVoiceDraftInbox,selectVoiceDraft,voiceCaptureAvailability,type VoiceDraftInbox} from '../core/voice-draft-inbox';
import {TextInput} from 'react-native';
import {OwnedAgentInstructionSheet} from './deck/agent-instruction-sheet';
import {SheetHeader,useKeyboardVisible} from './sheet-header';
import {buildProjects,currentProject,emptyFocus,focusForChoice,focusMark,followDesktop,dashboardPresent,recencyOrder,recentView,resumeFollow,returnToDesktop,stepProject,DECK_DETOUR_IDLE_MS,deckDetour,stepWithinProject,type FocusState} from '../core/project-focus';
import {UsagePanel} from './deck/usage-panel';
import {Image} from 'expo-image';
import {agentDisplay,formatAge} from '../core/agent-display';
import {keyTitle,deckFace,deckKeyCount} from './deck/deck-layout';
import {StateMark,displayColor,lookFor,providerIcon} from './deck/state-mark';
import {DEFAULT_ORDER} from '../core/orca-order';
import {createAgentInstructionDraftStore} from '../core/agent-instruction-draft-store';
import {filterAgents,type AgentSearchScope} from './decision-card-model';
import {ListSearch} from './deck/ListSearch';
import {needsPairingRepair} from './live-view';
import {describeLiveStatus} from './live-status';
import {JournalRecovery} from './deck/journal-recovery';
import {overallUnresolvedCount} from './deck/uncertainty';
import {unresolvedHostDefaultLaunch} from '../adapters/host-default-agent-journal';
import {C,S,stateName} from './theme';

type Sheet='status'|'list'|'content'|'pair'|'voice'|'input'|'agent'|{slot:number}|null;
type ClaudeDialogState={loading:boolean;review?:ClaudePromptReview;notice?:PlainMessageKey;result?:PlainMessageKey};
/** The first physical-deck surface. Read authority and action journals are existing app-owned clients. */
export function DeckHome({snapshot,session,client,structured,onSwitchList,onSwitchDeck,mode='deck',screenReader=null,active:visible=true,replySpeech}:{replySpeech?:{phase:VoiceReplyPhase;cancel():void;beforeCapture():Promise<boolean>};mode?:'deck'|'list';screenReader?:boolean|null;onSwitchDeck?:()=>void;active?:boolean;snapshot:LiveSnapshot;session:LiveSession;client:DeckActionClient;structured:StructuredActionClient;onSwitchList:()=>void}){
 const {t,locale,presentationRevision}=useMessages();
 const keyboardVisible=useKeyboardVisible();
 const sheetScroll=useRef<ScrollView>(null),customizeY=useRef(0);
 const [settingsVisible,setSettingsVisible]=useState(false);
 const [sheetViewportHeight,setSheetViewportHeight]=useState(0);
 const [sheetFooterHeight,setSheetFooterHeight]=useState(0);
 const modalPresentation=useRef({open:false,physical:false});
 const [frame,setFrame]=useState({width:0,height:0});
 const faceKeys=deckKeyCount(deckFace(frame.width,frame.height));
 const [instructionOwner]=useState(createAgentInstructionDraftStore);
 const phrase=useSyncExternalStore(fn=>phrasePreferences.subscribe(fn),()=>phrasePreferences.getSnapshot());
 const [phraseEditor,setPhraseEditor]=useState(false);
 const [claudeDialog,setClaudeDialog]=useState<ClaudeDialogState>();
 const claudeDialogRef=useRef<ClaudeDialogState|undefined>(undefined),claudeSending=useRef(false),claudeRequest=useRef(0);
 const [claudeSubmitting,setClaudeSubmitting]=useState(false);
 const claudePresentation=useRef('');claudePresentation.current=JSON.stringify([visible,mode,locale,presentationRevision]);
 useEffect(()=>{if(visible)void phrasePreferences.retry();},[visible]);
 const [listQuery,setListQuery]=useState(''),[listScope,setListScope]=useState<AgentSearchScope>('all');
 const [agentConfirming,setAgentConfirming]=useState(false),[unpairing,setUnpairing]=useState(false);
 const unpairingRef=useRef(false);
 const sharedInput=useDeckInput();
 const pendingInput=useRef<(()=>void)|undefined>(undefined);
 const [nativeDialog,setNativeDialog]=useState<StructuredConfirmation>(),[nativeResult,setNativeResult]=useState<PlainMessageKey>(),[nativeSubmitting,setNativeSubmitting]=useState(false);
 const heldNative=useRef<StructuredConfirmation|undefined>(undefined),nativeArmed=useRef<ConfirmationContextTicket|undefined>(undefined),nativeSending=useRef(false),nativePresentedScope=useRef(''),suppressDraftSheet=useRef(false);
 const nativeContext=useRef(createConfirmationContext('')).current;
 const actions=useSyncExternalStore(fn=>client.subscribe(fn),()=>client.getSnapshot());
 const requests=useSyncExternalStore(fn=>structured.subscribe(fn),()=>structured.getSnapshot());
 const launches=useSyncExternalStore(fn=>hostDefaultAgentClient.subscribe(fn),()=>hostDefaultAgentClient.getSnapshot());
 const [clock,setClock]=useState(Date.now),[deck,setDeck]=useState<DeckState>(emptyDeckState),[loaded,setLoaded]=useState(false),[stored,setStored]=useState(false),[storageError,setStorageError]=useState(false),[retry,setRetry]=useState(0),[sheet,setSheet]=useState<Sheet>(null),[notice,setNotice]=useState<'deck.capacity'|'deck.clearUnavailable'>();
 useEffect(()=>{setSettingsVisible(false);},[sheet]);
 const deferredRestore=useRef<(()=>void)|undefined>(undefined);
 const captureTargetLock=useRef(false);const [captureTargetLocked,setCaptureTargetLocked]=useState(false);
 const [inbox,setInbox]=useState(emptyVoiceDraftInbox),[unaccepted,setUnaccepted]=useState<CapturedVoiceDraft>();
 const inboxRef=useRef(inbox),captureId=useRef<string|undefined>(undefined);
 const publishInbox=(next:VoiceDraftInbox)=>{inboxRef.current=next;setInbox(next);};
 const inboxEntries=inbox.overflow?[...inbox.entries,inbox.overflow]:inbox.entries;
 const selectedDraft=inboxEntries.find(entry=>entry.id===inbox.selectedId);
 const voiceDraft=unaccepted??(selectedDraft?{...selectedDraft.captured,text:selectedDraft.text}:undefined);
 const [displayCache,setDisplayCache]=useState<DeckDisplayCache|null>(null);
 const lastCacheEncoded=useRef<string|null>(null);
 useEffect(()=>{let active=true;void deckDisplayCacheStore.load(Date.now()).then(cache=>{if(active)setDisplayCache(current=>current??cache);});return()=>{active=false;};},[]);
 const deckRef=useRef(deck);deckRef.current=deck;
 const now=useMemo(()=>Date.now(),[clock,snapshot,actions,requests]);
 const inventory=useMemo(()=>combineDeckInventory(snapshot,requests,now,actions),[snapshot,requests,actions,now]);
 const [focus,setFocus]=useState<FocusState>(emptyFocus);const focusRef=useRef(focus);focusRef.current=focus;
 const presentSet=useMemo(()=>dashboardPresent(inventory.agents,new Set(deck.present)),[deck.present,inventory.agents]);
 const displayContext=displayMetadata(displayCache,snapshot.host?.hostId,now,snapshot.usage,snapshot.order);
 const displayOrder=displayContext.order;
 const orderSettings=useMemo(()=>({sortBy:displayOrder?.sortBy??DEFAULT_ORDER.sortBy,projectOrderBy:displayOrder?.projectOrderBy??DEFAULT_ORDER.projectOrderBy,repoOrder:displayOrder?.repoOrder?new Map(displayOrder.repoOrder.map((id,index)=>[id,index] as const).reverse()):undefined}),[displayOrder]);
 const projects=useMemo(()=>buildProjects(inventory.agents,presentSet,orderSettings,now),[inventory.agents,presentSet,orderSettings,now]);
 const project=currentProject(focus,projects);
 // Host output determines the top set; committed numbered keys remain stable inside each view.
 const scope=focus.mode==='follow'?'recent':`project:${focus.repoId??''}`;
 const layoutHistory=useRef<{hostId:string|undefined;views:Map<string,readonly(string|null)[]>}>({hostId:undefined,views:new Map()});
 const layout=useMemo(()=>recentView(layoutHistory.current.hostId===snapshot.host?.hostId?layoutHistory.current.views.get(`${scope}:${faceKeys}`)??[]:[],recencyOrder(inventory.agents,presentSet,undefined,scope==='recent'?undefined:new Set(project?.items??[])),faceKeys),[snapshot.host?.hostId,scope,project,inventory.agents,presentSet,faceKeys]);
 useEffect(()=>{
  // Empty/reconnecting renders cannot erase the last live key bindings or mutate a pending render's history.
  if(!inventory.live||!layout.items.length)return;
  if(layoutHistory.current.hostId!==snapshot.host?.hostId)layoutHistory.current={hostId:snapshot.host?.hostId,views:new Map()};
  layoutHistory.current.views.set(`${scope}:${faceKeys}`,layout.keys);
 },[inventory.live,snapshot.host?.hostId,scope,faceKeys,layout]);
 const desktopFocus=currentFrontendFocus(snapshot.desktopFocus,now);
 const desktopFocusRef=useRef(desktopFocus);desktopFocusRef.current=desktopFocus;
 const desktopMark=focusMark(desktopFocus);
 useEffect(()=>{
  if(!visible||captureTargetLock.current)return;
  const result=followDesktop(focusRef.current,projects,inventory.agents,presentSet,desktopFocus,deckRef.current.selected);
  if(JSON.stringify(result.state)!==JSON.stringify(focusRef.current))setFocus(result.state);
  if(result.select&&presentSet.has(result.select)){setDeck(current=>current.present.includes(result.select!)?{...current,selected:result.select}:current);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[desktopMark,projects,visible,focus.mark,focus.mode,deck.selected,captureTargetLocked]);
 // Any deck input (a key, the joystick, a pick) changes the selection or the focus and restarts the wait.
 const detour=deckDetour(focus,inventory.agents,presentSet,desktopFocus,deck.selected);
 useEffect(()=>{
  if(!detour.away||captureTargetLock.current)return;
  const id=setTimeout(()=>{if(captureTargetLock.current)return;const confirmed=currentFrontendFocus(desktopFocusRef.current,Date.now());const result=returnToDesktop(focusRef.current,latest.current.agents,dashboardPresent(latest.current.agents,new Set(deckRef.current.present)),confirmed);setFocus(result.state);const key=result.select;if(key!==null)setDeck(current=>current.present.includes(key)?{...current,selected:key}:current);},DECK_DETOUR_IDLE_MS);
  return()=>clearTimeout(id);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[detour.away,detour.desktop,focus,deck.selected,captureTargetLocked]);
 const draftTarget=voiceDraft?.generation===inventory.generation?inventory.agents.find(agent=>bindKey(agent)===voiceDraft.targetKey):undefined;
 const latest=useRef(inventory);latest.current=inventory;
 const lastStored=useRef<string|null>(null),requested=useRef<string|null>(null),mounted=useRef(true);
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),1000);mounted.current=true;return()=>{clearInterval(id);mounted.current=false;};},[]);
 useEffect(()=>{
  let active=true;
  const load=()=>{
   if(!active)return;
   setLoaded(false);setStored(false);
   void deckSlotStore.load(Date.now()).then(state=>{
    const apply=()=>{if(!active)return;try{lastStored.current=deckStoreFingerprint(state,Date.now());}catch{lastStored.current=null;}requested.current=null;setDeck(state);setStorageError(state.restore==='blocked');setLoaded(true);};
    if(!active)return;
    if(captureTargetLock.current)deferredRestore.current=apply;else apply();
   });
  };
  if(captureTargetLock.current)deferredRestore.current=load;else load();
  return()=>{active=false;};
 },[retry]);
 useEffect(()=>{if(captureTargetLock.current)return;const apply=deferredRestore.current;deferredRestore.current=undefined;apply?.();},[captureTargetLocked]);
 useEffect(()=>{if(loaded&&visible&&!captureTargetLock.current)setDeck(previous=>reconcileDeck(previous,inventory,now));},[loaded,inventory,now,visible,captureTargetLocked]);
 useEffect(()=>{
  if(!loaded||!visible)return;let encoded:string;
  try{encoded=deckStoreFingerprint(deck,now);}catch{setStorageError(true);setStored(false);return;}
  if(lastStored.current===encoded){setStored(true);return;}
  if(requested.current===encoded)return;
  requested.current=encoded;setStored(false);
  void deckSlotStore.save(deck,now).then(ok=>{if(ok)lastStored.current=encoded;if(!mounted.current||requested.current!==encoded)return;setStored(ok);setStorageError(!ok);});
 },[deck,loaded,now,visible]);
 const voice=useGlobalDeckVoice({beforeCapture:replySpeech?.beforeCapture,session,captureAvailable:!unaccepted&&voiceCaptureAvailability(inbox).available,onCaptureStart:()=>{if(unaccepted)return false;suppressDraftSheet.current=false;const result=beginVoiceCapture(inboxRef.current);if(!result.started)return false;captureTargetLock.current=true;setCaptureTargetLocked(true);captureId.current=result.captureId;publishInbox(result.state);return true;},onCaptureFinished:()=>{captureTargetLock.current=false;if(mounted.current)setCaptureTargetLocked(false);if(captureId.current)publishInbox(cancelVoiceCapture(inboxRef.current,captureId.current));captureId.current=undefined;},enabled:visible&&inventory.live&&inventory.uncertaintyKnown,confirmationOpen:sharedInput.isOpen||!!nativeDialog||!!claudeDialog||agentConfirming,getContext:()=>({key:deck.selected,generation:inventory.generation,labels:inventory.agents.filter(agent=>deck.present.includes(bindKey(agent))).map(agent=>({key:bindKey(agent),label:agent.title}))}),onNavigate:intent=>{if(intent.kind==='focus.select')pick(intent.key);else if(intent.kind==='focus.attention')pick(stepAttention(deck,inventory.agents,intent.direction)??'');else choose(stepWithinProject(layout,deck.selected,intent.direction==='next'?'right':'left')??'');},onDraft:(draft,meta)=>{const result=appendVoiceDraft(inboxRef.current,draft,captureId.current);if(result.accepted)publishInbox(result.state);else setUnaccepted(result.unaccepted);
  if(!visible){logVoiceTargetStage('hidden');return;}
  if(suppressDraftSheet.current){logVoiceTargetStage('suppressed');return;}
  // Completed speech proposes a fresh destination, then reads its identity and requests explicit confirmation.
  const proposal=resolveVoiceDestination(draft,meta?.completed===true,{live:inventory.live,hostId:snapshot.host?.hostId,generation:inventory.generation,agents:inventory.agents,present:new Set(deck.present),selected:deck.selected});
  logVoiceTargetStage(proposal?'captured':draft.targetChanged?'changed':draft.targetKey===null?'no_target':'retained');
  if(proposal)openInput(proposal.key,'voice',withVoiceNote(draft.text),{autoPrepare:true,incomingId:result.accepted?result.id:'retained-overflow'});else setSheet('voice');}});
 /** Dictation reaches the agent verbatim with one line asking it to read for intent: it corrects its own input. */
 const withVoiceNote=(text:string)=>{const note=t('voice.agentNote');return text.includes(note)?text:`${text.trimEnd()}\n\n${note}`;};
 // A sent draft is done: its voice drafts leave the inbox, and a retained overflow is released.
 useEffect(()=>sharedInput.onSent(ids=>{for(const id of ids){if(id==='retained-overflow')setUnaccepted(undefined);else publishInbox(discardVoiceDraft(inboxRef.current,id));}}),[sharedInput]);
 const openInput=(key:string,origin?:'typed'|'voice',text?:string,options?:{autoPrepare?:boolean;incomingId?:string;isolated?:boolean})=>{const agent=inventory.agents.find(agent=>bindKey(agent)===key);if(!agent)return;const generation=inventory.generation;const incomingId=origin==='voice'?(options?.incomingId??(unaccepted?'retained-overflow':selectedDraft?.id)):undefined;const open=()=>sharedInput.open(agent,generation,origin,text,incomingId,{autoPrepare:options?.autoPrepare,isolated:options?.isolated});if(Platform.OS==='ios'&&sheet!==null){pendingInput.current=open;setSheet(null);}else{setSheet(null);open();}};
 const link=snapshot.phase==='unpaired'?'UNPAIRED':inventory.live?'LIVE':snapshot.phase==='connecting'?'STALE':'OFFLINE';
 const unresolvedCount=overallUnresolvedCount(inventory.unresolvedCount,launches),unresolvedLaunches=launches.receipts.filter(unresolvedHostDefaultLaunch).length;
 const context={...inventory,now,link:link as 'LIVE'|'STALE'|'OFFLINE'|'UNPAIRED',journalReady:inventory.uncertaintyKnown,busy:actions.busy||requests.busy,caps:{input:!!session.actionChannel()?.transport.acquireTerminalInput,approve:false,speech:voice.available},unresolvedCount};
 let currentMetadata:string|null=null;try{currentMetadata=deckStoreFingerprint(deck,now);}catch{}
 const bindingReady=loaded&&stored&&currentMetadata!==null&&currentMetadata===lastStored.current&&!storageError;
 const shownSlots=presentedDeckBindings(layout.keys.map(key=>key?{key,ignoreUntil:0}:null),bindingReady);
 useEffect(()=>{
  if(displayCache&&(snapshot.phase==='unpaired'||now-displayCache.issuedAt>DISPLAY_CACHE_MS)){setDisplayCache(null);lastCacheEncoded.current=null;void deckDisplayCacheStore.clear();}
 },[snapshot.phase,displayCache,now]);
 const nativeCommands=resolveDeckNativeCommands({deck,inventory,actions,structured:requests,channel:session.actionChannel(),now});
 const view=deriveDeckView(deck,context,layout);
 const repair=needsPairingRepair(snapshot),repairStatus=describeLiveStatus(snapshot,t);
 if(repair){view.commands.scanQr=true;view.commands.reconnect=false;}
 if(unpairing){view.commands.scanQr=false;view.commands.reconnect=false;}
 view.commands.allow=!!nativeCommands.allow;view.commands.reject=!!nativeCommands.reject;
 // Do not expose a newly numbered binding until its protected metadata write has settled.
 if(!bindingReady){view.keys=view.keys.map(key=>({...key,agent:null,state:'unknown' as const,selected:false}));view.commands.input=false;view.display.position=null;}

 const displayReady=liveDeckDisplayReady(deck,inventory,now,bindingReady)&&view.commands.list.count!==null;
 const cachedLcdDisplay=pendingSelectionDisplay(displayCache,snapshot.host?.hostId,now,displayReady,view.display.agent?deck.selected:null,layout.items,{hostId:snapshot.host?.hostId??'',issuedAt:inventory.confirmedAt,agents:inventory.agents.filter(agent=>presentSet.has(bindKey(agent))),items:recencyOrder(inventory.agents,presentSet),keys:layout.keys,selectedKey:null,partial:view.display.partial,unresolved:view.display.unresolved,focusInfo:{project:null,worktree:null,following:focus.mode==='follow',synced:false},usage:snapshot.usage,order:snapshot.order})??undefined;
 const cachedDisplay=readableDisplayCache(displayCache,snapshot.host?.hostId,now,displayReady)??undefined;
 // Until the source is applied, the surface cannot borrow a LIVE channel's controls or confirm an empty view.
 if(!displayReady){
  view.keys=view.keys.map(key=>({...key,agent:null,state:'unknown' as const,selected:false}));
  view.display.agent=null;view.display.name=null;view.display.provider=null;view.display.position=null;view.display.counts=null;
  if(view.display.link==='LIVE')view.display.link='STALE';
  view.commands.allow=false;view.commands.reject=false;view.commands.content=false;view.commands.input=false;view.commands.voice=false;
  view.commands.list={lit:false,count:null};view.commands.nextDecision={lit:false,count:null};
 }

 const active=deck.selected?inventory.agents.find(agent=>bindKey(agent)===deck.selected):undefined;
 // Display freshness may hide rows; it must not time out an open review. This is
 // presentation evidence only. Every mutation owner performs a new bound read.
 const actionConnection=session.actionChannel();
 const selectedNative=active?.nativeRequest??(nativeDialog?{tabId:nativeDialog.entry.target.tabId,sessionId:nativeDialog.entry.target.sessionId,itemId:nativeDialog.item.itemId}:undefined);
 const nativeEvidence=selectedNative?requests.entries.filter(entry=>entry.hostId===(active?.target.hostId??nativeDialog?.entry.hostId)&&entry.target.worktreeId===(active?.target.worktreeId??nativeDialog?.entry.target.worktreeId)&&entry.target.tabId===selectedNative.tabId&&entry.target.sessionId===selectedNative.sessionId).map(entry=>({hostId:entry.hostId,runtimeId:entry.runtimeId,generation:entry.generation,target:entry.target,fence:entry.fence,marker:entry.marker,items:entry.items.filter(item=>item.itemId===selectedNative.itemId)})):[];
 const nativeScope=JSON.stringify([locale,presentationRevision,mode,visible,sharedInput.isOpen,actionConnection?.hostId,actionConnection?.runtimeId,actionConnection?.generation,deck.selected,actions.journal,requests.journal,actions.busy,nativeEvidence]);
 nativeContext.update(nativeScope);
 useEffect(()=>{if(heldNative.current){structured.cancel(heldNative.current);heldNative.current=undefined;setNativeDialog(undefined);setNativeResult(undefined);}},[nativeScope,structured]);
 useEffect(()=>()=>{nativeContext.invalidate();if(heldNative.current)structured.cancel(heldNative.current);},[nativeContext,structured]);
 const cancelNative=()=>{if(nativeSending.current)return;if(heldNative.current)structured.cancel(heldNative.current);heldNative.current=undefined;setNativeDialog(undefined);setNativeResult(undefined);};
 const prepareNative=async(reference:DeckNativeCommandReference|null)=>{
  if(!reference||nativeSending.current||structured.getSnapshot().busy||client.getSnapshot().busy)return;
  suppressDraftSheet.current=true;voice.cancelCapture();setNativeResult(undefined);
  const ticket=nativeContext.capture(),result=await structured.prepare(reference.entry,reference.item.itemId,reference.option.id);
  if(!mounted.current||!nativeContext.isCurrent(ticket)){if(result.ok)structured.cancel(result.confirmation);return;}
  if(result.ok){nativePresentedScope.current=nativeScope;nativeArmed.current=ticket;heldNative.current=result.confirmation;setNativeDialog(result.confirmation);}
  else {setNativeResult(result.reason==='storage_unavailable'?'native.responseStorageBlocked':result.reason==='reconciliation_required'?'native.reconcile':'native.requestChanged');setSheet('status');}
 };
 const submitNative=async(expected:StructuredConfirmation|undefined)=>{
  const owned=heldNative.current;if(!owned||owned!==expected||nativeSending.current||client.getSnapshot().busy||structured.getSnapshot().busy)return;
  if(!nativeContext.isCurrent(nativeArmed.current)){cancelNative();return;}
  heldNative.current=undefined;nativeSending.current=true;setNativeSubmitting(true);
  const result=await structured.confirm(owned);structured.cancel(owned);
  nativeSending.current=false;if(!mounted.current)return;
  const labels={accepted:'native.result.accepted',refused:'native.result.refused',changed:'native.result.changed',unknown:'native.result.unknown',storage_unavailable:'native.result.storage',already_submitted:'native.result.submitted',busy:'native.result.busy'} as const satisfies Record<StructuredResult['status'],PlainMessageKey>;
  setNativeResult(labels[result.status]);setNativeSubmitting(false);
 };
 // The list follows Orca's project order (current project first), then any rows without a project.
 const projectOrder=[...(project?project.items:[]),...projects.filter(p=>p!==project).flatMap(p=>p.items)];
 const list=[...projectOrder,...itemsInOrder(deck).filter(key=>presentSet.has(key)&&!projectOrder.includes(key))].map(key=>({key,agent:inventory.agents.find(agent=>bindKey(agent)===key)})).filter(row=>row.agent!==undefined);
 const listMatches=new Set(filterAgents(list.map(row=>row.agent!),listQuery,listScope)),filteredList=list.filter(row=>listMatches.has(row.agent!));
 const canSelectNow=()=>liveDeckDisplayReady(deckRef.current,latest.current,Date.now(),bindingReady);
 const claudeWaiting=isClaudeTerminalWaiting(active);
 const claudeReady=claudeWaiting&&visible&&mode==='deck'&&displayReady&&bindingReady&&!unpairing&&sheet===null&&!sharedInput.isOpen&&!nativeDialog&&!agentConfirming&&!phraseEditor&&!captureTargetLocked&&!requests.busy&&client.canAnswerClaude(active);
 const showClaude=(next:ClaudeDialogState|undefined)=>{claudeDialogRef.current=next;setClaudeDialog(next);};
 const closeClaude=()=>{if(claudeSending.current)return;claudeRequest.current++;const review=claudeDialogRef.current?.review;if(review)client.dismissClaudePrompt(review);showClaude(undefined);};
 const claudeStillPresented=(key:string,generation:number|null,scope:string)=>mounted.current&&AppState.currentState==='active'&&claudePresentation.current===scope&&deckRef.current.selected===key&&session.actionChannel()?.generation===generation;
 const claudeReviewKey=(review:ClaudePromptReview)=>{const agent=latest.current.agents.find(a=>a.provider==='claude'&&a.target.hostId===review.hostId&&a.target.worktreeId===review.worktreeId&&a.target.terminalId===review.paneKey);return agent?bindKey(agent):null;};
 const submitClaude=async(index:number|'escape',text?:string)=>{
  const review=claudeDialogRef.current?.review;if(!review||claudeSending.current||client.getSnapshot().busy||structured.getSnapshot().busy)return;
  const key=deckRef.current.selected,scope=claudePresentation.current;
  if(!key||key!==claudeReviewKey(review)||!claudeStillPresented(key,review.generation,scope)){closeClaude();return;}
  claudeSending.current=true;setClaudeSubmitting(true);
  try{
   const result=await client.respondClaudePrompt(review,index,text,()=>claudeStillPresented(key,review.generation,scope));
   if(!mounted.current)return;
   if((result.status==='changed'||result.status==='cursor_required')&&result.review)showClaude({loading:false,review:result.review,notice:result.status==='cursor_required'?'claude.cursorRequired':'claude.changed'});
   else showClaude({loading:false,review,result:result.status==='accepted'?(result.nextPrompt?'claude.nextPrompt':'claude.accepted'):result.status==='unknown'||result.status==='partial'?(result.cursorMoved?'claude.cursorUnknown':'claude.unknown'):'claude.refused'});
  }catch{if(mounted.current)showClaude({loading:false,review,result:'claude.unknown'});}
  finally{claudeSending.current=false;if(mounted.current)setClaudeSubmitting(false);}
 };
 const openClaudePrompt=async(escape=false)=>{
  if(!active||!claudeReady||claudeSending.current||claudeDialogRef.current||!canSelectNow()||!deck.selected)return;
  const key=deck.selected,generation=inventory.generation,scope=claudePresentation.current,request=++claudeRequest.current;
  suppressDraftSheet.current=true;voice.cancelCapture();showClaude({loading:true});
  const result=await client.prepareClaudePrompt(active);
  if(!mounted.current||request!==claudeRequest.current||!claudeStillPresented(key,generation,scope)){if(result.ok)client.dismissClaudePrompt(result.review);if(mounted.current&&request===claudeRequest.current)showClaude(undefined);return;}
  if(!result.ok){showClaude({loading:false,notice:result.reason==='short_terminal'?'claude.taller':'claude.desktop'});return;}
  showClaude({loading:false,review:result.review});if(escape)await submitClaude('escape');
 };
 useEffect(()=>{if(!visible||mode!=='deck')closeClaude();return()=>{};},[visible,mode]);
 useEffect(()=>()=>{claudeRequest.current++;const review=claudeDialogRef.current?.review;if(review)client.dismissClaudePrompt(review);claudeDialogRef.current=undefined;},[client]);
 const phraseReady=!claudeDialog&&visible&&mode==='deck'&&phrase.phase==='ready'&&sheet===null&&!sharedInput.isOpen&&!nativeDialog&&!agentConfirming&&!phraseEditor&&!captureTargetLocked;
 const openPhrase=()=>{if(!phraseReady||!view.commands.input||!canSelectNow()||!deck.selected)return;openInput(deck.selected,'typed',phrase.value.text,{autoPrepare:true,isolated:true});};
 useEffect(()=>{if(!visible)setPhraseEditor(false);},[visible]);
 const canChangeTarget=()=>{if(voice.isCapturing()){voice.notifyTargetChangeBlocked();return false;}return canSelectNow();};
 const choose=(key:string)=>{if(voice.isCapturing()&&key===deckRef.current.selected)return false;if(!canChangeTarget()||!deckRef.current.present.includes(key))return false;setDeck(current=>current.present.includes(key)?{...current,selected:key}:current);return true;};
 /** A row picked from list, voice or dial changes selection; the host alone owns dashboard ranking. */
 const pick=(key:string)=>{if(!choose(key))return false;setFocus(current=>focusForChoice(current,projects,key));return true;};
 const selectedProject=deck.selected?projects.find(p=>p.items.includes(deck.selected!)):undefined;
 // Only confirmed, persisted live bindings can capture display metadata. Restoration never enters inventory.
 useEffect(()=>{
  const hostId=snapshot.host?.hostId;if(!hostId||!inventory.live||!displayReady)return;
  const agents=list.map(row=>row.agent!);
  if(cachedLcdDisplay&&cachedLcdDisplay.lcdSource!=='live-row')return;
  const cache=cachedLcdDisplay?.lcdSource==='live-row'?cachedLcdDisplay:captureDisplayCache({hostId,issuedAt:inventory.confirmedAt,agents,items:layout.items,keys:layout.keys,selectedKey:agents.some(a=>bindKey(a)===deck.selected)?deck.selected:null,partial:view.display.partial,unresolved:view.display.unresolved,focusInfo:{project:(selectedProject?.name??(focus.mode==='manual'?projects.find(p=>p.repoId===focus.repoId)?.name:undefined))??null,worktree:active?.place?.worktreeName??null,following:focus.mode==='follow',synced:detour.desktop!==null&&!detour.away},usage:snapshot.usage,order:snapshot.order,desktopFocus},now,displayReady,displayCache);
  if(!cache)return;const encoded=encodeDisplayCache(cache);if(!encoded||encoded===lastCacheEncoded.current)return;
  lastCacheEncoded.current=encoded;setDisplayCache(cache);void deckDisplayCacheStore.save(cache);
 },[snapshot,inventory,displayReady,layout,deck.selected,focus.mode,project,selectedProject,detour.away,active,list,now,displayCache,cachedLcdDisplay]);
 const explain=typeof sheet==='object'&&sheet!==null?shownSlots[sheet.slot]:undefined;
 const explained=explain?inventory.agents.find(agent=>bindKey(agent)===explain.key):undefined;
 const unpairBusy=unpairing||actions.busy||requests.busy||launches.busy;
 const confirmUnpair=()=>{
  const expectedHost=snapshot.host;if(!expectedHost||unpairBusy||unpairingRef.current)return;let consumed=false;
  Alert.alert(t('link.unpair'),t('live.unpairExplanation'),[{text:t('send.cancel'),style:'cancel'},{text:t('link.unpair'),style:'destructive',onPress:()=>{
   if(consumed||unpairingRef.current||session.getSnapshot().host!==expectedHost||client.getSnapshot().busy||structured.getSnapshot().busy||hostDefaultAgentClient.getSnapshot().busy)return;
   consumed=true;unpairingRef.current=true;setUnpairing(true);
   void session.unpair().finally(()=>{unpairingRef.current=false;if(mounted.current)setUnpairing(false);}).catch(()=>{if(mounted.current)setNativeResult('live.storageUnpairFailed');});
  }}]);
 };
 const physicalSheet=sheet==='status'||sheet==='list'||sheet==='content';
 if(sheet===null||sharedInput.isOpen)modalPresentation.current.open=false;else if(!modalPresentation.current.open)modalPresentation.current={open:true,physical:physicalSheet};
 const title=sheet==='status'?t(settingsVisible?'set.title':'status.history'):sheet==='agent'?t('agent.title'):sheet==='list'?t('cmd.list'):sheet==='pair'?t('pair.title'):typeof sheet==='object'&&sheet!==null?t('key.slot'):t('cmd.content');
 const identity=(agent:NonNullable<typeof active>)=><Text selectable style={S.noticeText}>{placeLabel(agent)||'—'}</Text>;
 return <View style={{flex:1,backgroundColor:'#0A0D12'}} onLayout={event=>{const {width,height}=event.nativeEvent.layout;setFrame(previous=>previous.width===width&&previous.height===height?previous:{width,height});}}>
  <View style={{flex:1,display:mode==='deck'?'flex':'none'}} pointerEvents={mode==='deck'?'auto':'none'} accessibilityElementsHidden={mode!=='deck'} importantForAccessibility={mode==='deck'?'auto':'no-hide-descendants'}>
  <DeckScreen readAgeSeconds={inventory.live?Math.floor(Math.max(0,now-inventory.confirmedAt)/1000):undefined} claudePrompt={claudeWaiting&&displayReady?{kind:active!.terminalPrompt!.kind,enabled:claudeReady}:undefined} phrase={phrase.value} phraseReady={phraseReady} phraseScope={JSON.stringify([snapshot.host?.hostId,inventory.generation,deck.selected,locale,presentationRevision,visible,mode])} onPhraseConfirm={openPhrase} onPhraseEdit={()=>{if(phraseReady&&view.commands.input&&deck.selected&&canSelectNow())setPhraseEditor(true);}} voiceDisplay={voice.display} canNavigate={canSelectNow} frame={frame} cachedLcdDisplay={cachedLcdDisplay} liveLcdDisplay={cachedLcdDisplay?.lcdSource?cachedLcdDisplay:undefined} cachedDisplay={cachedDisplay} onAllow={()=>{if(claudeWaiting)void openClaudePrompt();else void prepareNative(nativeCommands.allow);}} onReject={()=>{if(claudeWaiting)void openClaudePrompt(true);else void prepareNative(nativeCommands.reject);}} view={view} onPressKey={slot=>{const displayedKey=layout.keys[slot];if(!bindingReady||!displayedKey)return;choose(displayedKey);}} onStep={direction=>{if(!canChangeTarget())return;if(direction==='left'||direction==='right'){choose(stepWithinProject(layout,deck.selected,direction)??'');return;}const result=stepProject(focus,projects,direction,deck.selected);setFocus(result.state);if(result.select){const opened=projects.find(p=>p.repoId===result.state.repoId);choose(recencyOrder(inventory.agents,presentSet,undefined,new Set(opened?.items??[]))[0]??result.select);}}} focusInfo={{project:(selectedProject?.name??(focus.mode==='manual'?projects.find(p=>p.repoId===focus.repoId)?.name:undefined))??null,worktree:(deck.selected?inventory.agents.find(agent=>bindKey(agent)===deck.selected)?.place?.worktreeName:undefined)??null,following:focus.mode==='follow',synced:detour.desktop!==null&&!detour.away}} usage={displayContext.usage} onFollow={()=>{if(canChangeTarget())setFocus(resumeFollow(focus));}} onRefreshUsage={()=>session.refreshUsage()} onAttention={direction=>pick(stepAttention(deck,inventory.agents,direction)??'')} onContent={()=>setSheet('content')} onInput={()=>{if(deck.selected)openInput(deck.selected);}} onList={()=>setSheet('list')} onStatus={()=>setSheet('status')} onExplainKey={slot=>{if(bindingReady){setNotice(undefined);setSheet({slot});}}} onReconnect={()=>{void session.start();}} onScan={()=>setSheet('pair')} voiceAvailable={voice.available} voiceRecording={voice.snapshot.phase==='recording'} onVoicePressIn={voice.pressIn} onVoicePressOut={voice.pressOut} voiceAvailabilityReason={[voice.reason,voice.snapshot.modelLabel].filter(Boolean).join(' · ')}/>
  </View>
  <View style={{flex:1,display:mode==='list'?'flex':'none'}} pointerEvents={mode==='list'?'auto':'none'} accessibilityElementsHidden={mode!=='list'} importantForAccessibility={mode==='list'?'auto':'no-hide-descendants'}>
   <DeckList voiceDisplay={voice.display} cachedDisplay={cachedDisplay} onExplainKey={slot=>{if(bindingReady){setNotice(undefined);setSheet({slot});}}} view={view} rows={list.map(({key,agent})=>({key,agent:agent!,slot:shownSlots.some(slot=>slot?.key===key)?shownSlots.findIndex(slot=>slot?.key===key)+1:null}))} selectedKey={deck.selected} onSelect={key=>pick(key)} onContent={()=>setSheet('content')} onInput={()=>{if(deck.selected)openInput(deck.selected);}} onStatus={()=>setSheet('status')} onScan={()=>setSheet('pair')} onReconnect={()=>{void session.start();}} voiceAvailable={voice.available} voiceRecording={voice.snapshot.phase==='recording'} voiceReason={[voice.reason,voice.snapshot.modelLabel].filter(Boolean).join(' · ')} onVoicePressIn={voice.pressIn} onVoicePressOut={voice.pressOut} screenReader={screenReader}>
    <StructuredRequests active={visible&&!sharedInput.isOpen} presentationKey={JSON.stringify([mode,presentationRevision])} externallyManaged client={structured} session={session} live={!!actionConnection} generation={snapshot.connection?.generation} otherBusy={actions.busy} onEditorOpen={()=>{suppressDraftSheet.current=true;voice.cancelCapture();sharedInput.close();}}/>
   </DeckList>
  </View>
  <Modal visible={sheet!==null&&!sharedInput.isOpen} animationType="slide" transparent={modalPresentation.current.physical} presentationStyle={modalPresentation.current.physical?'overFullScreen':'fullScreen'} onRequestClose={()=>setSheet(null)} onDismiss={()=>{const open=pendingInput.current;pendingInput.current=undefined;open?.();}}>
   <SheetSkinContext.Provider value={physicalSheet}><DeckSheetFrame count={sheet==='list'?list.length:undefined} physical={physicalSheet} title={title} onClose={()=>{Keyboard.dismiss();setSheet(null);}} keyboardVisible={keyboardVisible}><KeyboardAvoidingView style={{flex:1,minHeight:0}} behavior={Platform.OS==='ios'?'padding':undefined}>

    <ScrollView ref={sheetScroll} onLayout={e=>{const h=e.nativeEvent.layout.height;setSheetViewportHeight(v=>v===h?v:h);}} style={{flex:1,minHeight:0}} contentContainerStyle={[D.body,physicalSheet?{paddingHorizontal:2,paddingTop:4,paddingBottom:Math.max(8,sheetFooterHeight),gap:12}:null,sheet==='content'?{flexGrow:1}:null]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} automaticallyAdjustKeyboardInsets={false}>
     {sheet==='status'?<>
      <StatusDisplay readAgeSeconds={inventory.live?Math.floor(Math.max(0,now-inventory.confirmedAt)/1000):undefined} link={link} host={snapshot.host?.endpointHost} version={actionConnection?.hostVersion} generation={inventory.generation??undefined} unresolved={unresolvedCount} usage={displayContext.usage} now={now}/>
      <ActionHistory now={now} titleFor={receipt=>{const rows=inventory.agents.filter(agent=>agent.target.hostId===receipt.hostId&&agent.target.worktreeId===receipt.worktreeId&&agent.target.terminalId===receipt.paneKey);return rows.length===1?rows[0].title:undefined;}} receipts={actions.receipts} busy={actions.busy} onAcknowledge={id=>client.acknowledge(id)}/>
      {repairStatus?<View accessibilityRole={repairStatus.tone==='danger'?'alert':'summary'} style={{gap:8}}><Text style={S.heading}>{repairStatus.headline}</Text><Text style={S.noticeText}>{repairStatus.detail}</Text></View>:null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><View style={{width:'48%'}}><AppInfoButton/></View><View style={{width:'48%'}}><Pressable android_disableSound accessibilityRole="button" symbol="⇄" style={S.secondary} disabled={unpairing} accessibilityState={{disabled:unpairing}} onPress={()=>{if(!unpairingRef.current)setSheet('pair');}}><Text style={S.secondaryText}>{t('link.manage')}</Text></Pressable></View>{snapshot.host?<View style={{width:'48%'}}><Pressable android_disableSound accessibilityRole="button" symbol="⇄" disabled={unpairBusy} accessibilityState={{disabled:unpairBusy}} style={S.secondary} onPress={confirmUnpair}><Text style={S.secondaryText}>{t('link.unpair')}</Text></Pressable></View>:null}<View style={{width:'48%'}}><Pressable android_disableSound accessibilityRole="button" symbol="+" style={S.secondary} onPress={()=>{suppressDraftSheet.current=true;voice.cancelCapture();setSheet('agent');}}><Text style={S.secondaryText}>{t('agent.title')}</Text></Pressable></View></View>
      {nativeResult?<Text accessibilityRole="alert" style={S.noticeText}>{t(nativeResult)}</Text>:null}
      <LCD><Text style={S.noticeText}>{inventory.complete?t('live.confirmed'):t('deck.partial')}</Text></LCD>
      {!loaded?<Text style={S.noticeText}>{t('deck.storageLoading')}</Text>:null}
      {storageError?<View style={{gap:10}}><Text style={S.noticeText}>{t('deck.storageUnavailable')}</Text><Pressable android_disableSound accessibilityRole="button" style={S.secondary} disabled={captureTargetLocked} accessibilityState={{disabled:captureTargetLocked}} onPress={()=>{if(voice.isCapturing()){voice.notifyTargetChangeBlocked();return;}setRetry(value=>value+1);}}><Text style={S.secondaryText}>{t('common.retry')}</Text></Pressable></View>:null}
      {deck.restore==='blocked'?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} disabled={captureTargetLocked} accessibilityState={{disabled:captureTargetLocked}} onPress={()=>{if(voice.isCapturing()){voice.notifyTargetChangeBlocked();return;}Alert.alert(t('deck.resetTitle'),t('deck.resetHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('deck.resetSlots'),style:'destructive',onPress:()=>{if(voice.isCapturing()){voice.notifyTargetChangeBlocked();return;}if(deckRef.current.restore!=='blocked')return;void deckSlotStore.save(emptyDeckState(),Date.now()).then(ok=>{if(ok)setRetry(value=>value+1);else setStorageError(true);});}}]);}}><Text style={S.secondaryText}>{t('deck.resetSlots')}</Text></Pressable>:null}
      <JournalRecovery client={client} structured={structured}/>
      {unresolvedLaunches?<Text accessibilityRole="alert" style={S.noticeText}>{t('agent.unresolvedLaunches',{n:unresolvedLaunches})}</Text>:null}
      {launches.journal==='unavailable'?<Text accessibilityRole="alert" style={S.noticeText}>{t('agent.storage')}</Text>:null}
      {requests.receipts.map(receipt=><View key={receipt.operationId} style={{gap:8}}><Text selectable style={S.noticeText}>{receipt.status} · {receipt.worktreeId}{'\n'}{receipt.tabId}{'\n'}{receipt.sessionId}{'\n'}{receipt.itemId}</Text></View>)}
      {replySpeech&&replySpeech.phase!=='idle'?<View style={{gap:10}}><Text accessibilityLiveRegion="polite" style={S.noticeText}>{t(replySpeech.phase==='speaking'?'replySpeech.reading':replySpeech.phase==='uncertain'?'replySpeech.uncertain':'replySpeech.waiting')}</Text><Pressable android_disableSound accessibilityRole="button" style={[S.secondary,{minHeight:48}]} onPress={replySpeech.cancel}><Text style={S.secondaryText}>{t('replySpeech.stop')}</Text></Pressable></View>:null}<View onLayout={e=>{customizeY.current=e.nativeEvent.layout.y;}}><Customize showTitle={false} onInstruct={prompt=>{suppressDraftSheet.current=true;voice.cancelCapture();instructionOwner.setDraft(prompt);setSheet('agent');}}/></View><Text style={S.footer}>{t('card.signalCaution')}</Text><Text style={S.noticeText}>{[voice.reason,voice.snapshot.modelLabel].filter(Boolean).join(' · ')}</Text>

      {sharedInput.savedDraftCount?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>{const open=()=>sharedInput.openSavedDrafts();if(Platform.OS==='ios'){pendingInput.current=open;setSheet(null);}else{setSheet(null);open();}}}><Text style={S.secondaryText}>{t('input.savedDrafts',{n:sharedInput.savedDraftCount})}</Text></Pressable>:null}
      {inboxEntries.length?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>setSheet('voice')}><Text style={S.secondaryText}>{t('voice.savedDrafts',{n:inboxEntries.length})}</Text></Pressable>:null}
      {onSwitchDeck?<Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={()=>{setSheet(null);onSwitchDeck();}}><Text style={S.primaryText}>{t('mode.deck')}</Text></Pressable>:null}
      <Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={()=>{setSheet(null);onSwitchList();}}><Text style={S.primaryText}>{t('mode.list')}</Text></Pressable>
     </>:null}
     <OwnedAgentInstructionSheet owner={instructionOwner} client={hostDefaultAgentClient} active={visible&&sheet==='agent'} presentationKey={JSON.stringify([mode,locale,presentationRevision,actionConnection?.runtimeId,actionConnection?.generation,actionConnection?.hostId])} onConfirmationChange={open=>{if(open){suppressDraftSheet.current=true;voice.cancelCapture();}setAgentConfirming(open);}}/>
     {sheet==='list'?<>
      {inventory.live&&!inventory.complete?<Text style={S.noticeText}>{t('deck.partial')}</Text>:null}
      <ListSearch counts={Object.fromEntries((['all','attention','working','done','unknown'] as AgentSearchScope[]).map(scope=>[scope,filterAgents(list.map(row=>row.agent!),listQuery,scope).length]))} deck query={listQuery} onQuery={setListQuery} scope={listScope} onScope={setListScope}/>
      {!filteredList.length?<Text style={S.desc}>{t(list.length?'list.noMatches':'deck.none')}</Text>:null}
      <AgentKeyList live={inventory.live} width={frame.width} now={now} selectedKey={deck.selected} rows={filteredList.flatMap(({key,agent})=>agent?[{key,agent,slot:shownSlots.findIndex(slot=>slot?.key===key)<0?null:shownSlots.findIndex(slot=>slot?.key===key)+1}]:[])} onSelect={pick} onOpen={()=>setSheet('content')}/>

     </>:null}
     {sheet==='content'?(active?<><DeckContent viewportHeight={sheetViewportHeight>0?Math.max(1,sheetViewportHeight-12):undefined} position={view.display.position?.n} agent={active} live={inventory.live} host={snapshot.host?.endpointHost} version={actionConnection?.hostVersion} width={frame.width} height={frame.height}/>{voiceDraft?.text&&voiceDraft.destinationResolved&&voiceDraft.generation===inventory.generation&&voiceDraft.targetKey===bindKey(active)?<Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={()=>openInput(bindKey(active),'voice',voiceDraft.text)}><Text style={S.primaryText}>{t('send.voiceDraft')}</Text></Pressable>:null}</>:<Text style={S.desc}>{t('deck.noSelection')}</Text>):null}
     {sheet==='voice'&&voiceDraft?<>
      <Text accessibilityRole="header" style={S.heading}>{t('send.voiceDraft')}</Text>
      {voiceDraft.targetChanged?<Text accessibilityRole="alert" style={S.noticeText}>{t('voice.targetChanged')}</Text>:null}
      {draftTarget?<><Text selectable style={S.itemTitle}>{draftTarget.title}</Text>{identity(draftTarget)}</>:<Text selectable style={S.noticeText}>{t('input.targetUnconfirmed')}{'\n'}{voiceDraft.targetKey??'—'}</Text>}
      {inboxEntries.length>1?<View style={{gap:8}}><Text style={S.heading}>{t('voice.savedDrafts',{n:inboxEntries.length})}</Text>{inboxEntries.map((entry,index)=><Pressable android_disableSound key={entry.id} accessibilityRole="button" accessibilityState={{selected:entry.id===inbox.selectedId}} style={S.secondary} onPress={()=>publishInbox(selectVoiceDraft(inboxRef.current,entry.id))}><Text style={S.secondaryText}>{t('send.voiceDraft')} {index+1} · {entry.text.slice(0,80)}</Text></Pressable>)}</View>:null}
      <TextInput accessibilityLabel={t('send.editDraft')} value={voiceDraft.text} onChangeText={text=>{if(unaccepted)setUnaccepted({...unaccepted,text});else if(selectedDraft)publishInbox(editVoiceDraft(inboxRef.current,selectedDraft.id,text).state);}} multiline maxLength={32768} style={[S.desc,{borderWidth:1,borderColor:C.border,borderRadius:10,padding:14,minHeight:180,textAlignVertical:'top'}]}/>
      <Pressable android_disableSound accessibilityRole="button" disabled={!voiceDraft.destinationResolved||voiceDraft.generation!==inventory.generation||!voiceDraft.targetKey||!deck.present.includes(voiceDraft.targetKey)} style={[S.primary,{opacity:voiceDraft.destinationResolved&&voiceDraft.generation===inventory.generation&&!!voiceDraft.targetKey&&deck.present.includes(voiceDraft.targetKey)?1:0.45}]} onPress={()=>{if(voiceDraft.targetKey)openInput(voiceDraft.targetKey,'voice',withVoiceNote(voiceDraft.text),{autoPrepare:true});}}><Text style={S.primaryText}>{t('voice.send')}</Text></Pressable>
      <Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>setSheet('list')}><Text style={S.secondaryText}>{t('cmd.list')}</Text></Pressable>
      {selectedDraft||unaccepted?<Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={()=>{const id=unaccepted?null:selectedDraft!.id;Alert.alert(t('voice.discardTitle'),t('voice.discardHint'),[{text:t('send.cancel'),style:'cancel'},{text:t('voice.discard'),style:'destructive',onPress:()=>{if(id===null)setUnaccepted(undefined);else publishInbox(discardVoiceDraft(inboxRef.current,id));}}]);}}><Text style={S.secondaryText}>{t('voice.discard')}</Text></Pressable>:null}
     </>:null}
     {sheet==='pair'?<PairCard session={session} onPaired={()=>setSheet(null)}/>:null}
     {typeof sheet==='object'&&sheet!==null?<>
      <Text selectable style={S.detailTitle}>{explained?.title??'—'}</Text><Text style={S.desc}>{t('key.slot')} {sheet.slot+1} · !{inventory.uncertaintyKnown?(view.keys[sheet.slot]?.unresolved?'1':'0'):'—'}</Text>
      {explained?identity(explained):null}
      <Text style={S.noticeText}>{t('focus.project')}: {project?.name??'—'}</Text>
      {notice?<Text accessibilityRole="alert" style={S.noticeText}>{t(notice)}</Text>:null}
     </>:null}
    </ScrollView>
    {sheet!=='input'&&sheet!=='pair'&&!keyboardVisible?(physicalSheet?<DeckSheetFooter onLayout={e=>{const h=e.nativeEvent.layout.height;setSheetFooterHeight(v=>v===h?v:h);}} kind={sheet==='list'?'list':sheet==='content'?'content':settingsVisible?'settings':'status'} onSettings={()=>{setSettingsVisible(true);sheetScroll.current?.scrollTo({y:customizeY.current,animated:false});}} onHistory={()=>{setSettingsVisible(false);sheetScroll.current?.scrollTo({y:0,animated:false});}} onContent={()=>setSheet('content')} onClose={()=>setSheet(null)} pttProps={{testID:'deck-sheet-ptt',android_disableSound:true,accessibilityRole:'button',disabled:!voice.available||screenReader===null,accessibilityState:{disabled:!voice.available||screenReader===null},accessibilityLabel:[t(voice.snapshot.phase==='recording'?'ptt.recording':'ptt.hold'),voice.reason].join(' · '),onPress:screenReader===true?()=>{voice.pressIn();voice.pressOut();}:undefined,onPressIn:screenReader===false?voice.pressIn:undefined,onPressOut:screenReader===false?voice.pressOut:undefined}}/>:<SheetPTT label={t('ptt.talk')} testID="deck-sheet-ptt" android_disableSound accessibilityRole="button" disabled={!voice.available||screenReader===null} accessibilityState={{disabled:!voice.available||screenReader===null}} accessibilityLabel={[t(voice.snapshot.phase==='recording'?'ptt.recording':'ptt.hold'),voice.reason].join(' · ')} onPress={screenReader===true?()=>{voice.pressIn();voice.pressOut();}:undefined} onPressIn={screenReader===false?voice.pressIn:undefined} onPressOut={screenReader===false?voice.pressOut:undefined} style={[S.secondary,{flex:0,minHeight:52,marginHorizontal:18,marginBottom:12}]}><Text style={S.secondaryText}>{t(voice.snapshot.phase==='recording'?'ptt.recording':'ptt.hold')}</Text></SheetPTT>):null}
   </KeyboardAvoidingView></DeckSheetFrame></SheetSkinContext.Provider>
  </Modal>
  {phraseEditor&&visible?<PhraseEditor snapshot={phrase} onClose={()=>setPhraseEditor(false)}/>:null}
  {claudeDialog&&visible?<ClaudePromptSheet processingLabel={t(actions.progress==='observing'?'claude.checkingAnswer':actions.progress==='checking'?'confirm.checking':'confirm.processing')} {...claudeDialog} sending={claudeSubmitting} isCurrent={!!claudeDialog.review&&deck.selected===claudeReviewKey(claudeDialog.review)&&actionConnection?.hostId===claudeDialog.review.hostId&&actionConnection?.runtimeId===claudeDialog.review.runtimeId&&actionConnection?.generation===claudeDialog.review.generation&&mode==='deck'} onClose={closeClaude} onSubmit={(index,text)=>{void submitClaude(index,text);}}/>:null}
  <NativeConfirmationDialog confirmation={nativeDialog} presentationKey={nativePresentedScope.current} disabled={nativeSubmitting||nativeResult!==undefined||!actionConnection} cancelDisabled={nativeSubmitting} resultLabel={nativeDialog&&nativeResult?t(nativeResult):undefined} onConfirm={()=>{void submitNative(nativeDialog);}} onCancel={cancelNative}/>
 </View>;
}
const D=StyleSheet.create({body:{padding:20,gap:18,paddingBottom:40}});
