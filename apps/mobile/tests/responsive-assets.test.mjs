import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
const root=new URL('../../../',import.meta.url),assets=new URL('../assets/deck/',import.meta.url),pack=new URL('responsive/',assets);
const read=(file,base=pack)=>readFileSync(new URL(file,base)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function rgba(bytes){
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(bytes[24],8);assert.equal(bytes[25],6);assert.equal(bytes[28],0);
 const chunks=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at),kind=bytes.subarray(at+4,at+8).toString();if(kind==='IDAT')chunks.push(bytes.subarray(at+8,at+8+size));at+=size+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(width*height*4);assert.equal(raw.length,(stride+1)*height);
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];assert.ok(filter<=4);for(let x=0;x<stride;x++){const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 return{width,height,pixels,alpha:(x,y)=>pixels[(y*width+x)*4+3]};
}
const m=JSON.parse(read('manifest.json'));
assert.equal(m.approval.compose.sha256,'3bc91dd52264a3275757651a12e5a99ce3289b7a1a7c644996110e354aacdab4');assert.equal(m.approval.matrix.sha256,'0ef3dc97a4f52580e7c9d479e4c7c5bf666153ed5bfd5a2cef56633cd9e4810b');
assert.equal(m.format,1);assert.equal(m.kind,'responsive-primitives');assert.equal(m.pxPerPt,3);assert.equal(m.alphaBaked,true);
assert.deepEqual(Object.keys(m.primitives).sort(),['agentWell','commandWell','dialTicks','lcdWell','metalPlate','pttWell','stickRing'].sort());
const phoneBytes=read('manifest.json',assets),phone=JSON.parse(phoneBytes);assert.equal(sha(phoneBytes),m.sourcePhoneManifestSha256);assert.equal(m.sourcePhoneManifestSha256,'d547e0fef23b1f642f6e8e272d66890b285b3b7583a90fa836c745366ec5a203');
assert.equal(sha(read(phone.base.file,assets)),phone.base.sha256);assert.equal(phone.base.sha256,'08efc7ccfcf341d48fadf87797a1aebe9ce3e851121cee0f036e8ee9ef244dce');
assert.equal(Object.keys(m.reusedPhoneSprites).length,32);assert.equal(Object.keys(phone.sprites).length,32);
for(const [name,sprite] of Object.entries(phone.sprites)){assert.equal(sha(read(sprite.file,assets)),sprite.sha256);assert.equal(m.reusedPhoneSprites[name].sha256,sprite.sha256);assert.equal(m.reusedPhoneSprites[name].sourceSha256,sprite.sourceSha256);}
for(const [file,expected] of Object.entries(m.provenance.files))assert.equal(sha(read(file,root)),expected,file);
assert.equal(m.renderer.engine,'CYCLES');assert.equal(m.renderer.samples,128);assert.equal(m.renderer.pxPerPt,3);assert.equal(m.renderer.denoising,true);assert.equal(m.renderer.viewTransform,'Khronos PBR Neutral');assert.ok(Math.abs(m.renderer.exposure+0.1)<1e-6);assert.equal(m.renderer.movingPartObjects,0);assert.equal(m.renderer.dialTicks,32);
for(const [name,p] of Object.entries(m.primitives)){
 const bytes=p.file?read(p.file):read(p.sourceImage.file,root),image=rgba(bytes);assert.equal(sha(bytes),p.file?p.sha256:p.sourceImage.sha256,name);assert.equal(bytes.length,p.file?p.bytes:p.sourceImage.bytes);assert.deepEqual({w:image.width,h:image.height},p.actualPx);assert.equal(image.width,Math.round(p.referencePt.w*3));assert.equal(image.height,Math.round(p.referencePt.h*3));
 assert.ok(p.contentRectPt.x>=0&&p.contentRectPt.y>=0&&p.contentRectPt.x+p.contentRectPt.w<=p.referencePt.w+1e-8&&p.contentRectPt.y+p.contentRectPt.h<=p.referencePt.h+1e-8);
 if(name==='metalPlate'){for(let i=3;i<image.pixels.length;i+=4)assert.equal(image.pixels[i],255);assert.equal(p.alphaMode,'opaque');}
 else{
  assert.equal(p.alphaMode,'baked-shape');for(const [x,y] of [[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]])assert.equal(image.alpha(x,y),0,name+' has transparent outer corners');
  assert.equal(image.alpha(Math.floor(image.width/2),Math.floor(image.height/2)),255,name+' floor is RGB-backed, not a hole to the plate');assert.ok(image.pixels.some((v,i)=>i%4===3&&v>0&&v<255),name+' retains baked antialiasing');
  const mask=p.bakedMask;assert.equal(mask.supersample,4);assert.equal(mask.outsetPt,3);assert.equal(mask.radiusPt,{lcdWell:14,agentWell:20,commandWell:18,pttWell:24,stickRing:54,dialTicks:54}[name]);
  const c=p.contentRectPt,left=c.x-3,right=c.x+c.w+3,top=c.y-3,bottom=c.y+c.h+3,radius=mask.radiusPt+3;
  for(let y=0;y<image.height;y+=3)for(let x=0;x<image.width;x+=3){const px=(x+0.5)/3,py=(y+0.5)/3;let distance;if(mask.shape==='circle'){distance=Math.hypot(px-(left+right)/2,py-(top+bottom)/2)-(right-left)/2;}else{assert.equal(mask.shape,'rrect');const qx=Math.abs(px-(left+right)/2)-((right-left)/2-radius),qy=Math.abs(py-(top+bottom)/2)-((bottom-top)/2-radius);distance=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius;}if(distance>1)assert.equal(image.alpha(x,y),0,name+' alpha is outside the physical hull');else if(distance<-1)assert.equal(image.alpha(x,y),255,name+' physical floor remains opaque');}

 }
 if(p.patches){
  assert.ok(['lcdWell','agentWell','commandWell','pttWell'].includes(name));assert.equal(p.patches.length,9);assert.ok(p.capInsetsPt.left>0&&p.capInsetsPt.top>0);const rebuilt=Buffer.alloc(image.pixels.length);
  for(const patch of p.patches){const data=read(patch.file),child=rgba(data),r=patch.sourceRectPx;assert.equal(sha(data),patch.sha256);assert.equal(child.width,r.w);assert.equal(child.height,r.h);assert.equal(child.width,Math.round(patch.referencePt.w*3));assert.equal(child.height,Math.round(patch.referencePt.h*3));for(let y=0;y<r.h;y++)child.pixels.copy(rebuilt,((r.y+y)*image.width+r.x)*4,y*r.w*4,(y+1)*r.w*4);}
  assert.ok(rebuilt.equals(image.pixels),name+' 9 PNGs reconstruct the full actual RGBA exactly');
 }else assert.ok(['metalPlate','stickRing','dialTicks'].includes(name));
 if(name==='stickRing'||name==='dialTicks'){assert.equal(p.preserveAspect,true);assert.equal(image.width,image.height);}
}
assert.equal(readdirSync(pack).filter(file=>file.endsWith('.png')).length,39);assert.equal(m.shippingPngCount,39);
console.log('PASS: responsive real PNG/hash/alpha/3px-per-point/9patch roundtrip/provenance and 32 unchanged phone sprites (no device acceptance)');
