import { createAppLiveSession } from '../src/adapters/app-live-session';
import type { DirectTransportOptions } from '../src/adapters/direct-e2ee-transport';
import type { SecureValueStore } from '../src/adapters/pairing-store';
import type { RpcTransport } from '../src/adapters/read-only-orca-client';
import { PAIRING_OFFER_VERSION } from '../src/upstream/orca-1.4.245/src/shared/mobile-relay-pairing-offer';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const KEY = b64(new Uint8Array(32).map((_, i) => i + 1));
const TOKEN = 'SECRET-DEVICE-TOKEN-abcdef';
const code = btoa(JSON.stringify({
  v: PAIRING_OFFER_VERSION, endpoint: 'ws://192.168.0.60:6768', deviceToken: TOKEN, publicKeyB64: KEY,
  pairedDeviceId: 'phone-1', hostDescriptor: { installationId: '11111111-1111-4111-8111-111111111111' },
}));

class MemoryStore implements SecureValueStore {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
  async remove(key: string) { this.values.delete(key); }
}

const status = { runtimeId: 'rt', protocolVersion: 3, minCompatibleMobileVersion: 2, capabilities: [], graphStatus: 'ready' };
const clock = Date.parse('2026-11-02T06:00:00Z');
const ps = { worktrees: [{ worktreeId: 'wt-1', displayName: 'wt-1', preview: '', agents: [{ paneKey: 'agent-0', state: 'working', agentType: 'claude', taskTitle: 'task', interrupted: false, updatedAt: clock - 1000 }] }], totalCount: 1, truncated: false };
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

async function main() {
  const watchdog = setTimeout(() => { throw new Error('app-live-session test timed out'); }, 30_000);

  const seen: DirectTransportOptions[] = [];
  const closed: number[] = [];
  const connect = async (options: DirectTransportOptions): Promise<RpcTransport> => {
    seen.push(options);
    return {
      request: async (method: string) => (method === 'status.get' ? status : ps),
      close: () => { closed.push(seen.length); },
    };
  };
  const delay = () => new Promise<void>(() => undefined);
  const store = new MemoryStore();
  const session = createAppLiveSession(store, { connect, delay, now: () => clock, refreshMs: 5000 });
  const published: string[] = [];
  session.subscribe(snapshot => { published.push(JSON.stringify(snapshot)); });

  check(session.getSnapshot().phase === 'loading', 'the session starts by loading what is stored');
  check(await session.pair('not a pairing code') === 'invalid_code' && seen.length === 0, 'an invalid code dials nothing');
  check(await session.pair(code) === 'paired', 'a valid code pairs');
  await settle();
  check(session.getSnapshot().phase === 'live' && session.getSnapshot().agents[0]?.state === 'working', 'the session goes live through the supplied transport');

  const given = seen[0]!;
  check(Object.keys(given).sort().join() === 'deviceToken,endpoint,hostPublicKeyB64', 'the transport gets exactly the endpoint, the pinned key and the token, and no logger or other option');
  check(given.endpoint === 'ws://192.168.0.60:6768' && given.hostPublicKeyB64 === KEY && given.deviceToken === TOKEN, 'and exactly the values from the pairing');
  check(published.length > 1 && published.every(entry => !entry.includes(TOKEN) && !entry.includes(KEY)), 'no snapshot ever published holds the token or the host key');

  session.stop();
  check(closed.length === 1 && closed[0] === 1, 'stopping closes exactly the one transport that was open');

  // A new app launch finds the stored pairing and reconnects without a code.
  const relaunched = createAppLiveSession(store, { connect, delay, now: () => clock, refreshMs: 5000 });
  await relaunched.start(); await settle();
  check(relaunched.getSnapshot().phase === 'live' && (seen.length as number) === 2, 'a relaunch reconnects from the stored pairing');
  check(await relaunched.unpair() === 'unpaired' && store.values.size === 0, 'unpairing removes it');

  clearTimeout(watchdog);
  console.log(`PASS: ${count} app live session assertions (fake transport; no device, no network)`);
}

void main();
