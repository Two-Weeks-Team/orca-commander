import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
for(const [w,h,scale] of [[411,891,1.1],[390,844,1],[821,1088,1.5],[555,876,1.5],[1088,821,1.5],[844,390,1.5],[876,555,1.5]]){
 const r=renderer('ko',w,h,scale),api=r.load('src/ui/deck/sheet-frame.tsx');let closed=0;
 const nodes=r.walk(r.render(api.DeckSheetFrame,{physical:true,title:'List',onClose:()=>closed++,keyboardVisible:false,children:'owned body'}));
 assert.equal(nodes.some(n=>n.props.testID==='deck-sheet-metal'),true,'D30 sheets extend physical metal deck at every D10 viewport');
 const close=nodes.find(n=>n.props.testID==='deck-sheet-close');assert.ok(close);close.props.onPress();assert.equal(closed,1);
 for(const n of nodes.filter(n=>n.type==='Text'))assert.equal(n.props.maxFontSizeMultiplier,1.5);
 assert.equal(r.text(nodes).includes('owned body'),true);
}
console.log('PASS: D30 frame close/body/font across seven D10 viewports');
