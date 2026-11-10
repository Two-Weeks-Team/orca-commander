import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import type {LiveSession,LiveSnapshot} from '../adapters/live-session';
import type {DeckActionClient} from '../adapters/action-client';
import type {AgentSnapshot} from '../core/types';
import {bindKey} from '../core/deck-model';
import {useMessages} from '../i18n/provider';
import {ActionComposer,type CaptureVoiceReply} from './action-composer';
import {S} from './theme';
import {SheetHeader} from './sheet-header';

type Origin='typed'|'voice';
interface InputEntry {key:string;generation:number|null;original:AgentSnapshot;text:string;origin:Origin;epoch:number;contentRevision:number;retained:readonly{text:string;origin:Origin}[];incoming:ReadonlyMap<string,readonly string[]>;autoPrepareEpoch:number|null;autoPrepareConsumedEpoch:number|null;announced:readonly string[];isolated?:true}
interface InputPort {open(agent:AgentSnapshot,generation:number|null,origin?:Origin,text?:string,incomingId?:string,options?:{autoPrepare?:boolean;isolated?:boolean}):void;isOpen:boolean;savedDraftCount:number;openSavedDrafts():void;close():void;
 /** The local transcript identities carried by a draft the host accepted; their voice drafts are done. */
 onSent(listener:(incomingIds:readonly string[])=>void):()=>void}
/** Where the target lives, in the owner's words: project › worktree. Identifiers stay out of the owner's view. */
export const placeLabel=(agent:AgentSnapshot)=>[agent.place?.repo,agent.place?.worktreeName].filter(Boolean).join(' › ');
const Context=createContext<InputPort|null>(null);
const scope=(agent:AgentSnapshot,generation:number|null)=>JSON.stringify([bindKey(agent),generation]);
function createEntry(agent:AgentSnapshot,generation:number|null,origin:Origin):InputEntry {
 const original=Object.freeze({...agent,target:Object.freeze({...agent.target})});
 return {key:scope(original,generation),generation,original,text:'',origin,epoch:0,contentRevision:0,retained:[],incoming:new Map(),autoPrepareEpoch:null,autoPrepareConsumedEpoch:null,announced:[]};
}
function mergeIncoming(entry:InputEntry,origin:Origin,text:string|undefined,incomingId?:string):InputEntry {
 if(text===undefined)return entry;
 let incoming=entry.incoming;
 if(incomingId!==undefined){
  const versions=incoming.get(incomingId);
  // IDs are local transcript identities, not send keys. Never copy the same source version twice.
  if(versions?.includes(text))return entry;
  const next=new Map(incoming);next.set(incomingId,[...(versions??[]),text]);incoming=next;
  if(versions)return {...entry,incoming,epoch:entry.epoch+1,contentRevision:entry.contentRevision+1,retained:[...entry.retained,{text,origin}]};
 }
 if(!text)return incoming===entry.incoming?entry:{...entry,incoming};
 const combined=entry.text?entry.text+'\n'+text:text;
 if(combined.length>32768||combined.split(/\r\n|\r|\n/).length>200)return {...entry,incoming,epoch:entry.epoch+1,contentRevision:entry.contentRevision+1,retained:[...entry.retained,{text,origin}]};
 return {...entry,incoming,text:combined,origin:origin==='voice'||entry.origin==='voice'?'voice':'typed',epoch:entry.epoch+1,contentRevision:entry.contentRevision+1};
}
/** Positive pane rows are usable independently of unrelated incomplete source coverage. */
function currentAgent(entry:InputEntry,snapshot:LiveSnapshot,now:number):AgentSnapshot|null {
 const c=snapshot.connection,pane=snapshot.inventory,at=Date.parse(c?.lastConfirmedAt??'');
 if(entry.generation===null||!Number.isSafeInteger(entry.generation)||entry.generation<0||snapshot.phase!=='live'||!c?.paired||!c.online||c.hostId!==entry.original.target.hostId||snapshot.host?.hostId!==c.hostId||c.generation!==entry.generation||!Number.isFinite(now)||!Number.isFinite(at)||at<0)return null;
 if(!pane||pane.hostId!==c.hostId||pane.generation!==entry.generation||pane.observedAt!==at||!pane.worktreeIds.includes(entry.original.target.worktreeId)||pane.ambiguousPanes?.includes(JSON.stringify([entry.original.target.worktreeId,entry.original.target.terminalId])))return null;
 const rows=snapshot.agents.filter(row=>bindKey(row)===bindKey(entry.original));
 if(rows.length!==1)return null;
 const row=rows[0],a=entry.original.target,b=row.target;
 if(row.id!==entry.original.id||row.provider!==entry.original.provider||a.connectionGeneration!==entry.generation||b.connectionGeneration!==entry.generation||a.hostId!==b.hostId||a.worktreeId!==b.worktreeId||a.terminalId!==b.terminalId||a.dispatchId!==b.dispatchId)return null;
 return {...row,target:entry.original.target};
}
function savedEntries(entries:ReadonlyMap<string,InputEntry>):InputEntry[] {
 return [...entries.values()].filter(entry=>!entry.isolated&&(entry.text.length>0||entry.retained.length>0));
}
/** One presentation-independent owner draft sheet. No draft or target is written to storage. */
export function DeckInputProvider({snapshot,session,client,presentationKey,children,captureVoiceReply}:{snapshot:LiveSnapshot;session:LiveSession;client:DeckActionClient;presentationKey:string;children:ReactNode;captureVoiceReply?:CaptureVoiceReply}){
 const {t}=useMessages();
 const entries=useRef(new Map<string,InputEntry>());
 const isolatedSequence=useRef(0);
 const [selected,setSelected]=useState<string|null>(null),[savedVisible,setSavedVisible]=useState(false),[revision,setRevision]=useState(0),[clock,setClock]=useState(Date.now);
 const refresh=()=>setRevision(value=>value+1);
 const reviewOwner=useRef<{key:string;epoch:number}|undefined>(undefined),viewSequence=useRef(0);
 const reviewDismissal=useRef<object|undefined>(undefined),afterReviewDismissal=useRef<(()=>void)|undefined>(undefined);
 const [reviewVisible,setReviewVisible]=useState(false);
 const view=useRef({selected,savedVisible});view.current={selected,savedVisible};
 const discardShortcuts=(keep?:string)=>{for(const [key,entry] of entries.current)if(entry.isolated&&key!==keep)entries.current.delete(key);};
 const close=()=>{if(reviewDismissal.current)return;discardShortcuts();viewSequence.current++;reviewOwner.current=undefined;setReviewVisible(false);Keyboard.dismiss();setSavedVisible(false);setSelected(null);};
 const openSavedDrafts=()=>{if(reviewDismissal.current){viewSequence.current++;afterReviewDismissal.current=openSavedDrafts;return;}discardShortcuts();viewSequence.current++;reviewOwner.current=undefined;setReviewVisible(false);setSavedVisible(true);refresh();};
 const chooseSaved=(key:string)=>{if(!entries.current.has(key))return;if(reviewDismissal.current){viewSequence.current++;afterReviewDismissal.current=()=>chooseSaved(key);return;}discardShortcuts(key);viewSequence.current++;reviewOwner.current=undefined;setReviewVisible(false);setSelected(key);setSavedVisible(false);refresh();};
 const sentListeners=useRef(new Set<(incomingIds:readonly string[])=>void>());
 const onSent:InputPort['onSent']=listener=>{sentListeners.current.add(listener);return()=>{sentListeners.current.delete(listener);};};
 const open:InputPort['open']=(agent,generation,origin='typed',text,incomingId,options)=>{
  // A shortcut owns a fresh draft. Never append the phrase to, or overwrite, an owner's saved input.
  const key=options?.isolated?JSON.stringify([scope(agent,generation),'phrase',++isolatedSequence.current]):scope(agent,generation),previous=entries.current.get(key)??{...createEntry(agent,generation,origin),key,...(options?.isolated?{isolated:true as const}:{})};
  const merged=mergeIncoming(previous,origin,text,incomingId);
  // A finished dictation goes straight to the send confirmation; the editor stays one tap away.
  const automatic=!!options?.autoPrepare&&!!merged.text.trim()&&merged.autoPrepareConsumedEpoch!==merged.epoch;
  entries.current.set(key,automatic?{...merged,autoPrepareEpoch:merged.epoch}:merged);
  const show=()=>{discardShortcuts(key);viewSequence.current++;reviewOwner.current=automatic?{key,epoch:merged.epoch}:undefined;setReviewVisible(automatic);setSelected(key);setSavedVisible(false);refresh();};
  if(reviewDismissal.current){viewSequence.current++;afterReviewDismissal.current=show;refresh();return;}show();
 };
 const remember=(key:string,epoch:number,text:string,origin:Origin)=>{
  const current=entries.current.get(key);if(!current||current.epoch!==epoch)return;
  if(current.text===text&&current.origin===origin)return;
  entries.current.set(key,{...current,text,origin,contentRevision:current.contentRevision+1});refresh();
 };
 const consumeAutoPrepare=(key:string,epoch:number)=>{
  const current=entries.current.get(key);
  if(!current||current.epoch!==epoch||current.autoPrepareEpoch!==epoch)return false;
  entries.current.set(key,{...current,autoPrepareEpoch:null,autoPrepareConsumedEpoch:epoch});refresh();return true;
 };
 const captureAcceptedDraft=(key:string,epoch:number,text:string,origin:Origin):(()=>void)|undefined=>{
  const sent=entries.current.get(key);
  if(!sent||sent.epoch!==epoch||sent.text!==text||sent.origin!==origin)return;
  const contentRevision=sent.contentRevision,original=sent.original;
  return()=>{
   const current=entries.current.get(key);
   if(!current||current.original!==original||current.epoch!==epoch||current.contentRevision!==contentRevision||current.text!==text||current.origin!==origin)return;
   // Preserve the original target/generation and every retained transcript/source identity.
   // A currently reopened, unchanged child remounts with the cleared accepted body.
   // The transcript identities stay (a re-delivered transcript is never merged twice); each is announced once.
   const ids=[...current.incoming.keys()].filter(id=>!current.announced.includes(id));
   entries.current.set(key,{...current,text:'',origin:'typed',epoch:current.epoch+1,contentRevision:current.contentRevision+1,announced:[...current.announced,...ids]});refresh();
   if(ids.length)for(const listener of sentListeners.current){try{listener(ids);}catch{/* a listener must not own the draft */}}
  };
 };
 useEffect(()=>{if(selected===null)return;const timer=setInterval(()=>setClock(Date.now()),500);return()=>clearInterval(timer);},[selected]);
 const saved=savedEntries(entries.current),isOpen=savedVisible||selected!==null;
 const entry=selected===null?undefined:entries.current.get(selected);
 const fresh=entry?currentAgent(entry,snapshot,Date.now()):null;
 const pinned=entry&&reviewOwner.current?.key===entry.key?reviewOwner.current:undefined;
 const sequence=viewSequence.current;
 void revision;void clock;
 return <Context.Provider value={{open,isOpen,savedDraftCount:saved.length,openSavedDrafts,close,onSent}}>
  {children}
  <Modal visible={isOpen} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}>
   <SafeAreaProvider style={{flex:1}}><SafeAreaView style={[S.screen,reviewVisible?{backgroundColor:'transparent'}:undefined]} accessibilityViewIsModal>
    {/* Android Modal already requests adjustResize; iOS needs a single explicit inset owner. */}
    <KeyboardAvoidingView pointerEvents={reviewVisible?"none":"auto"} accessibilityElementsHidden={reviewVisible} importantForAccessibility={reviewVisible?"no-hide-descendants":"auto"} style={{flex:1,opacity:reviewVisible?0:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={0}>
    <SheetHeader testIDPrefix="deck-input" title={savedVisible?t('input.savedDrafts',{n:saved.length}):t('cmd.input')} onClose={close}/>
    <ScrollView style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} automaticallyAdjustKeyboardInsets={false} contentContainerStyle={{padding:18,gap:16,paddingBottom:48}}>
     {savedVisible?<>
      {entry?<Pressable android_disableSound={true} testID="deck-input-resume" accessibilityRole="button" style={[S.secondary,{flex:0,minHeight:48,padding:12}]} onPress={()=>setSavedVisible(false)}><Text style={S.secondaryText}>{t('send.editDraft')}</Text><Text style={S.desc}>{entry.original.title}</Text></Pressable>:null}
      {saved.map((draft,index)=><Pressable key={draft.key} testID={`deck-saved-input-${index}`} android_disableSound={true} accessibilityRole="button" accessibilityState={{selected:draft.key===selected}} style={[S.detail,{minHeight:48}]} onPress={()=>chooseSaved(draft.key)}>
       <Text style={S.itemTitle}>{draft.original.title}</Text>
       <Text style={S.noticeText}>{[draft.original.provider==='claude'?t('usage.claude'):draft.original.provider==='codex'?t('usage.codex'):null,placeLabel(draft.original)].filter(Boolean).join(' · ')}</Text>
       <Text style={S.noticeText}>{draft.origin==='voice'?t('send.voiceDraft'):t('confirm.typedDraft')}</Text>
       {draft.retained.length?<Text style={S.noticeText}>{t('input.retainedVoiceDraft')}: {draft.retained.length}</Text>:null}
      </Pressable>)}
      {!saved.length?<Text style={S.desc}>{t('input.noSavedDrafts')}</Text>:null}
     </>:entry?<>
      <Pressable android_disableSound={true} testID="deck-input-saved-list" accessibilityRole="button" style={[S.secondary,{flex:0,minHeight:48,padding:12}]} onPress={openSavedDrafts}><Text style={S.secondaryText}>{t('input.savedDrafts',{n:saved.length})}</Text></Pressable>
      {fresh||pinned?<ActionComposer key={JSON.stringify([entry.key,pinned?.epoch??entry.epoch])} agent={fresh??entry.original} session={session} client={client} captureVoiceReply={captureVoiceReply} live={!!fresh} onReviewResultClosing={()=>{if(viewSequence.current!==sequence||view.current.selected!==entry.key||view.current.savedVisible)return;const token={};reviewDismissal.current=token;setReviewVisible(false);return()=>{if(reviewDismissal.current!==token)return;reviewDismissal.current=undefined;const next=afterReviewDismissal.current;afterReviewDismissal.current=undefined;next?.();};}} onReviewResultClose={()=>{if(viewSequence.current===sequence&&view.current.selected===entry.key&&!view.current.savedVisible)close();}} onReviewVisibilityChange={open=>{if(viewSequence.current!==sequence||view.current.selected!==entry.key||view.current.savedVisible)return;if(open)reviewOwner.current??={key:entry.key,epoch:entry.epoch};else reviewOwner.current=undefined;setReviewVisible(open);}} initialText={entry.text} initialOrigin={entry.origin} presentationKey={presentationKey} onDraftChange={(text,origin)=>remember(entry.key,entry.epoch,text,origin)} captureAcceptedDraft={(text,origin)=>captureAcceptedDraft(entry.key,entry.epoch,text,origin)} autoPrepare={entry.autoPrepareEpoch===entry.epoch} consumeAutoPrepare={()=>consumeAutoPrepare(entry.key,entry.epoch)}/>:<View style={{gap:12}}>
       <Text selectable style={S.itemTitle}>{entry.original.title}</Text>
       <Text selectable style={S.noticeText}>{placeLabel(entry.original)||'—'}</Text>
       <Text style={S.noticeText}>{t('input.targetUnconfirmed')}</Text>
       <TextInput testID="deck-stale-input-draft" accessibilityLabel={t('input.draftLabel',{title:entry.original.title})} multiline value={entry.text} maxLength={32768} onChangeText={text=>remember(entry.key,entry.epoch,text,entry.text?entry.origin:'typed')} style={{minHeight:160,borderWidth:1,borderColor:'#64748B',borderRadius:10,padding:12,color:'#F9FAFB',fontSize:17,textAlignVertical:'top'}}/>
      </View>}
      {entry.retained.length?<Text accessibilityRole="alert" style={S.noticeText}>{t('input.appendOverflow')}</Text>:null}
      {entry.retained.map((draft,index)=><View key={index} style={S.detail}><Text accessibilityRole="header" style={S.heading}>{draft.origin==='voice'?t('input.retainedVoiceDraft'):t('confirm.typedDraft')}</Text><Text selectable style={S.desc}>{draft.text}</Text></View>)}
     </>:null}
    </ScrollView>
    </KeyboardAvoidingView>
    {reviewVisible?<View pointerEvents="none" accessible={false} style={{position:'absolute',bottom:28,left:18,right:18,alignItems:'center'}}><Text style={S.noticeText}>{t('input.checking')}</Text></View>:null}
   </SafeAreaView></SafeAreaProvider>
  </Modal>
 </Context.Provider>;
}
export function useDeckInput():InputPort {const value=useContext(Context);if(!value)throw new Error('deck_input_provider_missing');return value;}
