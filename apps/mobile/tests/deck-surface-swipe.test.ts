import assert from 'node:assert/strict';
import {DeckSurfaceSwipe,SURFACE_SWIPE_THRESHOLD,type SurfacePoint} from '../src/core/deck-surface-swipe';
const p=(x=100,y=100,id=1):SurfacePoint=>({id:String(id),x,y});
const g=new DeckSurfaceSwipe();
assert.equal(SURFACE_SWIPE_THRESHOLD,18);
assert.equal(g.begin([p()],'phone',true),false,'touch start observes, without stealing a key tap');
for(const delta of [0,17.99,18])assert.equal(g.wants([p(100-delta)],'phone',true),false,'18dp and below remain a tap candidate');
assert.equal(g.wants([p(81.9)],'phone',true),true);g.grant();assert.equal(g.finish(p(50),'phone',true),'left');
assert.equal(g.finish(p(20),'phone',true),null,'release moves exactly once');
for(const [end,want] of [[p(50),'left'],[p(150),'right'],[p(100,50),'up'],[p(100,150),'down']] as const){g.begin([p()],'phone',true);assert.equal(g.wants([end],'phone',true),true);g.grant();assert.equal(g.finish(end,'phone',true),want);}
for(const kind of ['LCD','joystick','dial','PTT','disabled PTT','usage refresh']){g.begin([p()],'phone',true);g.exclude();assert.equal(g.wants([p(0)],'phone',true),false,kind);g.grant();assert.equal(g.finish(p(0),'phone',true),null);}
g.begin([p()],'phone',true);g.consume();assert.equal(g.wants([p(0)],'phone',true),false,'already-open long press is consumed');g.grant();assert.equal(g.finish(p(0),'phone',true),null);
for(const [points,layout,enabled] of [[[p(20)],'fold',true],[[p(20)],'phone',false],[[p(20),p(30,30,2)],'phone',true],[[p(20,20,2)],'phone',true]] as const){g.begin([p()],'phone',true);assert.equal(g.wants(points,layout,enabled),true,'invalidated key contacts are taken only to cancel the child');g.grant();assert.equal(g.finish(p(20),'phone',true),null);}
g.begin([p()],'phone',true);g.wants([p(0)],'phone',true);assert.equal(g.finish(p(0),'phone',true),null,'an ungranted or rejected transfer cannot navigate');
g.begin([p()],'phone',true);g.wants([p(0)],'phone',true);g.grant();g.begin([p(0),p(10,10,2)],'phone',true);assert.equal(g.finish(p(0),'phone',true),null,'a second finger after grant cancels the swipe');
g.begin([p()],'phone',true);g.wants([p(0)],'phone',true);g.grant();assert.equal(g.finish(p(118),'phone',true),null,'returning inside the threshold does not move');
for(const [layout,enabled] of [['fold',true],['phone',false]] as const){g.begin([p()],'phone',true);g.wants([p(0)],'phone',true);g.grant();assert.equal(g.finish(p(0),layout,enabled),null,'release rechecks layout and live availability');}
g.begin([p()],'phone',true);g.wants([p(0)],'phone',true);g.grant();g.cancel();assert.equal(g.finish(p(0),'phone',true),null,'OS termination/rejection never moves');
g.begin([p()],'phone',false);assert.equal(g.wants([p(0)],'phone',true),false,'a cached/offline start cannot be upgraded in mid-contact');
g.begin([p()],'phone',true);g.consume();g.begin([p()],'phone',true);assert.equal(g.wants([p(0)],'phone',true),true,'the next contact is independent');
g.cancel();g.begin([p()],'phone',true);assert.equal(g.begin([p(),p(200,200,2)],'phone',true),true,'the second finger cancels a key immediately, even without a move');g.grant();assert.equal(g.finish(p(),'phone',true),null);
g.cancel();g.begin([p(),p(200,200,2)],'phone',true);assert.equal(g.wants([p(20)],'phone',true),true,'simultaneous first contacts cancel a child too');g.grant();assert.equal(g.finish(p(20),'phone',true),null);
g.begin([p()],'phone',true);g.exclude();g.endUnclaimed(0);g.begin([p(),p(200,200,2)],'phone',true);assert.equal(g.wants([p(20)],'phone',true),true,'an old excluded contact cannot suppress a new cancellation');g.cancel();
console.log('PASS: whole-face swipe threshold, responder grant, dedicated control exclusion, consumed long press, multitouch, lifecycle and one-release navigation (synthetic touches)');
