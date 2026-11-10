import type { LiveSession } from '../adapters/live-session';

/** The part of React Native's AppState that is used; a fake can stand in for it in tests. */
export interface AppStateSource {
  currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/**
 * Ties the live connection to the app lifecycle. Closed in the background, re-opened when the app is active again.
 * `inactive` is ignored on purpose: iOS reports it while a system dialog (such as the Local Network prompt) is up, and
 * tearing down then would fail the very connection the dialog is asking about. Coming back is a `resume()`, an OS event:
 * the session refuses it when the user must act (a refused token), so no foreground presents that token again.
 * Returns the unbind function (unmount).
 */
export function bindSessionLifecycle(session: Pick<LiveSession, 'start' | 'resume' | 'stop'>, appState: AppStateSource): () => void {
  // An app that was started in the background does not connect from there; it connects when it becomes active.
  if (appState.currentState !== 'background') void session.start();
  const subscription = appState.addEventListener('change', state => {
    if (state === 'background') session.stop();
    else if (state === 'active') void session.resume();
  });
  return () => {
    subscription.remove();
    session.stop();
  };
}
