import { useMessages } from '../i18n/provider';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DecisionCardModel } from './decision-card-model';
import { C, S, color, stateName } from './theme';

/** Read-only explanation and local provenance disclosure. It receives no session or command callback. */
export function DecisionCard({card,demo=false}: {card:DecisionCardModel;demo?:boolean}) {
 const {t} = useMessages();
  const [expanded,setExpanded] = useState(false);
  const [summaryExpanded,setSummaryExpanded]=useState(false);
  const longSummary=card.summary.length>600;
  return <View style={[S.detail,{borderColor:color(card.state),gap:16}]}>
    <View style={[S.rowSpread,{flexWrap:'wrap',gap:8}]}>
      <Text style={S.provider}>{card.provider.toUpperCase()}</Text>
      <Text style={[S.status,{color:color(card.state)}]}>{stateName(card.state,t)}</Text>
    </View>
    <Text style={S.detailTitle} accessibilityRole="header">{card.title}</Text>
    <Text style={S.desc}>{card.reason}</Text>
    <Text style={S.footer}>{demo ? t('card.demoSource') : card.freshness} · {demo ? t('card.demoState') : card.stateAge}</Text>
    {card.occurrences > 1 ? <Text style={S.noticeText}>{t('card.observations',{n:card.occurrences})}</Text> : null}
    <View style={S.notice}>
      <Text style={[S.status,{color:C.yellow}]} accessibilityRole="header">{t('card.evidenceTitle')}</Text>
      <Text style={S.noticeText}>{demo ? t('card.demoEvidence') : card.evidence}</Text>
    </View>
    <Text style={S.heading}>{t('card.checkTitle')}</Text>
    {longSummary?<Pressable android_disableSound accessibilityRole="button" accessibilityState={{expanded:summaryExpanded}} style={[S.secondary,{padding:14}]} onPress={()=>setSummaryExpanded(v=>!v)}><Text style={S.secondaryText}>{summaryExpanded?t('card.collapseSummary'):t('card.expandSummary')}</Text></Pressable>:null}
    <Text selectable numberOfLines={longSummary&&!summaryExpanded?3:undefined} style={S.desc}>{card.summary}</Text>
    <Text style={S.noticeText}>{card.impact}</Text>
    <View style={S.notice}>
      <Text style={[S.status,{color:C.blue}]} accessibilityRole="header">{t('card.offlineGuide')}</Text>
      <Text style={S.desc}>{card.advice.guidance}</Text>
    </View>
    <Pressable android_disableSound accessibilityRole="button" accessibilityState={{expanded}} accessibilityLabel={expanded?t('card.collapseSource'):t('card.expandSource')}
      style={[S.secondary,{flex:0,padding:14}]} onPress={()=>setExpanded(value=>!value)}>
      <Text style={S.secondaryText}>{expanded?t('card.collapseSource'):t('card.expandSource')}</Text>
    </Pressable>
    {expanded ? <View style={{gap:10}}>
      {card.provenance.map(item=><View key={item.label} style={{gap:3}}>
        <Text style={S.provider}>{item.label}</Text><Text style={S.noticeText}>{item.value}</Text>
      </View>)}
      <Text style={S.footer}>{t('card.sourceDescription')}</Text>
    </View> : null}
    <Text style={S.footer}>{demo?t('card.demoActions'):t('card.signalCaution')}</Text>
  </View>;
}

export function DecisionQueueItem({card,selected,onSelect}: {card:DecisionCardModel;selected:boolean;onSelect:()=>void}) {
 const {t}=useMessages();
  return <Pressable android_disableSound accessibilityRole="button" accessibilityState={{selected}}
    accessibilityLabel={t('card.openLabel',{provider:card.provider,title:card.title,state:stateName(card.state,t)})}
    style={[S.queueItem,selected&&S.selected]} onPress={onSelect}>
    <View style={[S.rowSpread,{flexWrap:'wrap',gap:8}]}><Text style={S.provider}>{card.provider.toUpperCase()}</Text>
      <Text style={[S.status,{color:color(card.state)}]}>{stateName(card.state,t)}</Text></View>
    <Text style={S.itemTitle}>{card.title}</Text>
    <Text style={S.noticeText}>{card.reason}</Text>
  </Pressable>;
}
