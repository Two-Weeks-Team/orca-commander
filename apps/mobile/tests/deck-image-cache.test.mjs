import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
// Android's bundled resource IDs can move between builds. Every original deck image
// must bypass disk caching, including images added to these sheet modules later.
const dir=new URL('../src/ui/deck/',import.meta.url),files=readdirSync(dir).filter(n=>n.endsWith('.tsx')).map(n=>new URL(n,dir));
files.push(new URL('../src/ui/action-history.tsx',import.meta.url));
let images=0;const failures=[];
for(const file of files){
 const source=ts.createSourceFile(file.pathname,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(n){
  if((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(source)==='Image'){
   images++;const prop=n.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.text==='cachePolicy');
   if(!prop||!prop.initializer||!ts.isStringLiteral(prop.initializer)||prop.initializer.text!=='memory')failures.push(file.pathname+':'+(source.getLineAndCharacterOfPosition(n.getStart()).line+1));
  }ts.forEachChild(n,visit);
 }visit(source);
}
assert.ok(images>9,'scan actual deck Image nodes');assert.deepEqual(failures,[],'all bundled deck images must explicitly use memory cache');
console.log('PASS: '+images+' deck Image nodes explicitly bypass Android disk cache');
