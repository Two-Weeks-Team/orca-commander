import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
let checks=0;const same=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);};
for(const locale of ['ko','en']){
 const h=renderer(locale),{ListSearch}=h.load('src/ui/deck/ListSearch.tsx');let scope;
 const nodes=h.walk(h.render(ListSearch,{counts:{all:9,attention:3,working:3,done:2,unknown:1},deck:true,query:'keep',onQuery(){},scope:'attention',onScope:s=>scope=s}));
 same(nodes.filter(n=>n.type==='Image').length>=5,true,'D30 list filters must use physical command sprites rather than flat text buttons');
 same(h.text(nodes).includes('9'),true,'filter cap renders real local count');
 const radios=nodes.filter(n=>n.props.accessibilityRole==='radio');same(radios.length,5,'exactly five filters');
 same(radios.filter(n=>n.props.accessibilityState.checked).length,1,'one pressed selection');
 const done=radios.find(n=>n.props.accessibilityLabel===h.t('state.done'));same(!!done,true,'complete localized filter label despite compact cap');done.props.onPress();same(scope,'done','existing local filter handler');
 for(const n of nodes.filter(n=>n.type==='Text'))same(n.props.maxFontSizeMultiplier,1.5,'scoped sheet text ceiling');
}
console.log(`PASS: ${checks} D30 sheet filter structure/labels/selection callbacks`);
