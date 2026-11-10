import { useMessages } from '../i18n/provider';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { LiveSession } from '../adapters/live-session';
import { previewPairing } from '../adapters/pairing-store';
import { createScanGate } from './scan-gate';
import { C, S } from './theme';
import { useAppActive } from './use-app-active';

type Candidate = { hostId: string; endpointHost: string };

const newGate = (found: (code: string, shown: Candidate) => void) => createScanGate(async data => {
  const shown = previewPairing(data);
  if (!shown) return 'invalid_code';
  found(data, { hostId: shown.hostId, endpointHost: shown.endpointHost });
  return 'candidate';
}, Date.now);

/**
 * Reads the pairing QR that the Orca desktop shows (Settings → Mobile). A QR that holds a pairing code does not pair by itself:
 * the user is shown where it points (host and port, a key digest) and confirms, because a QR can come from anywhere. The scanned
 * text lives only in a ref until then (never in state, never displayed, logged or opened as a link), frames are never stored,
 * the camera is only shown while the app is active, and it closes as soon as the pairing succeeds.
 */
export function QrScanner({ session, onClose, onPaired }: { session: LiveSession; onClose: () => void; onPaired?: () => void }) {
 const {t} = useMessages();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [message, setMessage] = useState<'qr.notPairing' | 'qr.unreadable' | 'qr.invalidCode' | 'pair.storageFailed' | 'pair.failed' | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [confirming, setConfirming] = useState(false);
  // iOS cannot dismiss this modal and the sheet under it in one pass (the screen stays black): close this one first and
  // let the sheet go only after it has gone.
  const [closingPaired, setClosingPaired] = useState(false);
  const finishPaired = () => { if (onPaired) onPaired(); else onClose(); };
  const codeRef = useRef<string | null>(null);
  const found = (code: string, shown: Candidate) => { codeRef.current = code; setMessage(null); setCandidate(shown); };
  const [gate, setGate] = useState(() => newGate(found));
  // Back from the Settings app after allowing the camera: the permission is read again, not only when the screen opens.
  const active = useAppActive(() => { void getPermission(); });
  useEffect(() => () => { codeRef.current = null; }, []);

  const onScanned = async ({ data }: { data: string }) => {
    const outcome = await gate.handle(data);
    if (outcome === 'not_pairing') setMessage('qr.notPairing');
    else if (outcome === 'failed') setMessage('qr.unreadable');
  };

  const confirm = async () => {
    const code = codeRef.current;
    if (!code || confirming) return;
    setConfirming(true);
    try {
      const result = await session.pair(code);
      if (result === 'paired') {
        codeRef.current = null;
        if (Platform.OS === 'ios') setClosingPaired(true); else finishPaired();
        return;
      }
      setMessage(result === 'invalid_code'
        ? 'qr.invalidCode'
        : 'pair.storageFailed');
    } catch {
      setMessage('pair.failed');
    } finally {
      setConfirming(false);
    }
  };

  const cancel = () => {
    codeRef.current = null;
    setCandidate(null);
    setMessage(null);
    setGate(newGate(found));
  };

  return <Modal visible={!closingPaired} animationType="slide" onRequestClose={onClose} onDismiss={closingPaired ? finishPaired : undefined}>
    <SafeAreaView style={S.screen}>
      <View style={{ flex: 1, padding: 18, gap: 14 }}>
        <Text style={S.detailTitle} accessibilityRole="header">{t('pair.qr')}</Text>
        {permission === null ? <Text style={S.desc}>{t('qr.checking')}</Text> : null}
        {permission !== null && !permission.granted ? <View style={S.detail}>
          <Text style={S.desc}>{t('qr.permissionReason')}</Text>
          {permission.canAskAgain
            ? <Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={() => { void requestPermission(); }}><Text style={S.primaryText}>{t('qr.allowCamera')}</Text></Pressable>
            : <Pressable android_disableSound accessibilityRole="button" style={S.primary} onPress={() => { void Linking.openSettings(); }}><Text style={S.primaryText}>{t('qr.settings')}</Text></Pressable>}
        </View> : null}
        {candidate ? <View style={S.detail}>
          <Text style={S.detailTitle} accessibilityRole="header">{t('qr.confirmHost')}</Text>
          <Text style={S.desc}>{t('qr.address',{address:candidate.endpointHost})}</Text>
          <Text style={S.desc}>{t('qr.hostDigest',{digest:candidate.hostId.slice(0,8)})}</Text>
          <View style={S.notice}><Text style={S.noticeText}>{t('qr.hostWarning')}</Text></View>
          <Pressable android_disableSound accessibilityRole="button" accessibilityState={{ disabled: confirming }} style={[S.primary, confirming && { opacity: 0.5 }]} onPress={() => { void confirm(); }}>
            <Text style={S.primaryText}>{confirming ? t('live.connecting') : t('qr.connect')}</Text></Pressable>
          <Pressable android_disableSound accessibilityRole="button" style={[S.secondary, { flex: 0 }]} onPress={cancel}><Text style={S.secondaryText}>{t('send.cancel')}</Text></Pressable>
        </View> : null}
        {permission?.granted && !candidate ? <>
          <Text style={S.desc}>{t('qr.frameInstructions')}</Text>
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
            {active ? <CameraView
              style={{ flex: 1 }}
              facing="back"
              accessibilityLabel={t('qr.cameraLabel')}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={event => { void onScanned(event); }}
            /> : null}
          </View>
          <Text style={S.footer}>{t('qr.scanHint')}</Text>
        </> : null}
        {message ? <View style={S.notice}><Text style={S.noticeText} accessibilityRole="alert">{t(message)}</Text></View> : null}
        <Pressable android_disableSound accessibilityRole="button" style={[S.secondary, { flex: 0 }]} onPress={onClose}><Text style={S.secondaryText}>{t('common.close')}</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}
