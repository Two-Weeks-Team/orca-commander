import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);

// Actual provider/preferences/Customize and pack-store source, fake hook/effect scheduler and ports.
// This does not mount React, access native storage/files, or establish device acceptance.
const root=fileURLToPath(new URL('../src/',import.meta.url));
let count=0,current;
const same=(a,b)=>{count++;assert.deepEqual(a,b);};
const equalDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
class Engine{
 constructor(fn){this.fn=fn;this.hooks=[];this.dirty=true;this.effects=[];}
 render(){if(!this.dirty)return;this.dirty=false;this.at=0;current=this;this.tree=this.fn({children:null});current=undefined;for(const run of this.effects.splice(0))run();}
 dispose(){for(const cell of this.hooks)cell?.cleanup?.();}
}
const react={
 createContext:value=>({value,Provider:'Provider'}),useContext:context=>context.value,
 useState(initial){const e=current,i=e.at++;const cell=e.hooks[i]??(e.hooks[i]={value:typeof initial==='function'?initial():initial});return[cell.value,next=>{const value=typeof next==='function'?next(cell.value):next;if(!Object.is(value,cell.value)){cell.value=value;e.dirty=true;}}];},
 useRef(initial){const e=current,i=e.at++;return e.hooks[i]??(e.hooks[i]={current:initial});},
 useMemo(fn,deps){const e=current,i=e.at++,old=e.hooks[i];if(!old||!equalDeps(old.deps,deps))e.hooks[i]={deps,value:fn()};return e.hooks[i].value;},
 useEffect(fn,deps){const e=current,i=e.at++,old=e.hooks[i];if(!old||!equalDeps(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};e.hooks[i]=cell;e.effects.push(()=>{cell.cleanup?.();cell.cleanup=fn();});}},
 useSyncExternalStore(subscribe,get){const e=current,i=e.at++;if(!e.hooks[i])e.hooks[i]={cleanup:subscribe(()=>{e.dirty=true;})};return get();},
};
const jsx=(type,props)=>({type,props:props??{}}),STORE='deck.preferences.v1';
const owner={format:1,screenMode:'list',language:'ja',clicks:false};
const pack={format:1,lang:'ja',script:'Jpan',name:'Japanese',sourceVersion:'a'.repeat(64),strings:{'cmd.allow':'Allow'}};
const library=JSON.stringify({format:1,packs:[pack],reviews:[]});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function environment({raw=JSON.stringify(owner),packRaw=library,failPack=false,failRead=false}={}){
 let packs,initialLoad,providerEngine,getFail=failRead,packFail=failPack,setFail=false,held,active=0,maxActive=0;
 const data=new Map([[STORE,raw]]),events=[],sets=[];
 const storage={async get(key){events.push('prefs:get');if(getFail)throw Error('synthetic read failure');return data.get(key)??null;},async set(key,value){sets.push(value);events.push('prefs:set');active++;maxActive=Math.max(maxActive,active);try{if(held){const gate=held;held=undefined;await gate.promise;}if(setFail)throw Error('synthetic write failure');data.set(key,value);events.push('prefs:written');}finally{active--;}}};
 const packStorage={async get(){events.push('packs:get');if(packFail)throw Error('synthetic pack read failure');return packRaw;},async set(key,value){packRaw=value;events.push('packs:set');}};
 const modules=new Map();
 function load(file){
  if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const require=name=>{
   // These handler tests retain their legacy surface; D30 real skins are covered separately.
   if(name.endsWith('/sheet-controls'))return {SheetButton:'Pressable',SheetText:'Text',LCD:'View',useSheetSkin:()=>false};
   if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable',useWindowDimensions:()=>({width:390,height:844,fontScale:1,scale:3})};
   if(name==='expo-localization')return{useLocales:()=>[]};if(name.endsWith('/deck-feedback'))return{prepareFeedback(){},setFeedbackEnabled(){},feedbackStatus:()=>({supported:true,ready:true})};
   if(name.endsWith('/secure-store'))return{expoSecureValueStore:storage};if(name.endsWith('/installed-packs')||name==='./installed-packs')return{languagePacks:packs,ensureLanguagePacksLoaded:()=>initialLoad??(initialLoad=packs.load())};
   if(name==='../../i18n/provider')return{useMessages:()=>providerEngine.tree.props.value};if(name==='./language-packs')return{LanguagePacks:()=>null};if(name==='../theme')return{S:{}};
   if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name);return load(['.ts','.tsx'].map(ext=>base+ext).find(fs.existsSync));}return nativeRequire(name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'})',{TextEncoder,Date,setInterval:()=>0,clearInterval(){}},{filename:file})(require,module,module.exports);return module.exports;
 }
 packs=load(path.join(root,'i18n/pack-store.ts')).createPackStore(packStorage,{maxValueBytes:2*1024*1024});
 const {MessagesProvider}=load(path.join(root,'i18n/provider.tsx')),{Customize}=load(path.join(root,'ui/deck/customize.tsx'));
 providerEngine=new Engine(MessagesProvider);
 const flush=async()=>{for(let i=0;i<100;i++){providerEngine.render();await Promise.resolve();}providerEngine.render();};
 const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
 const buttons=()=>{const e=new Engine(Customize);e.render();e.render();const nodes=walk(e.tree);e.dispose();return nodes.filter(n=>n.type==='Pressable');};
 return{packs,data,sets,events,flush,value:()=>providerEngine.tree.props.value,buttons,readFail:v=>getFail=v,packFail:v=>packFail=v,writeFail:v=>setFail=v,hold:()=>held=deferred(),maxActive:()=>maxActive,dispose:()=>providerEngine.dispose()};
}
// A single settings retry must recover packs before validating the saved language, without writing preferences.
{
 const e=environment({failPack:true});await e.flush();same(e.value().preferencesWritable,false);e.packFail(false);e.events.length=0;e.buttons().find(n=>n.props.children?.props.children===e.value().t('common.retry')).props.onPress();await e.flush();
 same(e.packs.getSnapshot().phase,'ready');same(e.events.indexOf('packs:get')<e.events.indexOf('prefs:get'),true);same(e.events.includes('packs:set'),false);same(e.value().preferencesWritable,true);same(JSON.stringify(e.value().preferences),JSON.stringify(owner));same(e.sets.length,0);e.dispose();
}
// A structurally valid missing locale can be changed only by explicit en/ko recovery, preserving other fields.
{
 const e=environment({packRaw:null});await e.flush();same(e.value().preferencesRecoveryLanguage,'ja');same(e.value().preferencesWritable,false);
 e.value().updatePreferences({clicks:true});e.value().updatePreferences({language:'auto'});await e.flush();same(e.sets.length,0);
 e.value().recoverPreferencesLanguage('auto');await e.flush();same(e.sets.length,0);
 const english=e.buttons().find(n=>n.props.accessibilityRole==='radio'&&n.props.children?.props.children===e.value().t('set.english'));same(english.props.disabled,false);english.props.onPress();await e.flush();
 same(JSON.parse(e.data.get(STORE)),{...owner,language:'en'});same(e.value().preferencesWritable,true);same(e.value().preferencesRecoveryLanguage,null);e.dispose();
}
// Invalid schema, duplicate keys, invalid locale and actual read failure never gain recovery write authority.
for(const raw of ['{',JSON.stringify({...owner,format:99}),JSON.stringify({...owner,extra:1}),'{"format":1,"screenMode":"list","language":"ja","clicks":false,"clicks":true}',JSON.stringify({...owner,language:'not a locale'})]){
 const e=environment({raw,packRaw:null});await e.flush();same(e.value().preferencesRecoveryLanguage,null);e.value().recoverPreferencesLanguage('ko');e.value().updatePreferences({clicks:true});await e.flush();same(e.sets.length,0);same(e.data.get(STORE),raw);e.dispose();
}
{
 const e=environment({failRead:true});await e.flush();same(e.value().preferencesRecoveryLanguage,null);e.value().recoverPreferencesLanguage('en');e.value().updatePreferences({clicks:true});await e.flush();same(e.sets.length,0);e.readFail(false);e.value().reloadPreferences();await e.flush();same(JSON.stringify(e.value().preferences),JSON.stringify(owner));e.dispose();
}
// Runtime active-pack removal publishes a recovery state, never auto-downgrades or throws on another setting.
{
 const e=environment();await e.flush();same(e.value().preferencesWritable,true);const staleSound=e.buttons().find(n=>n.props.accessibilityRole==='switch');await e.packs.removePack('ja');assert.doesNotThrow(()=>staleSound.props.onPress());count++;await e.flush();same(e.value().preferencesWritable,false);same(e.value().preferencesRecoveryLanguage,'ja');
 assert.doesNotThrow(()=>e.value().updatePreferences({clicks:true}));count++;await e.flush();same(e.sets.length,0);same(JSON.parse(e.data.get(STORE)),owner);
 e.value().recoverPreferencesLanguage('ko');await e.flush();same(JSON.parse(e.data.get(STORE)),{...owner,language:'ko'});e.dispose();
}
// Pack revision recovery revalidates an unchanged saved choice without a second settings retry or any write.
{
 const e=environment({packRaw:null});await e.flush();same(e.value().preferencesRecoveryLanguage,'ja');const before=e.events.filter(x=>x==='prefs:get').length;await e.packs.importPack(JSON.stringify(pack));await e.flush();same(e.events.filter(x=>x==='prefs:get').length>before,true);same(e.value().preferencesWritable,true);same(e.value().preferences.language,'ja');same(e.sets.length,0);e.dispose();
}
// Explicit recovery write failure keeps all owner fields and allows the same option to retry.
{
 const e=environment({packRaw:null});await e.flush();e.writeFail(true);e.value().recoverPreferencesLanguage('ko');await e.flush();same(e.value().preferencesError,true);same(JSON.parse(e.data.get(STORE)),owner);same(JSON.stringify(e.value().preferences),JSON.stringify({...owner,language:'ko'}));
 e.writeFail(false);e.value().updatePreferences({language:'ko'});await e.flush();same(JSON.parse(e.data.get(STORE)),{...owner,language:'ko'});same(e.value().preferencesError,false);e.dispose();
}
// Pending writes finish before rereading; rapid callbacks still merge and serialize, without losing owner choices.
{
 const e=environment();await e.flush();const gate=e.hold();e.value().updatePreferences({clicks:true});e.value().updatePreferences({screenMode:'deck'});await e.flush();same(e.sets.length,1);e.value().reloadPreferences();await e.flush();same(e.value().preferencesWritable,false);
 gate.resolve();await e.flush();same(e.maxActive(),1);same(JSON.parse(e.data.get(STORE)),{...owner,screenMode:'deck',clicks:true});same(JSON.stringify(e.value().preferences),JSON.stringify({...owner,screenMode:'deck',clicks:true}));e.dispose();
}
console.log(`PASS: ${count} preference recovery assertions (actual source, fake hooks/storage; no mounted React, native store, host or device)`);
