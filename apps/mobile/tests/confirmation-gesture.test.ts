import assert from 'node:assert/strict';
import { createConfirmationGesture } from '../src/core/confirmation-gesture';
let count=0;
const same=(actual:unknown,want:unknown)=>{count++;assert.deepEqual(actual,want);};
const make=(age=0)=>createConfirmationGesture({now:1000,wallNow:100000,preparedAt:100000-age});
const pulseHold=(g:ReturnType<typeof make>,end:number)=>{for(let n=1050;n<end;n+=50)g.pulse(n,99000+n);};
// D29: review age is never send authority; the native 0.8 s gesture still is.
{
 const slow=make();slow.setReadEnd(true);slow.pulse(301000,400000);
 slow.startHold(301000,400000,100);same(slow.releaseHold(301799,400799,899),false);
 slow.startHold(302000,401000,1100);same(slow.releaseHold(302800,401800,1900),true);
 same(slow.releaseHold(303000,402000,2100),false);
 const accessible=make();accessible.setReadEnd(true);same(accessible.accessibleActivate(1000,100000),false);
 same(accessible.accessibleActivate(301000,400000),true);same(accessible.accessibleActivate(301001,400001),false);
 const initiallyDisabled=make();initiallyDisabled.setDisabled(true);same(initiallyDisabled.snapshot().phase,'idle');
 initiallyDisabled.setDisabled(false);initiallyDisabled.setReadEnd(true);initiallyDisabled.startHold(301000,400000,100);
 same(initiallyDisabled.releaseHold(301800,400800,900),true);
}

let g=make();g.setReadEnd(true);g.startHold(1000,100000,50);pulseHold(g,1799);same(g.releaseHold(1799,100799,849),false);same(g.snapshot().phase,'idle');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);pulseHold(g,1800);same(g.releaseHold(1800,100800,850),true);same(g.releaseHold(1800,100800,850),false);same(g.accessibleActivate(1801,100801),false);
// Receipt-time duration cannot overrule a shorter native touch duration.
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);pulseHold(g,1800);same(g.releaseHold(1800,100800,849),false);
// A JS stall is not a lifted finger: native touch time decides. A stalled genuine 800 ms hold confirms,
// while a stalled short press stays short because its native release time is short.
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1200,100200);same(g.snapshot().phase,'holding');same(g.snapshot().maxGapMs,200);same(g.releaseHold(1800,100800,850),true);
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1400,100400);same(g.releaseHold(1800,100800,600),false);same(g.snapshot().phase,'idle');
g=make();same(g.accessibleActivate(1000,100000),false);same(g.snapshot().phase,'idle');g.setReadEnd(true);same(g.accessibleActivate(1000,100000),false);same(g.snapshot().phase,'ready');same(g.accessibleActivate(5999,104999),true);same(g.accessibleActivate(6000,105000),false);
g=make();g.setReadEnd(true);g.accessibleActivate(1000,100000);same(g.accessibleActivate(6001,105001),true);same(g.snapshot().phase,'consumed');same(g.accessibleActivate(6002,105002),false);
g=make(29999);g.setReadEnd(true);same(g.accessibleActivate(1000,100000),false);same(g.accessibleActivate(1000,100000),true);
g=make(30000);g.setReadEnd(true);same(g.accessibleActivate(1000,100000),false);same(g.snapshot().phase,'ready');
g=make(29500);g.setReadEnd(true);g.startHold(1000,100000,50);pulseHold(g,1800);same(g.releaseHold(1800,100800,850),true);same(g.snapshot().phase,'consumed');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.cancel();same(g.releaseHold(1800,100800,850),false);same(g.snapshot().phase,'cancelled');
g=make();g.setReadEnd(true);g.accessibleActivate(1000,100000);g.setDisabled(true);same(g.accessibleActivate(1001,100001),false);g.setDisabled(false);same(g.accessibleActivate(1002,100002),false);
g=make();g.setReadEnd(true);g.accessibleActivate(1000,100000);g.setReadEnd(false);same(g.accessibleActivate(1001,100001),false);same(g.snapshot().phase,'idle');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(999,99999);same(g.snapshot().phase,'cancelled');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1050,99999);same(g.snapshot().phase,'holding');
g=make();g.pulse(1100,100100);same('remainingMs' in g.snapshot(),false);g.pulse(1200,100100);same('remainingMs' in g.snapshot(),false);
g=createConfirmationGesture({now:1,wallNow:100,preparedAt:101});same(g.snapshot().phase,'idle');
g=make();g.setReadEnd(true);g.accessibleActivate(1000,100000);same(g.accessibleActivate(6000,105000),true);
g=make();g.setReadEnd(true);g.startHold(1000,100000,NaN);same(g.snapshot().phase,'idle');same(g.releaseHold(1800,100800,850),false);
g=make();g.pulse(1100,100100);g.pulse(1200,100050);same(g.snapshot().phase,'idle');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1100,100100);same(g.snapshot().phase,'holding');g.pulse(1201,100201);same(g.snapshot().phase,'holding');
// Gap diagnostics never change the hold decision; the first terminal reason is kept.
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1200,100200);
same(g.snapshot(),{phase:'holding',readEnd:true,holdMs:200,cancellationReason:null,maxGapMs:200});
g.setDisabled(true);same(g.snapshot().cancellationReason,'disabled');
const cancelled=g.snapshot();g.cancel('lifecycle');g.pulse(50000,149000);
same(g.snapshot().cancellationReason,cancelled.cancellationReason);same(g.snapshot().maxGapMs,cancelled.maxGapMs);same('remainingMs' in g.snapshot(),false);
g=make();same(g.snapshot().cancellationReason,null);same(g.snapshot().maxGapMs,0);
g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1100,100100);same(g.snapshot().phase,'holding');same(g.snapshot().maxGapMs,100);
g.pulse(1200.01,100200.01);same(g.snapshot().phase,'holding');same(g.snapshot().cancellationReason,null);same(g.snapshot().maxGapMs,101);
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(30000,129000);same(g.snapshot().phase,'holding');same(g.snapshot().maxGapMs,29000);same(Number.isSafeInteger(g.snapshot().maxGapMs)&&g.snapshot().maxGapMs<=60000,true);
for(const reason of ['touch-cancel','lifecycle','context','explicit'] as const){
 g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1050,100050);g.cancel(reason);
 same(g.snapshot().phase,'cancelled');same(g.snapshot().cancellationReason,reason);same(g.snapshot().maxGapMs,50);
 g.setDisabled(true);g.cancel('explicit');g.pulse(2000,101000);same(g.snapshot().cancellationReason,reason);same(g.snapshot().maxGapMs,50);
}
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.setDisabled(true);same(g.snapshot().cancellationReason,'disabled');g.cancel('touch-cancel');same(g.snapshot().cancellationReason,'disabled');
g=make();g.cancel();same(g.snapshot().cancellationReason,'explicit');
g=make();Reflect.apply(g.cancel,g,['unrecognized_fixture_reason']);same(g.snapshot().cancellationReason,'explicit');
g=make();g.pulse(NaN,100050);same(g.snapshot().phase,'cancelled');same(g.snapshot().cancellationReason,'clock');
g=make();g.pulse(999,100050);same(g.snapshot().cancellationReason,'clock');
g=make();g.pulse(1050,99999);same(g.snapshot().phase,'idle');same(g.snapshot().cancellationReason,null);
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.releaseHold(1050,100050,49);same(g.snapshot().phase,'cancelled');same(g.snapshot().cancellationReason,'clock');
g=make(30000);same(g.snapshot().phase,'idle');same(g.snapshot().cancellationReason,null);g.cancel('context');same(g.snapshot().cancellationReason,'context');
g=make();g.pulse(31000,130000);same(g.snapshot().phase,'idle');same(g.snapshot().cancellationReason,null);
g=make(-1);same(g.snapshot().cancellationReason,null);
g=createConfirmationGesture({now:NaN,wallNow:100,preparedAt:100});same(g.snapshot().cancellationReason,'clock');
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);pulseHold(g,1800);same(g.releaseHold(1800,100800,850),true);
same(g.snapshot().cancellationReason,null);same(g.snapshot().maxGapMs,50);g.setDisabled(true);g.cancel('touch-cancel');g.pulse(99999,198999);same(g.snapshot().phase,'consumed');same(g.snapshot().cancellationReason,null);same(g.snapshot().maxGapMs,50);
// Each accepted hold has its own gap evidence. Rejected starts and terminal calls cannot reset it.
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1090,100090);same(g.releaseHold(1150,100150,200),false);same(g.snapshot().maxGapMs,90);
g.startHold(1170,100170,NaN);same(g.snapshot().phase,'idle');same(g.snapshot().maxGapMs,90);
g.startHold(1200,100200,300);same(g.snapshot().phase,'holding');same(g.snapshot().maxGapMs,0);
g.pulse(1240,100240);same(g.releaseHold(1280,100280,380),false);same(g.snapshot().maxGapMs,40);
g.setReadEnd(false);g.startHold(1300,100300,400);same(g.snapshot().phase,'idle');same(g.snapshot().maxGapMs,40);
g.setReadEnd(true);g.startHold(1340,100340,440);same(g.snapshot().maxGapMs,0);g.pulse(1459,100459);same(g.snapshot().phase,'holding');same(g.snapshot().maxGapMs,119);
// The observed device case: 119 ms JS gap inside a 1.15 s native hold now confirms exactly once.
for(let n=1499;n<2490;n+=40)g.pulse(n,99000+n);same(g.releaseHold(2490,101490,1590),true);same(g.snapshot().phase,'consumed');same(g.snapshot().maxGapMs,119);same(g.releaseHold(2500,101500,1600),false);
g=make();g.setReadEnd(true);g.startHold(1000,100000,50);g.pulse(1300,100300);g.cancel('touch-cancel');same(g.releaseHold(1900,100900,950),false);same(g.snapshot().cancellationReason,'touch-cancel');same(g.snapshot().maxGapMs,300);
console.log(`PASS: ${count} confirmation gesture assertions (pure clocks; no device send)`);
