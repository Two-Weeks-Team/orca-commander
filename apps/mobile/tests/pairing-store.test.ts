import { describeHost, hostIdFromPublicKey, PairingStore, PAIRING_STORAGE_KEY, pairedHostFromCode, PairingStoreError, previewPairing } from '../src/adapters/pairing-store';
import type { PairedHost, SecureValueStore } from '../src/adapters/pairing-store';
import { PAIRING_OFFER_VERSION } from '../src/upstream/orca-1.4.245/src/shared/mobile-relay-pairing-offer';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }
async function rejectsStore(promise: Promise<unknown>, code: string, message: string): Promise<void> {
  count++;
  try { await promise; } catch (error) {
    if (error instanceof PairingStoreError && error.code === code) return;
    throw new Error(`${message}: expected ${code}, got ${String(error)}`);
  }
  throw new Error(`${message}: expected rejection ${code}`);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const KEY = b64(new Uint8Array(32).map((_, i) => i + 1));
const OTHER_KEY = b64(new Uint8Array(32).map((_, i) => 200 - i));
const TOKEN = 'SECRET-DEVICE-TOKEN-abcdef';
const now = Date.parse('2026-11-02T06:00:00Z');
const encode = (offer: Record<string, unknown>) => btoa(JSON.stringify(offer));
const offer = (extra: Record<string, unknown> = {}) => ({ v: PAIRING_OFFER_VERSION, endpoint: 'ws://192.168.0.60:6768', deviceToken: TOKEN, publicKeyB64: KEY, ...extra });

class MemoryStore implements SecureValueStore {
  values = new Map<string, string>();
  fail = false;
  async get(key: string) { if (this.fail) throw new Error(`keychain locked ${TOKEN}`); return this.values.get(key) ?? null; }
  async set(key: string, value: string) { if (this.fail) throw new Error(`keychain locked ${TOKEN}`); this.values.set(key, value); }
  async remove(key: string) { if (this.fail) throw new Error('keychain locked'); this.values.delete(key); }
}

async function main() {
  // Pairing code -> the minimum Deck keeps.
  const host = pairedHostFromCode(encode(offer({ pairedDeviceId: 'phone-1', hostDescriptor: { installationId: '11111111-1111-4111-8111-111111111111' } })), now);
  check(host !== null, 'a valid offer becomes a paired host');
  if (host) {
    check(host.endpoint === 'ws://192.168.0.60:6768' && host.hostPublicKeyB64 === KEY && host.deviceToken === TOKEN, 'endpoint, pinned key and token are kept');
    check(host.pairedAt === new Date(now).toISOString(), 'the pairing time is recorded');
    check(/^[0-9a-f]{32}$/.test(host.hostId), 'the host id is a 32-hex digest of the pinned key');
    check(Object.keys(host).sort().join() === 'deviceToken,endpoint,hostId,hostPublicKeyB64,pairedAt', 'nothing else from the offer is stored (no descriptor, no device id, no relay credentials)');
  }
  check(hostIdFromPublicKey(KEY) === hostIdFromPublicKey(KEY) && hostIdFromPublicKey(KEY) !== hostIdFromPublicKey(OTHER_KEY), 'the host id is stable and key-specific');
  const code = encode(offer());
  check(pairedHostFromCode(`orca://pair?code=${encodeURIComponent(code)}`, now)?.deviceToken === TOKEN, 'the deep-link form orca://pair?code= is accepted');
  check(pairedHostFromCode(`  ${code}\n`, now)?.deviceToken === TOKEN, 'surrounding whitespace is ignored');

  // What the desktop's QR really carries: orca://pair?code=<base64url, no padding>. Build an offer whose base64 needs '+' and '/'
  // (so base64url uses '-' and '_') and whose padding is stripped, as the original encoder does.
  {
    const tricky = offer({ endpoint: 'ws://192.168.0.60:6768', deviceToken: '>>>???~~~' + TOKEN });
    const standard = encode(tricky);
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    check(/[-_]/.test(urlSafe) && standard !== urlSafe, 'the fixture really needs the url-safe alphabet and stripped padding');
    check(pairedHostFromCode(`orca://pair?code=${urlSafe}`, now)?.deviceToken === '>>>???~~~' + TOKEN, 'the desktop QR form (url-safe, unpadded) pairs');
    check(pairedHostFromCode(`orca://pair/?code=${urlSafe}`, now) !== null, 'the form with a trailing slash pairs');
    check(pairedHostFromCode(`ORCA://PAIR?code=${urlSafe}`, now) !== null, 'the scheme and host are case-insensitive, as in the original');
    check(pairedHostFromCode(`orca://pair#${urlSafe}`, now)?.deviceToken === '>>>???~~~' + TOKEN, 'the original also accepts the code in the fragment');
    check(pairedHostFromCode(`orca://pair?x=1&code=${urlSafe}#ignored`, now) !== null, 'extra query parameters and a fragment do not hide the code');
    check(pairedHostFromCode(`orca://pairing?code=${urlSafe}`, now) === null, 'only the exact host "pair" is accepted (orca://pairing is not)');
    check(pairedHostFromCode(`orca://pair/extra?code=${urlSafe}`, now) === null, 'and no extra path');
    check(pairedHostFromCode(`orca://other?code=${urlSafe}`, now) === null, 'other hosts are refused');
    check(pairedHostFromCode('orca://pair', now) === null && pairedHostFromCode('orca://pair?code=', now) === null, 'a link without a code is refused');
  }
  check(pairedHostFromCode(`https://example.com/pair?code=${encodeURIComponent(code)}`, now) === null, 'only the orca deep link scheme is accepted');
  check(pairedHostFromCode('not a pairing code', now) === null, 'garbage is not a pairing code');
  check(pairedHostFromCode(encode({ ...offer(), v: 99 }), now) === null, 'an unknown offer version is refused');
  check(pairedHostFromCode(encode(offer({ scope: 'runtime' })), now) === null, 'a runtime-scope offer is refused');
  check(pairedHostFromCode(encode(offer({ endpoint: 'http://192.168.0.60:6768' })), now) === null, 'only ws and wss endpoints are accepted');
  check(pairedHostFromCode(encode(offer({ endpoint: 'ws://192.168.0.60:6768/?token=abc' })), now) === null, 'an endpoint with a query string is refused (it would land in the socket URL and network logs)');
  check(pairedHostFromCode(encode(offer({ publicKeyB64: 'AAAA' })), now) === null, 'a key that is not 32 bytes is refused');
  check(pairedHostFromCode(encode(offer({ deviceToken: '' })), now) === null, 'an empty token is refused');
  check(pairedHostFromCode('x'.repeat(200_000), now) === null, 'oversized input is refused');

  // What a QR or a clipboard could carry besides a pairing link: nothing but a proper pairing code may produce a host.
  {
    const good = encode(offer());
    const urlSafe = good.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const refused: Array<[string, string]> = [
      ['a javascript: link', `javascript:alert(1)//${urlSafe}`],
      ['a data: link', `data:text/plain;base64,${urlSafe}`],
      ['a file link', `file:///etc/hosts?code=${urlSafe}`],
      ['a web link carrying a valid code', `https://example.com/pair?code=${urlSafe}`],
      ['orca: without the slashes', `orca:pair?code=${urlSafe}`],
      ['a user in the authority', `orca://user@pair?code=${urlSafe}`],
      ['a plus sign inside the code in the query form (read as a space)', `orca://pair?code=${urlSafe.slice(0, 10)}+${urlSafe.slice(10)}`],
      ['an encoded percent sign (nested encoding)', `orca://pair?code=${urlSafe.slice(0, 8)}%25${urlSafe.slice(8)}`],
      ['whitespace inside the code', `orca://pair?code=${urlSafe.slice(0, 10)} ${urlSafe.slice(10)}`],
      ['a newline inside the code', `${good.slice(0, 10)}\n${good.slice(10)}`],
      ['an empty fragment', 'orca://pair#'],
    ];
    for (const [name, input] of refused) check(pairedHostFromCode(input, now) === null, `${name} is refused`);
    check(pairedHostFromCode(`orca://pair?code=${urlSafe}#${urlSafe.slice(0, 20)}`, now) !== null, 'the query code wins over a fragment, as in the original');
    check(pairedHostFromCode(`orca://pair#${urlSafe}?code=garbage`, now) === null, 'a ? after the # is read as the query, as in the original, and its garbage is refused');
    check(pairedHostFromCode(`orca://pair?code=${'A'.repeat(129_100)}`, now) === null, 'a code over the original limit is refused');
    check(pairedHostFromCode(`orca://pair?code=${'A'.repeat(129_900)}`, now) === null && pairedHostFromCode('A'.repeat(130_001), now) === null, 'and so is anything near and over the input limit');
  }

  // What the user is shown before confirming a scanned host: where it points and which key it has, never a secret.
  {
    const shown = previewPairing(encode(offer()), now);
    check(shown !== null && shown.endpointHost === '192.168.0.60:6768' && /^[0-9a-f]{32}$/.test(shown.hostId), 'a preview shows the host and port and the key digest');
    check(Object.keys(shown).sort().join() === 'endpointHost,hostId,pairedAt', 'and nothing else');
    check(!JSON.stringify(shown).includes(TOKEN) && !JSON.stringify(shown).includes(KEY), 'no token and no key');
    check(previewPairing(`orca://pair?code=${encode(offer({ endpoint: 'ws://203.0.113.9:6768' }))}`, now)?.endpointHost === '203.0.113.9:6768', 'it follows the link form too, and shows a public address as it is');
    check(previewPairing('https://example.com', now) === null && previewPairing('', now) === null, 'anything that is not a pairing code has no preview');
  }

  // Round trip through the secure store as one JSON value.
  {
    const memory = new MemoryStore();
    const store = new PairingStore(memory);
    check((await store.load()) === null, 'nothing is paired at first');
    await store.save(host!);
    check((memory.values.size as number) === 1 && memory.values.has(PAIRING_STORAGE_KEY), 'one value is stored under one key');
    check(JSON.stringify(await store.load()) === JSON.stringify(host), 'the paired host round-trips');
    await store.clear();
    check((await store.load()) === null && (memory.values.size as number) === 0, 'clear removes the pairing');
  }

  // The native Keychain delete reports nothing: clear() must look, and say so when the value is still there.
  {
    const memory = new MemoryStore();
    const store = new PairingStore(memory);
    await store.save(host!);
    memory.remove = async () => undefined; // a delete that silently does nothing
    await rejectsStore(store.clear(), 'storage_unavailable', 'a delete that did not delete');
    check(memory.values.size === 1, 'the pairing is still stored, and clear() said so instead of claiming success');
    const reading = new MemoryStore();
    await new PairingStore(reading).save(host!);
    const original = reading.get.bind(reading);
    let reads = 0;
    reading.get = async (key: string) => { if (++reads > 0) throw new Error(`keychain ${TOKEN}`); return original(key); };
    await rejectsStore(new PairingStore(reading).clear(), 'storage_unavailable', 'a store that cannot be read back after the delete');
  }

  // A damaged or tampered stored value is "not paired", and is removed.
  const damaged: Array<[string, string]> = [
    ['not json', '{{{'],
    ['an array', '[1,2]'],
    ['wrong types', JSON.stringify({ ...host, deviceToken: 7 })],
    ['plaintext endpoint', JSON.stringify({ ...host, endpoint: 'http://192.168.0.60:6768' })],
    ['short key', JSON.stringify({ ...host, hostPublicKeyB64: 'AAAA' })],
    ['host id that does not match the key', JSON.stringify({ ...host, hostId: 'f'.repeat(32) })],
    ['extra fields', JSON.stringify({ ...host, relayToken: 'x' })],
    ['endpoint with a query string', JSON.stringify({ ...host, endpoint: 'ws://192.168.0.60:6768/?token=abc' })],
  ];
  for (const [name, raw] of damaged) {
    const memory = new MemoryStore();
    memory.values.set(PAIRING_STORAGE_KEY, raw);
    check((await new PairingStore(memory).load()) === null && (memory.values.size as number) === 0, `a stored value that is ${name} is dropped`);
  }

  // Save refuses an invalid host, and storage failures are coded without secrets.
  {
    const store = new PairingStore(new MemoryStore());
    await rejectsStore(store.save({ ...host!, endpoint: 'http://x' } as PairedHost), 'invalid_pairing', 'saving an invalid host');
    await rejectsStore(store.save({ ...host!, hostId: 'a'.repeat(32) }), 'invalid_pairing', 'saving a host id that does not match the key');
    const broken = new MemoryStore(); broken.fail = true;
    try { await new PairingStore(broken).load(); check(false, 'load should fail'); } catch (error) {
      check(error instanceof PairingStoreError && error.code === 'storage_unavailable' && error.message === 'storage_unavailable' && error.cause === undefined && !JSON.stringify(error).includes(TOKEN), 'a storage failure is a coded error that carries no secret');
    }
    await rejectsStore(new PairingStore(broken).save(host!), 'storage_unavailable', 'saving to a broken store');
  }

  // What the UI may see.
  {
    const summary = describeHost(host!);
    check(Object.keys(summary).sort().join() === 'endpointHost,hostId,pairedAt', 'the summary has three fields');
    check(summary.endpointHost === '192.168.0.60:6768', 'the summary shows host and port only');
    check(!JSON.stringify(summary).includes(TOKEN) && !JSON.stringify(summary).includes(KEY), 'the summary has no token and no key');
  }

  console.log(`PASS: ${count} pairing store assertions (in-memory secure store; no device, no network)`);
}

void main();
