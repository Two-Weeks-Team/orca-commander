import assert from 'node:assert/strict';
import {skinPatchRects,skinCircleRect} from '../src/ui/deck/skin-patches';
const padding={left:8,right:8,top:8,bottom:8},caps={left:12,right:12,top:12,bottom:12};
const patches=skinPatchRects({left:100,top:200,width:200,height:100},padding,caps);
assert.deepEqual(patches[0],{left:92,top:192,width:20,height:20});
assert.deepEqual(patches[4],{left:112,top:212,width:176,height:76});
assert.deepEqual(patches[8],{left:288,top:288,width:20,height:20});
for(const [width,height] of [[80,50],[154.8541666667,178.0822916667],[322.1,108.3],[789.3,336.625],[119.1,110.9]]){
 const p=skinPatchRects({left:16.25,top:34.1,width,height},padding,caps);
 for(let i=0;i<9;i++){assert.ok(p[i].width>=0&&p[i].height>=0);if(i%3<2)assert.equal(p[i].left+p[i].width,p[i+1].left);if(i<6)assert.equal(p[i].top+p[i].height,p[i+3].top);}
 assert.ok(Math.abs(p[8].left+p[8].width-(16.25+width+8))<1e-9);
}
const tiny=skinPatchRects({left:0,top:0,width:10,height:10},padding,caps);assert.ok(tiny.every(p=>p.width>=0&&p.height>=0));
assert.deepEqual(skinPatchRects({left:0,top:0,width:NaN,height:10},padding,caps),[]);
const circle=skinCircleRect({left:100,top:200,width:200,height:100},100,padding);
assert.deepEqual(circle,{left:142,top:192,width:116,height:116});
console.log('PASS: nine-patch shared edges / fixed corners / arbitrary frame / centered circular aspect');
