import assert from 'node:assert/strict';
import { createConfirmationContext } from '../src/ui/confirmation-context';

let count=0;
const same=(actual:unknown,expected:unknown)=>{count++;assert.deepEqual(actual,expected);};
// A delayed prepare or already rendered confirmation cannot survive a locale/context transition.
const context=createConfirmationContext('en:target-one');
const prepared=context.capture();
same(context.isCurrent(prepared),true);
context.update('en:target-one');
same(context.isCurrent(prepared),true);
context.update('ko:target-one');
same(context.isCurrent(prepared),false);
context.update('en:target-one');
same(context.isCurrent(prepared),false); // ABA must not revive the original confirmation.
const second=context.capture();
context.update('en:target-two');
same(context.isCurrent(second),false);
const backgrounded=context.capture();
context.invalidate();
same(context.isCurrent(backgrounded),false);
const current=context.capture();
same(context.isCurrent(current),true);
same(context.isCurrent(undefined),false);
// Cancelling one mounted editor does not revoke a different editor's fresh context.
const other=createConfirmationContext('en:target-three'), independent=other.capture();
context.invalidate();
same(other.isCurrent(independent),true);
console.log(`PASS: ${count} confirmation context assertions (pure; mounted UI and device behavior unverified)`);
