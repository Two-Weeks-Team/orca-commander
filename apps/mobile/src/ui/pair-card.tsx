import { useMessages } from '../i18n/provider';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { LiveSession } from '../adapters/live-session';
import { QrScanner } from './qr-scanner';
import { C, S } from './theme';

// Its own style: the secure field drew nothing when it borrowed the button style. Colour and size are explicit.
const input = { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#64748B', paddingHorizontal: 12, color: C.white, fontSize: 16 } as const;

/**
 * Pairing by pasting the code that the Orca desktop shows. The code contains the device token, so the field hides its
 * contents, is cleared after use, and an invalid code is reported without echoing any of it.
 */
/** `onPaired` runs once after a successful pairing so the caller can leave the pairing screen. */
export function PairCard({ session, onPaired }: { session: LiveSession; onPaired?: () => void }) {
 const {t} = useMessages();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<'pair.storageFailed' | 'pair.failed' | 'pair.invalidCode' | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await session.pair(code);
      if (result === 'paired') { setCode(''); onPaired?.(); }
      else setMessage(result === 'invalid_code'
        ? 'pair.invalidCode'
        : 'pair.storageFailed');
    } catch {
      setMessage('pair.failed');
    } finally {
      setBusy(false);
    }
  };

  return <View style={S.detail}>
    <Text style={S.detailTitle}>{t('pair.title')}</Text>
    <Text style={S.desc}>{t('pair.instructions')}</Text>
    <Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={() => setScanning(true)}>
      <Text style={S.primaryText}>{t('pair.qr')}</Text>
    </Pressable>
    {scanning ? <QrScanner session={session} onClose={() => setScanning(false)} onPaired={() => { setScanning(false); onPaired?.(); }} /> : null}
    <TextInput
      accessibilityLabel={t('pair.code')}
      style={input}
      value={code}
      onChangeText={setCode}
      placeholder={t('pair.paste')}
      placeholderTextColor="#94A3B8"
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      textContentType="none"
      returnKeyType="go"
      onSubmitEditing={() => { void submit(); }}
    />
    {code ? <Text style={S.noticeText}>{t('pair.entered',{n:code.trim().length})}</Text> : null}
    {message ? <View style={S.notice}><Text style={S.noticeText} accessibilityRole="alert">{t(message)}</Text></View> : null}
    <Pressable android_disableSound accessibilityRole="button" accessibilityState={{ disabled: busy || !code.trim() }} style={[S.primary, (busy || !code.trim()) && { opacity: 0.5 }]} onPress={submit}>
      <Text style={S.primaryText}>{busy ? t('live.connecting') : t('pair.withCode')}</Text>
    </Pressable>
  </View>;
}
