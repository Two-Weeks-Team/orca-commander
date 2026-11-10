import { bindSessionLifecycle } from '../src/ui/lifecycle';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

function fake(initial: string) {
  const calls: string[] = [];
  let listener: ((state: string) => void) | undefined;
  let removed = 0;
  const session = {
    start: async () => { calls.push('start'); },
    resume: async () => { calls.push('resume'); },
    stop: () => { calls.push('stop'); },
  };
  const appState = {
    currentState: initial,
    addEventListener: (_type: 'change', fn: (state: string) => void) => { listener = fn; return { remove: () => { removed++; listener = undefined; } }; },
  };
  return { calls, session, appState, emit: (state: string) => listener?.(state), removed: () => removed };
}

// Mounting while active starts the session once.
{
  const f = fake('active');
  const unbind = bindSessionLifecycle(f.session, f.appState);
  check(f.calls.join() === 'start', 'an active app starts the session on mount');
  // The OS reports inactive for system dialogs (the Local Network prompt, control centre): nothing happens.
  f.emit('inactive');
  check(f.calls.join() === 'start', 'inactive is ignored');
  f.emit('background');
  check(f.calls.join() === 'start,stop', 'the background closes the connection');
  f.emit('active');
  check(f.calls.join() === 'start,stop,resume', 'coming back is a resume (an OS event), never a start');
  f.emit('inactive'); f.emit('active');
  check(f.calls.join() === 'start,stop,resume,resume', 'every return is a resume, which the session may refuse');
  unbind();
  check(f.calls.at(-1) === 'stop' && f.removed() === 1, 'unmounting stops the session and unsubscribes');
  f.emit('active');
  check(f.calls.at(-1) === 'stop', 'nothing is delivered after unmounting');
}

// Mounting while the app is in the background does not connect from the background.
{
  const f = fake('background');
  const unbind = bindSessionLifecycle(f.session, f.appState);
  check(f.calls.length === 0, 'a background start connects nothing');
  f.emit('active');
  check(f.calls.join() === 'resume', 'it connects when the app becomes active');
  unbind();
}

console.log(`PASS: ${count} lifecycle assertions (fake app state and session; no device)`);
