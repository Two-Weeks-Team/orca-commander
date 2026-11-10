import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { S } from './theme';

/** A screen with one message and at most one action. It shows no agents and no mock data. */
export function NoticeScreen({ title, detail, actionLabel, onAction }: { title: string; detail?: string; actionLabel?: string; onAction?: () => void }) {
  return <SafeAreaView style={S.screen}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={S.container}>
      <Text style={S.brand}>ORCA DECK</Text>
      <View style={S.detail}>
        <Text style={S.detailTitle} accessibilityRole="header">{title}</Text>
        {detail ? <Text style={S.desc}>{detail}</Text> : null}
        {actionLabel && onAction ? <Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={onAction}>
          <Text style={S.primaryText}>{actionLabel}</Text></Pressable> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
