import { useMessages } from '../i18n/provider';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getOverview } from '../core/attention';
import { createMockAgents } from '../core/mock';
import { C, Metric, S } from './theme';
import { buildDecisionCards } from './decision-card-model';
import { DecisionCard, DecisionQueueItem } from './decision-card';
import { AppInfoButton } from './app-info';

/** Fixed samples only. All interactions disclose local detail; no simulated send/approval controls. */
export function DemoHome({ header }: { header?: ReactNode }) {
 const {t} = useMessages();
  const [selected,setSelected]=useState<string|null>(null);
  const scroll=useRef<ScrollView>(null);
  const cardTop=useRef(0);
  const agents=useMemo(()=>createMockAgents(t),[t]);
  const cards=useMemo(()=>buildDecisionCards(agents,true,Date.now(),t),[agents,t]);
  const overview=useMemo(()=>getOverview(agents),[agents]);
  const active=cards.find(card=>card.key===selected)??cards[0];
  return <SafeAreaView style={S.screen}>
    <StatusBar style="light"/>
    <ScrollView ref={scroll} contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
      <View style={[S.rowSpread,{alignItems:'center',flexWrap:'wrap',gap:8}]}><Text style={S.brand}>ORCA DECK</Text><AppInfoButton /></View>
      <Text style={S.sub}>{t('demo.subtitle')}</Text>
      {header}
      <View style={S.banner}><Text style={S.bannerText}>{t('demo.banner')}</Text></View>
      <View style={S.stats}>
        <Metric label={t('demo.attention')} value={cards.length} tint={C.yellow}/>
        <Metric label={t('state.working')} value={overview.working} tint={C.blue}/>
        <Metric label={t('state.done')} value={overview.done} tint={C.green}/>
      </View>
      <Text style={S.heading}>{t('demo.cardExamples')}</Text>
      {active ? <View onLayout={event=>{cardTop.current=event.nativeEvent.layout.y;}}><DecisionCard key={active.key} card={active} demo /></View> : null}
      <Text style={S.heading}>{t('demo.otherExamples')}</Text>
      {cards.map(card=><DecisionQueueItem key={card.key} card={card} selected={active?.key===card.key}
        onSelect={()=>{setSelected(card.key);scroll.current?.scrollTo({y:Math.max(0,cardTop.current-12),animated:true});}} />)}
      <Text style={S.footer}>{t('demo.footer')}</Text>
    </ScrollView>
  </SafeAreaView>;
}
