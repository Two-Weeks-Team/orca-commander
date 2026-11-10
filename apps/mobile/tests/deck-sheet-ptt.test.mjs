import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
for(const locale of ['ko','en']){
 const r=renderer(locale),{SheetPTT,SheetSkinContext}=r.load('src/ui/deck/sheet-controls.tsx');SheetSkinContext.current=true;let down=0,up=0;
 const children={type:'Text',props:{style:{color:'#FFFFFF'},children:r.t('ptt.hold')}};
 const nodes=r.walk(r.render(SheetPTT,{label:r.t('ptt.talk'),accessibilityLabel:r.t('ptt.hold'),onPressIn:()=>down++,onPressOut:()=>up++,children}));
 const label=nodes.find(n=>n.type==='Text'&&r.text(n)===r.t('ptt.talk'));assert.ok(label,'physical PTT uses short, visible localized label');
 assert.equal(r.native.StyleSheet.flatten(label.props.style).color,'#7A8594','approved gray label must contrast with white PTT cap');
 assert.equal(nodes.some(n=>n.type==='Image'&&String(n.props.source).endsWith('/mic.png')),true,'original board microphone is present');
 const key=nodes.find(n=>n.type==='Pressable');assert.equal(key.props.accessibilityLabel,r.t('ptt.hold'));key.props.onPressIn();key.props.onPressOut();assert.deepEqual([down,up],[1,1],'PTT audio callbacks are untouched');
 SheetSkinContext.current=false;const legacy=r.walk(r.render(SheetPTT,{children,style:{backgroundColor:'#111827'}}));assert.equal(r.text(legacy).includes(r.t('ptt.hold')),true,'other sheet PTT appearance/label unchanged');
}
console.log('PASS: physical PTT gray label/original microphone and exact existing callbacks; legacy surface unchanged');
