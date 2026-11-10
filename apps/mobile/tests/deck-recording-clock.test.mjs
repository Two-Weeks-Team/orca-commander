import assert from 'node:assert/strict';
import {harness} from './global-voice-audio-start.test.mjs';
const h=harness();await h.flush();h.clock=100;h.api.pressIn();await h.flush();h.clock=7100;h.render();
assert.equal(h.api.display.elapsedMs,7000,'elapsed is device monotonic time from accepted PTT, not host or wall clock');
h.api.pressOut();await h.flush();h.clock=10000;h.render();assert.equal(h.api.display.elapsedMs,7000,'released PTT freezes display time');h.unmount();
console.log('PASS: D30 monotonic recording display lifecycle');
