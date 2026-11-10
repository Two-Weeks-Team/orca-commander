import { useMessages } from '../i18n/provider';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { LiveSession, LiveSnapshot } from '../adapters/live-session';
import { describeLiveView } from './live-view';
import { PairCard } from './pair-card';
import type { StatusTone } from './live-status';
import {useDeckInput} from './deck-input-sheet';
import { ActionJournalStatus } from './action-journal-status';
import type {StructuredActionClient} from '../adapters/structured-action-client';
import {StructuredRequests} from './structured-requests';
import { ActionHistory } from './action-history';
import type { DeckActionClient } from '../adapters/action-client';
import { C, Metric, S, color, stateName } from './theme';
import { useNow } from './use-now';
import { buildDecisionCard, buildDecisionCards, buildDecisionOverview, filterAgents, type AgentSearchScope } from './decision-card-model';
import { DecisionCard, DecisionQueueItem } from './decision-card';
import { AppInfoButton } from './app-info';

const toneColors: Record<StatusTone, { border: string; bg: string; text: string }> = {
  neutral: { border: '#475569', bg: '#1E293B', text: C.muted },
  ok: { border: '#166534', bg: '#052E16', text: '#86EFAC' },
  warn: { border: '#8B5E18', bg: '#413114', text: '#FDE68A' },
  danger: { border: '#9F1239', bg: '#4C0519', text: '#FDA4AF' },
};

/**
 * The paired decision screen. What it shows is decided by `describeLiveView`: while a read is not confirmed (or has not
 * been refreshed for too long) every agent is unknown, the counters say "—" and the banner says so. Nothing here can
 * grant approval from an unverified status signal.
 */
export function LiveHome({ snapshot, session, client, structured,active:isVisible=true,managedReader=false }: {active?:boolean;managedReader?:boolean;snapshot: LiveSnapshot; session: LiveSession; client: DeckActionClient; structured:StructuredActionClient }) {
 const {t} = useMessages();
 const sharedInput=useDeckInput();
  const actions=useSyncExternalStore(listener=>client.subscribe(listener),()=>client.getSnapshot());
  // Subscribe to a primitive count: unrelated progressive native reads need not redraw this whole list.
  useSyncExternalStore(listener=>structured.subscribe(listener),()=>buildDecisionOverview([],structured.getSnapshot(),true).count);
  const now = useNow(snapshot.phase === 'live');
  const view = describeLiveView(snapshot, now,t);
  const { status, agents, counts } = view;
  const tone = toneColors[status.tone];
  const [query,setQuery]=useState(''),[scope,setScope]=useState<AgentSearchScope>('all');
  const filteredAgents=filterAgents(agents,query,scope);
  const [selected, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const cardTop = useRef(0);
  const openInput=(id:string)=>{if(actions.busy)return;const agent=agents.find(agent=>agent.id===id);if(agent)sharedInput.open(agent,snapshot.connection?.generation??null);};
  const cards = buildDecisionCards(agents,status.live,now,t);
  const overview=buildDecisionOverview(cards,structured.getSnapshot(),status.live);
  const active = cards.find(item => item.key === selected) ?? cards[0];

  const confirmUnpair = () => Alert.alert(
    t('link.unpair'),
    t('live.unpairExplanation'),
    [{ text: t('send.cancel'), style: 'cancel' }, { text: t('link.unpair'), style: 'destructive', onPress: () => { void session.unpair(); } }],
  );

  return <SafeAreaView style={S.screen}>
    <StatusBar style="light" />
    <ScrollView ref={scroll} contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
      <View style={[S.rowSpread,{alignItems:'center',flexWrap:'wrap',gap:8}]}><Text style={S.brand}>ORCA DECK</Text><AppInfoButton /></View>
      <Text style={S.sub}>Human Decision Console</Text>
      <View style={[S.banner, { borderColor: tone.border, backgroundColor: tone.bg }]} accessibilityRole="summary" accessibilityLabel={status.headline}>
        <Text style={[S.bannerText, { color: tone.text }]}>{status.headline}</Text>
        {status.detail ? <Text style={[S.noticeText, { color: tone.text, textAlign: 'center', marginTop: 4 }]}>{status.detail}</Text> : null}
      </View>

      {view.needsRepair ? <PairCard session={session} /> : null}

      <View style={S.stats}>
        <Metric label={t('live.decisionCards')} value={counts ? overview.count??'—' : '—'} tint={C.yellow} />
        <Metric label={t('state.working')} value={counts ? counts.working : '—'} tint={C.blue} />
        <Metric label={t('state.done')} value={counts ? counts.done : '—'} tint={C.green} />
        <Metric label={t('common.unconfirmedValue')} value={view.unknownCount > 0 || counts ? view.unknownCount : '—'} tint={C.muted} />
      </View>

      <ActionJournalStatus state={actions} onReload={()=>{void client.reloadJournal();}} />
      <ActionHistory kind="unresolved" receipts={actions.receipts} busy={actions.busy} onAcknowledge={id=>client.acknowledge(id)} />
      <StructuredRequests active={isVisible} externallyManaged={managedReader} client={structured} session={session} onEditorOpen={sharedInput.close} live={status.live} generation={snapshot.connection?.generation} otherBusy={actions.busy} />
      <Text style={S.heading}>{t('live.reviewNow')}</Text>
      {!status.live ? <Text style={S.desc}>{t('live.hiddenUntilConnected')}</Text> : null}
      {status.live && overview.empty ? <Text style={S.desc}>{t('live.noCards')}</Text> : null}
      {status.live && cards.length===0 && overview.nativeCount>0 ? <Text style={S.desc}>{t('live.nativeCardsAbove')}</Text> : null}
      {active ? <View onLayout={event=>{cardTop.current=event.nativeEvent.layout.y;}}><DecisionCard key={active.key} card={active} />
        <Pressable android_disableSound accessibilityRole="button" disabled={actions.busy} style={[S.secondary,{padding:14,marginTop:10}]} onPress={()=>{const a=agents.find(agent=>buildDecisionCard(agent,status.live,now,t).key===active.key);if(a)openInput(a.id);}}><Text style={S.secondaryText}>{t('live.writeToWork')}</Text></Pressable></View> : null}
      {cards.length > 1 ? <Text style={S.heading}>{t('live.workList',{n:cards.length})}</Text> : null}
      {cards.length > 1 ? cards.map(card=><DecisionQueueItem key={card.key} card={card} selected={active?.key===card.key}
        onSelect={()=>{setSelected(card.key);scroll.current?.scrollTo({y:Math.max(0,cardTop.current-12),animated:true});}} />) : null}

      <ActionHistory kind="settled" receipts={actions.receipts} busy={actions.busy} onAcknowledge={id=>client.acknowledge(id)} />
      {agents.length > 0 ? <>
        <Text style={S.heading}>{t('live.agentCount',{shown:filteredAgents.length,total:agents.length})}</Text>
        <TextInput testID="deck-agent-search" accessibilityLabel={t('live.searchLabel')} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" maxLength={256} placeholder={t('live.searchPlaceholder')} placeholderTextColor={C.muted} style={{minHeight:52,borderColor:'#64748B',borderWidth:1,borderRadius:12,padding:12,color:C.white,fontSize:17}} />
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([['all',t('list.all')],['attention',t('demo.attention')],['working',t('state.working')],['done',t('state.done')],['unknown',t('common.unconfirmedValue')]] as const).map(([value,label])=><Pressable android_disableSound key={value} accessibilityRole="button" accessibilityState={{selected:scope===value}} style={[S.secondary,{flex:0,paddingHorizontal:14,borderColor:scope===value?C.yellow:'#64748B'}]} onPress={()=>setScope(value)}><Text style={S.secondaryText}>{label}</Text></Pressable>)}</View>
        {!filteredAgents.length?<Text style={S.noticeText}>{t('live.noMatches')}</Text>:null}
        {filteredAgents.map(agent => ({agent,card:buildDecisionCard(agent,status.live,now,t)})).map(({agent,card}) => <View key={card.key} style={[S.queueItem, { minHeight: 0 }]}>
          <View style={[S.rowSpread,{flexWrap:'wrap',gap:8}]}><Text style={S.provider}>{card.provider.toUpperCase()}</Text>
            <Text style={[S.status, { color: color(card.state) }]}>{stateName(card.state,t)}</Text></View>
          <Text style={S.itemTitle}>{card.title}</Text>
          <Pressable android_disableSound accessibilityRole="button" disabled={actions.busy} testID={`deck-input:${agent.id}`} accessibilityLabel={t('live.writeLabel',{provider:card.provider,title:card.title})} style={[S.secondary,{marginTop:8,padding:10}]} onPress={()=>openInput(agent.id)}><Text style={S.secondaryText}>{t('live.writeInput')}</Text></Pressable>
        </View>)}
      </> : null}

      {snapshot.phase === 'stopped' ? <Pressable android_disableSound accessibilityRole="button" style={S.secondary} onPress={() => { void session.start(); }}>
        <Text style={S.secondaryText}>{view.canRetry ? t('common.retry') : t('link.reconnect')}</Text></Pressable> : null}

      <Pressable android_disableSound accessibilityRole="button" style={S.secondary} disabled={actions.busy} onPress={confirmUnpair}>
        <Text style={S.secondaryText}>{t('link.unpair')}</Text></Pressable>
      <Text style={S.footer}>{t('live.footer')}</Text>
    </ScrollView>
  </SafeAreaView>;
}
