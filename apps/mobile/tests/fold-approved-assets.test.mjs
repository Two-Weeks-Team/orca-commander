import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const geometryModule={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/ui/deck/approved-face-geometry.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:geometryModule,exports:geometryModule.exports,Math,Number});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetRoot=new URL('../assets/deck/',import.meta.url),projectRoot=new URL('../../../',import.meta.url);
const phoneBytes=readFileSync(new URL('manifest.json',assetRoot)),phone=JSON.parse(phoneBytes);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const expected={inner:{w:821.3,h:1088,n:9,statusH:233.973125,firstY:283.973125,keyW:154.85416666666666,keyH:178.08229166666663,commandX:516.5625,commandW:139.36875,controlY:880.22},cover:{w:554.7,h:876.4,n:6,statusH:199.65599999999986,firstY:252.15999999999985,keyW:166.23333333333335,keyH:106.912,commandX:16,commandW:166.23333333333335,controlY:741.4879999999999}};
for(const [face,e] of Object.entries(expected)){
 const root=new URL(`fold-${face}/`,assetRoot),m=JSON.parse(readFileSync(new URL('manifest.json',root))),base=readFileSync(new URL(m.base.file,root));
 assert.equal(m.format,1);assert.equal(m.alphaBaked,true);assert.equal(m.pxPerPt,3);assert.deepEqual(m.basePt,{w:e.w,h:e.h});
 assert.equal(base.readUInt32BE(16),Math.round(e.w*3));assert.equal(base.readUInt32BE(20),Math.round(e.h*3));
 assert.equal(sha(base),m.base.sha256);assert.equal(m.base.sha256,m.base.sourceSha256);assert.equal(base.length,m.base.bytes);
 const sourceRoot=new URL(`docs/deck-design/renders/fold-approved-${face}/`,projectRoot);
 assert.equal(sha(readFileSync(new URL('base.png',sourceRoot))),m.base.sourceSha256);
 assert.equal(sha(readFileSync(new URL('render-metadata.json',sourceRoot))),m.sourceRenderMetadataSha256);
 assert.equal(m.sourceComposeSha256,'dceb6e543a0bd5698bff7c8df7e256152e0a7e18244101649a9de77dc63b1ad4');
 for(const [file,hash] of [['docs/deck-design/blender/deck_approved_faces.py',m.sourceBlenderScriptSha256],['docs/deck-design/blender/deck_scene.py',m.parentBlenderScriptSha256],['scripts/deck-assets/build-approved-faces.py',m.generator.sha256]])assert.equal(sha(readFileSync(new URL(file,projectRoot))),hash);
 assert.equal(m.sourcePhoneManifestSha256,sha(phoneBytes));assert.equal(Object.keys(m.reusedPhoneSprites).length,32);
 for(const [name,r] of Object.entries(m.reusedPhoneSprites)){assert.equal(sha(readFileSync(new URL(r.file,root))),r.sha256);assert.equal(r.sha256,phone.sprites[name].sha256);assert.equal(r.sourceSha256,phone.sprites[name].sourceSha256);assert.deepEqual(r.bakedMask,phone.sprites[name].bakedMask);assert.equal(r.bakedMask.supersample,4);}
 const native=geometryModule.exports.approvedFaceGeometry(e.w,e.h,face==='inner'?'wide':'cover');
 const compare=(a,b)=>{close(a.left,b.x);close(a.top,b.y);close(a.width,b.w);close(a.height,b.h);};
 native.agentKeys.forEach((r,i)=>compare(r,m.layout.agentSlotsPt[i]));native.commands.forEach((r,i)=>compare(r,m.layout.cmdSlotsPt[i]));
 for(const [nativeName,manifestName] of [['status','status'],['stick','stick'],['voice','ptt'],['dial','dial']])compare(native[nativeName],m.layout[manifestName]);
 native.spriteRects.agentKeys.forEach((r,i)=>compare(r,m.spriteRectsPt.agentSlotsPt[i]));native.spriteRects.commands.forEach((r,i)=>compare(r,m.spriteRectsPt.cmdSlotsPt[i]));
 const l=m.layout;assert.equal(l.agentSlotsPt.length,e.n);assert.equal(l.cmdSlotsPt.length,6);close(l.status.x,16);close(l.status.y,34);close(l.status.w,e.w-32);close(l.status.h,e.statusH);
 close(l.agentSlotsPt[0].y,e.firstY);close(l.agentSlotsPt[0].w,e.keyW);close(l.agentSlotsPt[0].h,e.keyH);close(l.cmdSlotsPt[0].x,e.commandX);close(l.cmdSlotsPt[0].w,e.commandW);close(l.stick.y,e.controlY);
 for(const group of ['agentSlotsPt','cmdSlotsPt'])for(const r of l[group]){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=e.w&&r.y+r.h<=e.h);}
 for(const [group,x,y,w,h] of [['agentSlotsPt',.04,.04,1.08,1.1],['cmdSlotsPt',.04,.05,1.08,1.12]])l[group].forEach((r,i)=>{const s=m.spriteRectsPt[group][i];close(s.x,r.x-r.w*x);close(s.y,r.y-r.h*y);close(s.w,r.w*w);close(s.h,r.h*h);});
 const size=l.stick.w;close(l.ptt.w,size*1.05);close(l.ptt.h,size*1.08);close(l.ptt.y,l.stick.y-size*.02);assert.deepEqual(m.spriteRectsPt.ptt,l.ptt);
 assert.equal(m.renderer.wellCount,e.n+10);assert.equal(m.renderer.movingPartObjects,0);assert.equal(m.renderer.additionalScrews,0);assert.equal(m.renderer.wordmarks,0);assert.deepEqual(m.renderer.staticControls,{stickRings:1,dialTicks:32});assert.equal(m.renderer.samples,128);
}
console.log('PASS: approved Fold background hashes / canonical float geometry / 32 unchanged phone sprites / background-only render');
