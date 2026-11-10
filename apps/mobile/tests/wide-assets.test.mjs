import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../assets/deck/wide/',import.meta.url),m=JSON.parse(readFileSync(new URL('manifest.json',root)));
assert.equal(m.pxPerPt,3);assert.equal(m.alphaBaked,true);assert.deepEqual(m.basePt,{w:624,h:784});
for(const entry of [m.base,...Object.values(m.sprites)])assert.equal(createHash('sha256').update(readFileSync(new URL(entry.file,root))).digest('hex'),entry.sha256);
assert.equal(m.placementsPx.agentSlots.length,12,'the archived twelve-key source remains intact');
const face=readFileSync(new URL('../src/ui/deck/DeckScreen.tsx',import.meta.url),'utf8');assert.equal(face.includes('useWindowDimensions'),false);// Parent-frame geometry is exercised by responsive-skin-ui.test.mjs.
console.log('PASS: archived twelve-key art hashes remain intact; current faces use the parent frame');
