import { createScanGate, fingerprint } from '../src/ui/scan-gate';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

type Inspect = 'candidate' | 'invalid_code';
function setup(result: Inspect | (() => Inspect | Promise<Inspect>) = 'candidate') {
  const calls: string[] = [];
  let clock = 1_000_000;
  let release: (() => void) | undefined;
  let hold = false;
  const inspect = async (data: string): Promise<Inspect> => {
    calls.push(data);
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    return typeof result === 'function' ? result() : result;
  };
  const gate = createScanGate(inspect, () => clock);
  return { gate, calls, advance: (ms: number) => { clock += ms; }, holdNext: () => { hold = true; }, finish: () => { hold = false; release?.(); } };
}

async function main() {
  // A promise that never settles would let Node exit quietly with status 0: keep the process alive and fail loudly instead.
  const watchdog = setTimeout(() => { throw new Error('scan-gate test did not finish'); }, 10_000);

  // A pairing QR becomes a candidate (the user then confirms the host); the camera keeps reporting the same frame, and nothing
  // after a candidate is processed.
  {
    const h = setup('candidate');
    check(await h.gate.handle('orca://pair?code=AAA') === 'candidate' && h.calls.length === 1, 'a pairing QR becomes a candidate');
    check(await h.gate.handle('orca://pair?code=AAA') === 'ignored' && await h.gate.handle('something else') === 'ignored' && h.calls.length === 1, 'after a candidate the gate is closed: no frame is processed again');
  }

  // Frames that arrive while a QR is being inspected are ignored.
  {
    const h = setup('candidate');
    h.holdNext();
    const first = h.gate.handle('orca://pair?code=BBB');
    check(await h.gate.handle('orca://pair?code=BBB') === 'ignored' && await h.gate.handle('orca://pair?code=CCC') === 'ignored', 'frames during an inspection are ignored');
    h.finish();
    check(await first === 'candidate' && h.calls.length === 1, 'and the inspection itself completes once');
  }

  // A QR that is not a pairing code: reported once, not once per frame, and a different QR is handled at once.
  {
    const h = setup('invalid_code');
    check(await h.gate.handle('https://example.com/promo') === 'not_pairing', 'a QR that is not a pairing code is reported');
    check(await h.gate.handle('https://example.com/promo') === 'ignored' && h.calls.length === 1, 'the same QR in the next frames is ignored');
    h.advance(2_900);
    check(await h.gate.handle('https://example.com/promo') === 'ignored', 'still ignored within three seconds');
    h.advance(200);
    check(await h.gate.handle('https://example.com/promo') === 'not_pairing' && (h.calls.length as number) === 2, 'reported again after three seconds, if the user still points at it');
    check(await h.gate.handle('another qr') === 'not_pairing' && (h.calls.length as number) === 3, 'a different QR is handled immediately');
  }

  // Two unusable QR codes shown alternately do not make every frame an inspection.
  {
    const h = setup('invalid_code');
    for (const data of ['qr A', 'qr B', 'qr A', 'qr B', 'qr A', 'qr B']) await h.gate.handle(data);
    check(h.calls.length === 2, 'alternating unusable QR codes are each inspected once within the window');
    h.advance(3_100);
    await h.gate.handle('qr A'); await h.gate.handle('qr B');
    check((h.calls.length as number) === 4, 'and again after the window');
    // The memory of recent failures is bounded.
    const g = setup('invalid_code');
    for (let i = 0; i < 40; i++) await g.gate.handle(`distinct ${i}`);
    check((g.calls.length as number) === 40, 'every distinct QR is still inspected');
    await g.gate.handle('distinct 0');
    check((g.calls.length as number) === 41, 'but the oldest are forgotten, so the memory does not grow without bound');
  }

  // A thrown error is a failure, never an unhandled rejection, and does not close the gate.
  {
    let fail = true;
    const h = setup(() => { if (fail) throw new Error('boom SECRET'); return 'candidate'; });
    check(await h.gate.handle('x') === 'failed', 'a throwing inspection is a failure');
    fail = false; h.advance(3_100);
    check(await h.gate.handle('x') === 'candidate', 'and the next attempt can still produce a candidate');
  }

  // Frames that are not text (a contract violation by the native side) are ignored, not thrown.
  {
    const h = setup('candidate');
    for (const bad of [undefined, null, 42, {}, ['a']] as unknown[]) {
      check(await h.gate.handle(bad as string) === 'ignored', 'a non-text frame is ignored');
    }
    check(h.calls.length === 0, 'and never reaches the inspection');
  }

  // The fingerprint cannot be turned back into what was scanned, and is short whatever was scanned.
  {
    const secret = 'orca://pair?code=THE-SECRET-TOKEN-VALUE';
    const print = fingerprint(secret);
    check(!print.includes('THE-SECRET-TOKEN-VALUE') && !print.includes('orca') && print !== secret, 'the fingerprint holds none of the scanned text');
    check(print.length <= 24 && fingerprint('x'.repeat(100_000)).length <= 24, 'and is short, however long the scan was');
    check(fingerprint(secret) === print && fingerprint(secret + '!') !== print, 'but still tells one scan from another');
  }

  // The gate object itself holds no scanned text as a readable property.
  {
    const h = setup('invalid_code');
    await h.gate.handle('orca://pair?code=THE-SECRET-TOKEN-VALUE');
    check(!`${JSON.stringify(h.gate)} ${Object.getOwnPropertyNames(h.gate).join()}`.includes('THE-SECRET-TOKEN-VALUE'), 'the scanned text is not kept as a readable property');
  }

  clearTimeout(watchdog);
  console.log(`PASS: ${count} scan gate assertions (fake inspection; no camera)`);
}

void main();
