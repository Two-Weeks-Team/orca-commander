import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
export function renderer(locale='ko',width=411,height=891,fontScale=1.1,overrides={}){
 const cache=new Map(),states=new Map();let owner='',slot=0;const refs=new Map();
 const useState=initial=>{const k=owner+':'+slot++;if(!states.has(k))states.set(k,typeof initial==='function'?initial():initial);return[states.get(k),v=>states.set(k,typeof v==='function'?v(states.get(k)):v)];};
 const react={useState,useRef:initial=>{const k=owner+':'+slot++;if(!refs.has(k))refs.set(k,{current:initial});return refs.get(k);},useEffect(){},useMemo:f=>f(),useCallback:f=>f,useSyncExternalStore:(_,get)=>get(),createContext:current=>{const c={current};c.Provider=({value,children})=>{c.current=value;return children;};return c;},useContext:c=>c.current,forwardRef:f=>f};
 const jsx=(type,props,key)=>({type,key,props:props??{}}),native=Object.fromEntries(['View','Text','TextInput','Pressable','ScrollView','Modal','Image','KeyboardAvoidingView'].map(n=>[n,n]));
 Object.assign(native,{StyleSheet:{create:s=>s,absoluteFill:{position:'absolute',inset:0},flatten:s=>Object.assign({},...[s].flat(Infinity).filter(Boolean))},useWindowDimensions:()=>({width,height,fontScale,scale:3}),PixelRatio:{getFontScale:()=>fontScale},Platform:{OS:'ios',select:o=>o.ios},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Animated:{Value:class{setValue(){}interpolate(){return'0deg';}},View:'View',loop:()=>({start(){},stop(){}}),timing:()=>({})},Easing:{linear:()=>{}},Alert:{alert(){}}});
 const {createTranslator}=require('../../.test-build/src/i18n/messages.js');const t=createTranslator(locale);
 const preferences={language:'auto',screenMode:'auto',clicks:true};const updates=[];
 const messages={t,locale,presentationRevision:1,preferences,preferencesReady:true,preferencesWritable:true,updatePreferences:p=>updates.push(p)};
 function load(file){
  const full=path.resolve(root,file);if(cache.has(full))return cache.get(full).exports;
  const module={exports:{}};cache.set(full,module);
  const req=id=>{
   if(Object.hasOwn(overrides,id))return overrides[id];
   if(id==='react')return react;if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
   if(id==='react-native')return native;if(id==='expo-image')return{Image:'Image'};
   if(id==='react-native-safe-area-context')return{SafeAreaProvider:'View',SafeAreaView:'View',useSafeAreaInsets:()=>({top:0,right:0,bottom:24,left:0})};
   if(id.endsWith('/i18n/provider'))return{useMessages:()=>messages};
   if(id.endsWith('/adapters/deck-feedback'))return{feedbackStatus:()=>({supported:true,ready:true}),deckClick(){}};
   if(id.startsWith('.')){
    const base=path.resolve(path.dirname(full),id);
    if(/\.(png|ttf|wav)$/.test(id))return base;
    if(id.endsWith('.json'))return JSON.parse(readFileSync(base,'utf8'));
    const p=['.ts','.tsx','.js','/index.ts'].map(e=>base+e).find(existsSync);
    if(p)return load(path.relative(root,p));
   }
   return require(id);
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:req,Date,performance,console,setTimeout,clearTimeout,setInterval,clearInterval});return module.exports;
 }
 function render(Component,props={}){owner=Component.name;slot=0;return Component(props);}
 function walk(n){if(Array.isArray(n))return n.flatMap(walk);if(!n?.props)return[];if(typeof n.type==='function')return walk(render(n.type,n.props));return[n,...walk(n.props.children)];}
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'||typeof n==='number'?String(n):n?.props?text(n.props.children):'';
 return{load,render,walk,text,native,t,messages,updates,states,react};
}
