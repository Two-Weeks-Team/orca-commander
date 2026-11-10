import assert from 'node:assert/strict';
import { deckLayout, deckFace, deckKeyCount, controlTarget, swipeDirection,keyTitle,dialDetents,DIAL_DETENT_PX,stickRepeatInterval,STICK_REPEAT,type DeckRect,type DeckInsets,type DeckFace} from '../src/ui/deck/deck-layout';
let checks = 0;
const near = (a:number,b:number) => { checks++; assert.ok(Math.abs(a-b)<0.001, `${a} != ${b}`); };
// 1.5c uses the full parent frame for routing; safe-area placement cannot turn iPhone into cover.
assert.equal(deckFace(844,390),'short-landscape');checks++;
assert.equal(deckFace(1088,821.3),'landscape');checks++;
for(const [w,h,want] of [[500,1000,'phone'],[500.001,1000,'cover'],[699.999,1000,'cover'],[700,1000,'wide'],[900,599.999,'short-landscape'],[900,600,'landscape'],[600,600,'cover'],[700,700,'wide'],[NaN,844,'phone'],[390,Infinity,'phone'],[0,844,'phone'],[390,-1,'phone']] as const){assert.equal(deckFace(w,h),want);checks++;}
assert.equal(deckFace(1088,821.3,false),'phone');checks++;
for(const [face,n] of [['phone',6],['cover',6],['wide',9],['landscape',9],['short-landscape',6]] as const){assert.equal(deckKeyCount(face),n);checks++;}
// A scale that ignores either safe inset clips the final physical controls on iPhone 13.
const phone = deckLayout(390,844,{top:47,bottom:34,left:0,right:0});
near(phone.scale,763/844); near(phone.top,47); near(phone.height,763);
near(phone.left,(390-390*763/844)/2);
for (const [width,height,top,bottom] of [[390,844,47,34],[320,568,20,0],[430,932,59,34],[360,800,24,24]]) {
 const layout = deckLayout(width,height,{top,bottom,left:0,right:0});
 assert.ok(layout.left>=0&&(layout.face==='phone'?layout.top>=top:layout.top===0)); checks++;
 assert.ok(layout.left+layout.width<=width+.001&&layout.top+layout.height<=(layout.face==='phone'?height-bottom:height)+.001); checks++;
 for(const rect of [...layout.agentKeys,...layout.commands,layout.status,layout.stick,layout.voice,layout.dial]){
  const target = controlTarget(rect,layout.width,layout.height);
  assert.ok(target.width>=48&&target.height>=48); checks++;
  assert.ok(target.left>=0&&target.top>=0&&target.left+target.width<=layout.width+.001&&target.top+target.height<=layout.height+.001); checks++;
 }
}
const asymmetric=deckLayout(430,932,{top:59,bottom:34,left:12,right:24});
near(asymmetric.left,15.15521327014217);near(asymmetric.top,59);near(asymmetric.width,390*839/844);
// Hand checked physical key coordinates at 1x, including a fractional sprite origin.
const full=deckLayout(390,844,{top:0,bottom:0,left:0,right:0});
near(full.agentKeys[0].left,17.33);near(full.agentKeys[5].top,322);near(full.commands[5].top,574);
near(full.voice.left,144);near(full.dial.top,690);
const edge=controlTarget({left:0,top:0,width:20,height:20},100,100);
assert.deepEqual(edge,{left:0,top:0,width:48,height:48});checks++;
assert.equal(deckLayout(240,320,{top:0,bottom:0,left:0,right:0}).needsList,true);checks++;
for(const [x,y,want] of [[40,4,'right'],[-30,3,'left'],[2,30,'down'],[3,-24,'up'],[7,8,null]] as const){assert.equal(swipeDirection(x,y),want);checks++;}
// The dial turns one detent per DIAL_DETENT_PX of drag along the axis that moved most; right/down is forward.
for(const [x,y,want] of [[0,0,0],[DIAL_DETENT_PX-1,0,0],[DIAL_DETENT_PX,4,1],[3*DIAL_DETENT_PX+5,10,3],[-2*DIAL_DETENT_PX,8,-2],[5,2*DIAL_DETENT_PX,2],[4,-DIAL_DETENT_PX,-1]] as const){assert.equal(dialDetents(x,y),want);checks++;}
// A held stick repeats tabs faster than projects, and both only after the first pause.
assert.equal(stickRepeatInterval('left'),STICK_REPEAT.tabMs);assert.equal(stickRepeatInterval('down'),STICK_REPEAT.projectMs);assert.ok(STICK_REPEAT.delayMs>STICK_REPEAT.tabMs);checks+=3;
// Keys show the tab's title without Orca's own numbering, which would contradict the key number.
for(const [raw,want] of [['3 · 독립 검토','독립 검토'],['12. Fix','Fix'],['Plain title','Plain title'],['2026 plan','2026 plan'],['7 · ','7 · '],[null,null]] as const){assert.equal(keyTitle(raw),want);checks++;}
// Fold8 measured dp at density360; phone/cover keep the approved six-key face.
const foldWide=deckLayout(821.333,1088,{top:29,bottom:24,left:0,right:0},true);
assert.equal(foldWide.agentKeys.length,9);checks++;
assert.equal(deckLayout(554.667,876.444,{top:47,bottom:24,left:0,right:0}).agentKeys.length,6);checks++;
assert.equal(deckLayout(390,844,{top:47,bottom:34,left:0,right:0}).agentKeys.length,6);checks++;
for(const r of [...foldWide.agentKeys,...foldWide.commands,foldWide.status,foldWide.stick,foldWide.voice,foldWide.dial]){
 assert.ok(r.left>=0&&r.top>=0&&r.left+r.width<=foldWide.width+.001&&r.top+r.height<=foldWide.height+.001);checks++;
}
assert.ok(foldWide.width>800,'wide portrait uses internal screen width');checks++;
assert.equal(deckLayout(1088,821,{top:29,bottom:24,left:0,right:0}).agentKeys.length,9);checks++;

assert.equal(deckLayout(821.333,1088,{top:29,bottom:24,left:0,right:0}).agentKeys.length,9,'returned Fold8 internal portrait activates the wide face by default');

assert.equal(deckLayout(1080/2.625,2316/2.625,{top:24,bottom:24,left:0,right:0},true).agentKeys.length,6,'measured S23 stays on phone face even when preview enabled');

// Approved A/B1 preview equations are the geometry contract, independent of safe-area readback.
assert.equal(deckFace(500,1000),'phone');assert.equal(deckFace(500.001,1000),'cover');
assert.equal(deckFace(699.999,1000),'cover');assert.equal(deckFace(700,1000),'wide');
const approvedA=deckLayout(821.3,1088,{top:34,bottom:20,left:0,right:0});
near(approvedA.left,0);near(approvedA.top,0);near(approvedA.width,821.3);near(approvedA.height,1088);
near(approvedA.status.left,16);near(approvedA.status.top,34);near(approvedA.status.width,789.3);near(approvedA.status.height,233.973125);
near(approvedA.agentKeys[0].width,154.8541666667);near(approvedA.agentKeys[0].height,178.0822916667);
near(approvedA.commands[0].width,139.36875);near(approvedA.commands[0].height,approvedA.agentKeys[0].height);
const approvedB=deckLayout(554.7,876.4,{top:34,bottom:20,left:0,right:0});
assert.equal(approvedB.face,'cover');assert.equal(approvedB.agentKeys.length,6);
near(approvedB.status.left,16);near(approvedB.status.top,34);near(approvedB.status.width,522.7);near(approvedB.status.height,199.656);
near(approvedB.agentKeys[0].width,166.2333333333);near(approvedB.agentKeys[0].height,106.912);
near(approvedB.commands[0].width,166.2333333333);near(approvedB.commands[0].height,86.352);

// D uses the explicit compositor safe insets once, within the full 844x390 plane.
const d=deckLayout(844,390,{top:8,bottom:21,left:47,right:47});
assert.equal(d.face,'short-landscape');assert.equal(d.agentKeys.length,6);checks+=2;
near(d.scale,1);near(d.left,0);near(d.top,0);near(d.width,844);near(d.height,390);
near(d.status.left,57);near(d.status.top,8);near(d.status.width,388.3);near(d.status.height,108.3);
near(d.agentKeys[0].left,57);near(d.agentKeys[0].top,128.3);near(d.agentKeys[0].width,122.7666666667);near(d.agentKeys[0].height,105.35);
near(d.commands[0].left,459.3);near(d.commands[0].top,8);near(d.commands[0].width,95.0166666667);near(d.commands[0].height,113.6666666667);
near(d.stick.left,673.3333333333);near(d.stick.top,8);near(d.voice.top,131.6666666667);near(d.dial.top,255.3333333333);
// E uses the same short landscape equation; extra height centers its capped control column.
const e=deckLayout(876.4,554.7,{top:30,bottom:16,left:16,right:16});
near(e.status.left,26);near(e.status.top,30);near(e.status.width,426.624);near(e.status.height,120);
near(e.agentKeys[0].width,135.5413333333);near(e.agentKeys[0].height,173.35);
near(e.commands[0].left,466.624);near(e.commands[0].width,104.888);near(e.commands[0].height,162.9);
near(e.stick.left,700.4);near(e.stick.top,49.35);near(e.stick.width,150);near(e.voice.top,209.35);near(e.dial.top,369.35);
// C and H use the original tall landscape equation, with a separate right control column.
const c=deckLayout(1088,821.3,{top:48,bottom:20,left:16,right:16});
assert.equal(c.face,'landscape');assert.equal(c.agentKeys.length,9);checks+=2;
near(c.scale,1);near(c.left,0);near(c.top,0);near(c.width,1088);near(c.height,821.3);
near(c.status.left,16);near(c.status.top,48);near(c.status.width,1056);near(c.status.height,158.193);
near(c.agentKeys[0].width,170.3783576389);near(c.agentKeys[0].height,177.0356666667);near(c.agentKeys[0].top,222.193);
near(c.commands[0].left,563.1350729167);near(c.commands[0].width,153.340521875);
near(c.stick.left,903.8161166667);near(c.stick.top,231.470675);near(c.stick.width,168.1838833333);near(c.voice.top,413.6545583333);near(c.dial.top,595.8384416667);
const h=deckLayout(1194,834,{top:24,bottom:20,left:16,right:16});
near(h.status.top,24);near(h.status.width,1162);near(h.status.height,165.9);
near(h.agentKeys[0].width,192.0833333333);near(h.agentKeys[0].height,186.7);near(h.agentKeys[0].top,205.9);
near(h.commands[0].left,628.25);near(h.commands[0].width,172.875);
near(h.stick.left,1008);near(h.stick.top,226.95);near(h.stick.width,170);near(h.voice.top,410.95);near(h.dial.top,594.95);
// Default A/B1 art retains approved34/20; iPad wide explicitly supplies its24/20 placement.
const g=deckLayout(834,1194,{top:24,bottom:20,left:0,right:0},true,{top:24,bottom:20,left:0,right:0});
near(g.status.top,24);near(g.status.height,336.625);near(g.agentKeys[0].top,376.625);
near(g.agentKeys[0].width,157.5);near(g.agentKeys[0].height,181.125);near(g.stick.top,982);
near(deckLayout(821.3,1088,{top:29,bottom:24,left:0,right:0}).status.top,34);
near(deckLayout(554.7,876.4,{top:29,bottom:24,left:0,right:0},true,{top:24,bottom:20,left:0,right:0}).status.top,34);
// The final matrix routes on full-frame dp; canonical preview insets are explicit inputs.
// S23 inset values below are synthetic test inputs, not measurements from a connected device.
const matrix:readonly [number,number,DeckInsets,DeckFace,number][]=[
 [390,844,{top:47,bottom:34,left:0,right:0},'phone',6],
 [411,891,{top:24,bottom:24,left:0,right:0},'phone',6],
 [554.7,876.4,{top:34,bottom:20,left:0,right:0},'cover',6],
 [821.3,1088,{top:34,bottom:20,left:0,right:0},'wide',9],
 [834,1194,{top:24,bottom:20,left:0,right:0},'wide',9],
 [844,390,{top:8,bottom:21,left:47,right:47},'short-landscape',6],
 [891,411,{top:8,bottom:24,left:24,right:24},'short-landscape',6],
 [876.4,554.7,{top:30,bottom:16,left:16,right:16},'short-landscape',6],
 [1088,821.3,{top:48,bottom:20,left:16,right:16},'landscape',9],
 [1194,834,{top:24,bottom:20,left:16,right:16},'landscape',9]
];
const overlaps=(a:DeckRect,b:DeckRect)=>Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left)>1e-7&&Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top)>1e-7;
for(const [width,height,insets,face,n] of matrix){
 const layout=deckLayout(width,height,insets,true,width===834&&height===1194?insets:undefined);
 assert.equal(layout.face,face);assert.equal(layout.agentKeys.length,n);assert.equal(deckKeyCount(face),n);assert.equal(layout.commands.length,6);assert.equal(layout.needsList,false);checks+=5;
 const clickable=[...layout.agentKeys,...layout.commands,layout.status,layout.stick,layout.voice,layout.dial];
 const targets=clickable.map(r=>controlTarget(r,layout.width,layout.height));
 for(const target of targets){
  assert.ok(target.width>=48&&target.height>=48);assert.ok(target.left>=0&&target.top>=0&&target.left+target.width<=layout.width+1e-7&&target.top+target.height<=layout.height+1e-7);checks+=2;
 }
 for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){assert.equal(overlaps(targets[i],targets[j]),false,`${width}x${height} targets ${i}/${j}`);checks++;}
 if(layout.spriteRects){
  for(const r of [...layout.spriteRects.agentKeys,...layout.spriteRects.commands,layout.spriteRects.stick,layout.spriteRects.voice,layout.spriteRects.dial,layout.keyStrip]){assert.ok(r.left>=0&&r.top>=0&&r.left+r.width<=width+1e-7&&r.top+r.height<=height+1e-7);checks++;}
 }
}
// Rotation/split capacity is recomputed, independent of previous face or selection state.
assert.deepEqual([[821.3,1088],[1088,821.3],[541,1088],[1088,541],[554.7,876.4],[876.4,554.7],[390,844]].map(([w,h])=>deckKeyCount(deckFace(w,h))),[9,9,6,6,6,6,6]);checks++;
assert.equal(deckFace(541,1088),'phone','final <=0.50 ruling supersedes the older half-split stretched image');checks++;
// Physically unfit or malformed frames cannot expose usable deck controls.
for(const [width,height,insets] of [[240,140,{top:8,bottom:21,left:47,right:47}],[900,610,{top:200,bottom:200,left:16,right:16}],[0,844,{top:47,bottom:34,left:0,right:0}],[NaN,844,{top:0,bottom:0,left:0,right:0}],[390,Infinity,{top:0,bottom:0,left:0,right:0}]] as const){
 const layout=deckLayout(width,height,insets);assert.equal(layout.needsList,true);checks++;
 for(const value of [layout.width,layout.height,layout.left,layout.top,layout.scale]){assert.ok(Number.isFinite(value)&&value>=0);checks++;}
}
console.log(`deck-layout: ${checks} checks: legacy phone/A/B1 plus 1.5c routing, canonical geometry, capacity and physical targets passed`);

// OS safe insets may be zero in landscape; retain the approved face's visual edge margins.
near(deckLayout(844,390,{top:0,bottom:21,left:47,right:47}).status.top,8);
near(deckLayout(876.4,554.7,{top:30,bottom:16,left:0,right:0}).status.left,26);
near(deckLayout(1194,834,{top:0,bottom:0,left:0,right:0}).status.top,24);
