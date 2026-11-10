import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { LiveSession, LiveSnapshot } from '../adapters/live-session';
import { bindSessionLifecycle } from './lifecycle';

/** Subscribes a screen to the live session and ties its connection to the app lifecycle (see `bindSessionLifecycle`). */
export function useLiveSession(session: LiveSession): LiveSnapshot {
  const snapshot = useSyncExternalStore(
    listener => session.subscribe(listener),
    () => session.getSnapshot(),
  );
  useEffect(() => bindSessionLifecycle(session, AppState), [session]);
  return snapshot;
}
