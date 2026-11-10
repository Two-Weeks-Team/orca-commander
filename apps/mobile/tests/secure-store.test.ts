import { createExpoSecureValueStore } from '../src/adapters/secure-store-core';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

// The platform call is faked: this proves which options reach it, because nothing else would notice them missing.
const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6; // a stand-in for the native constant
type Call = { op: string; key: string; value?: string; options: Record<string, unknown> };

async function main() {
  const calls: Call[] = [];
  const memory = new Map<string, string>();
  const api = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    getItemAsync: async (key: string, options: Record<string, unknown>) => { calls.push({ op: 'get', key, options }); return memory.get(key) ?? null; },
    setItemAsync: async (key: string, value: string, options: Record<string, unknown>) => { calls.push({ op: 'set', key, value, options }); memory.set(key, value); },
    deleteItemAsync: async (key: string, options: Record<string, unknown>) => { calls.push({ op: 'delete', key, options }); memory.delete(key); },
  };
  const store = createExpoSecureValueStore(api);

  await store.set('k', 'v');
  check(await store.get('k') === 'v', 'a value round-trips through the platform store');
  await store.remove('k');
  check(await store.get('k') === null, 'and is removed');

  check(calls.length === 4, 'every call reaches the platform store');
  for (const call of calls) {
    check(call.options.keychainAccessible === WHEN_UNLOCKED_THIS_DEVICE_ONLY, `${call.op}: readable only while unlocked, never backed up or migrated to another device`);
    check(call.options.keychainService === 'orca-deck', `${call.op}: the app's own Keychain service, not the shared default`);
  }

  console.log(`PASS: ${count} secure store assertions (faked platform store; no device)`);
}

void main();
