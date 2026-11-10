import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
const h=renderer(),{RecordingDisplay}=h.load('src/ui/deck/recording-display.tsx');
const nodes=h.walk(h.render(RecordingDisplay,{label:'Recording',text:'Exact partial',phase:'recording',elapsedMs:7000,level:0.5,position:'2/3',counts:{attention:3,working:7,done:12,unknown:0},link:'LIVE',age:'2s',scale:1}));
assert.equal(nodes.filter(n=>n.props.testID?.startsWith('deck-recording-tick-')).length,30,'recording overlays the 30 LED segments on existing LCD');
for(const word of ['2/3','LIVE','2s','0:07','3','7','12','0'])assert.equal(h.text(nodes).includes(word),true,'recording retains position/counts/link and local time');
assert.equal(nodes.some(n=>n.props.accessibilityLiveRegion==='polite'),true);
console.log('PASS: D30 recording-only LCD overlay, 30 segments, local timer and live counts');
