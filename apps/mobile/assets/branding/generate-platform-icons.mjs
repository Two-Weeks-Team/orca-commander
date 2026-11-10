import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const projectRoot=resolve(here,'../..');
const require=createRequire(join(projectRoot,'package.json'));
// Pin the Expo JS image engine: optional host-global sharp versions must not
// change these checked-in platform derivatives. The canonical logo is read only.
process.env.EXPO_IMAGE_UTILS_NO_SHARP='1';
const {generateImageAsync,createSquareAsync,compositeImagesAsync}=require('@expo/image-utils');
const imageUtilsVersion=require('@expo/image-utils/package.json').version;
assert.equal(imageUtilsVersion,'0.8.17');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const original='orca-deck-logo.png',source=readFileSync(join(here,original));
assert.equal(source.length,1264767);
assert.equal(sha256(source),'e7b8e60b3bba4ec2baa2f3e4e94158d2794d327769fb11c5cd5c46bfe614cb49');
assert.equal(source.readUInt32BE(16),1254);assert.equal(source.readUInt32BE(20),1254);
assert.equal(source[25],6); // Canonical PNG remains the supplied RGBA image.
const ios=(await generateImageAsync({projectRoot},{src:join(here,original),width:1024,height:1024,resizeMode:'contain',backgroundColor:'#000000',removeTransparency:true})).source;
assert.equal(ios[25],2); // RGB PNG, with no alpha channel, for the iOS icon.
const small=(await generateImageAsync({projectRoot},{src:join(here,original),width:466,height:466,resizeMode:'contain',backgroundColor:'transparent'})).source;
const android=await compositeImagesAsync({foreground:small,background:await createSquareAsync({size:1080,color:'#00000000'}),x:307,y:307});
const generated=[['icon-ios.png',ios,{width:1024,height:1024,operation:'contain; opaque black background; RGB PNG'}],['icon-android-foreground.png',android,{width:1080,height:1080,operation:'466px contained original centered at 307,307 on transparent canvas; no crop'}]];
const manifest={format:1,original:{file:original,width:1254,height:1254,bytes:source.length,sha256:sha256(source),unchanged:true},generator:{package:'@expo/image-utils',version:imageUtilsVersion,engine:'jimp-compact (EXPO_IMAGE_UTILS_NO_SHARP=1)'},derived:generated.map(([file,bytes,geometry])=>({file,...geometry,bytes:bytes.length,sha256:sha256(bytes)}))};
const outputs=[...generated.map(([file,bytes])=>[file,bytes]),['provenance.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]];
const check=process.argv.includes('--check');
for(const [file,bytes] of outputs){if(check)assert.deepEqual(readFileSync(join(here,file)),bytes,`${file} must reproduce exactly`);else writeFileSync(join(here,file),bytes);}
assert.deepEqual(readFileSync(join(here,original)),source);
console.log(`PASS: canonical logo unchanged; platform icons ${check?'reproduce exactly':'generated'} with Expo image-utils ${imageUtilsVersion}`);
