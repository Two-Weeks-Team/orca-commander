/** Check real public documentation references and immutable media inputs. */
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const digest=b=>createHash('sha256').update(b).digest('hex');
const fence=String.fromCharCode(96).repeat(3);
const clean=text=>text.replace(new RegExp('^'+fence+'[\\s\\S]*?^'+fence,'gm'),'');
function headings(text){
 const counts=new Map(),ids=new Set();
 for(const match of clean(text).matchAll(/^#{1,6}\s+(.+)$/gm)){
  const base=match[1].trim().toLowerCase().replace(/<[^>]*>/g,'').replace(/[^\p{L}\p{N}_ -]/gu,'').replace(/ /g,'-');
  const n=counts.get(base)||0;counts.set(base,n+1);ids.add(base+(n?'-'+n:''));
 }
 for(const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g))ids.add(match[1]);
 return ids;
}
let links=0,docs=0;
for(const file of [...new Set(files)].filter(f=>f.endsWith('.md'))){
 const text=clean(readFileSync(path.join(root,file),'utf8'));docs++;
 const refs=[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(m=>m[1]).concat([...text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]));
 for(const raw of refs){
  if(/^(?:https?:|mailto:|data:)/i.test(raw))continue;
  const [target,fragment]=raw.split('#'),relative=decodeURIComponent(target.split('?')[0]);
  const full=relative?path.resolve(root,path.dirname(file),relative):path.join(root,file);
  assert(full===root||full.startsWith(root+path.sep),'Reference escapes public tree: '+file);
  assert(existsSync(full),'Missing reference '+file+' → '+raw);
  if(fragment&&full.endsWith('.md'))assert(headings(readFileSync(full,'utf8')).has(decodeURIComponent(fragment)),'Missing heading '+file+' → '+raw);
  links++;
 }
 for(const img of text.matchAll(/<img\b[^>]*>/g))assert(/\balt=["'][^"']+["']/.test(img[0]),'Missing image alt text in '+file);
}
const media=path.join(root,'docs/media');
const images=JSON.parse(readFileSync(path.join(media,'images.json'),'utf8'));
assert(images.length>=11,'Expected substantive UI and diagram gallery');
for(const entry of images){
 assert(/^[a-z0-9-]+\.(png|jpg|svg)$/.test(entry.file),'Unsafe media filename');
 const bytes=readFileSync(path.join(media,entry.file));
 assert.equal(bytes.length,entry.bytes,entry.file+' byte count');
 assert.equal(digest(bytes),entry.sha256,entry.file+' hash');
 if(entry.file.endsWith('.png')){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',entry.file+' format');
  assert.equal(bytes.readUInt32BE(16),entry.width,entry.file+' width');
  assert.equal(bytes.readUInt32BE(20),entry.height,entry.file+' height');
 }else if(entry.file.endsWith('.svg')){
  const svg=bytes.toString('utf8');assert(svg.includes('<svg '),'SVG format');
  assert(!/<script\b|<foreignObject\b|(?:href|src)=["'](?:https?:|data:)/i.test(svg),'SVG must be self-contained');
 }else assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8','JPEG format');
}
const provenance=JSON.parse(readFileSync(path.join(media,'preview-provenance.json'),'utf8'));
assert.equal(provenance.kind,'source-components-on-react-native-web');
assert.equal(provenance.screens.length,7);
assert(provenance.data.includes('synthetic'));
for(const input of [...provenance.sourceInputs,...provenance.editorFiles]){
 assert(!path.isAbsolute(input.file)&&!input.file.split('/').includes('..'),'Provenance path');
 assert.equal(digest(readFileSync(path.join(root,input.file))),input.sha256,'Render input changed: '+input.file);
}
const tooling=JSON.parse(readFileSync(path.join(root,'scripts/showcase/package.json'),'utf8'));
assert.deepEqual(provenance.tooling,tooling.dependencies,'Tooling versions');
console.log('PASS: '+docs+' Markdown files, '+links+' local references, '+images.length+' reviewed media hashes and '+(provenance.sourceInputs.length+provenance.editorFiles.length)+' render inputs. Native/device acceptance is outside this check.');
