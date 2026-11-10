import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
for(const locale of ['ko','en']){
 const h=renderer(locale),skin=h.load('src/ui/deck/sheet-controls.tsx');skin.SheetSkinContext.current=true;
 const {ActionHistory}=h.load('src/ui/action-history.tsx');let acknowledged=[];
 const receipt={id:'r',status:'unknown',at:0,title:'Exact title',hostId:'host',hostVersion:'1.4.252',worktreeId:'tree',paneKey:'tab:leaf',handle:'term',incarnationId:'inc',generation:1,acknowledged:false};
 let tree=h.render(ActionHistory,{receipts:[receipt],busy:false,onAcknowledge:async id=>acknowledged.push(id)}),nodes=h.walk(tree);
 assert.equal(nodes.some(n=>n.props.testID==='deck-result-r'),true,'unresolved outcomes must be physical red LED keys');
 assert.equal(nodes.some(n=>n.type==='Text'&&n.props.accessibilityLiveRegion==='polite'),true,'physical outcome retains polite announcement');
 assert.equal(acknowledged.length,0,'opening result must never acknowledge it');
 nodes.find(n=>n.props.testID==='deck-result-r').props.onPress();
 nodes=h.walk(h.render(ActionHistory,{receipts:[receipt],busy:false,onAcknowledge:async id=>acknowledged.push(id)}));
 const ack=nodes.find(n=>n.props.accessibilityLabel===h.t('history.acknowledge'));assert.ok(ack,'full localized confirmation remains visible');
 const label=nodes.find(n=>n.props.testID==='deck-result-ack-label');assert.equal(label.props.numberOfLines,undefined,'long acknowledgement wraps without tail clipping');assert.equal(h.text(label).replace(/\n/g,''),h.t('history.acknowledge'));
 assert.equal(h.text(nodes).includes('tab:leaf'),true,'raw diagnostics preserved inside LCD');ack.props.onPress();assert.deepEqual(acknowledged,['r']);
}
console.log('PASS: D30 red result keys, complete wrapping acknowledgement, identity and explicit callback');
