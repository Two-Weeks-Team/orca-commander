import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url),face=readFileSync(new URL('../src/ui/deck/DeckScreen.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('DeckScreen.tsx',face,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let bounded=0,unbounded=0,markBound=false;
function visit(node){
 if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
  const tag=node.tagName.getText(ast);if(tag==='DeckText')bounded++;if(tag==='Text')unbounded++;
  if(tag==='StateMark')markBound=node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='onDeckFace'&&(!p.initializer||p.initializer.getText(ast)==='{true}'));
 }
 ts.forEachChild(node,visit);
}
visit(ast);assert.ok(bounded>15,'every physical face label must use the bounded native text policy');assert.equal(unbounded,0);assert.ok(markBound,'text state glyphs must follow the face policy too');
function load(file,dependencies){
 const source=readFileSync(new URL(file,import.meta.url),'utf8'),module={exports:{}};
 const code=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>id in dependencies?dependencies[id]:require(id)});return module.exports;
}
const native={Text:'native-text',View:'native-view',AccessibilityInfo:{},Animated:{Value:class{interpolate(){return 0;}}},Easing:{},StyleSheet:{flatten:style=>style}};
const text=load('../src/ui/deck/deck-text.tsx',{'react-native':native});
assert.equal(text.DECK_TEXT_MAX_MULTIPLIER,1.5);
const full='100% · 100%\nOwner e\u0301 😀';const style={fontSize:20};
for(const props of [{},{numberOfLines:2},{allowFontScaling:false,maxFontSizeMultiplier:9,adjustsFontSizeToFit:false}]){
 const rendered=text.DeckText({...props,style,children:full,accessibilityLabel:full});
 assert.equal(rendered.type,'native-text');assert.equal(rendered.props.maxFontSizeMultiplier,1.5);assert.equal(rendered.props.allowFontScaling,true);assert.equal(rendered.props.adjustsFontSizeToFit,true);assert.equal(rendered.props.numberOfLines,props.numberOfLines??1);assert.equal(rendered.props.children,full);assert.equal(rendered.props.accessibilityLabel,full);assert.ok(rendered.props.style.includes(style));assert.equal(rendered.props.style[0].includeFontPadding,false);
}
const title=text.DeckText({variant:'title',style:{fontSize:3},children:full});
assert.equal(title.props.adjustsFontSizeToFit,false,'long tab titles ellipsize instead of shrinking without a readable floor');
assert.equal(title.props.ellipsizeMode,'tail');
assert.equal(title.props.style.at(-1).fontSize,12,'tab title base size never goes below 12dp');
assert.equal(title.props.children,full,'ellipsis never truncates the underlying owner text');
const hooks={useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
const marks=load('../src/ui/deck/state-mark.tsx',{'react-native':native,react:hooks,'expo-image':{Image:'image'},'./deck-assets':{deckIcons:{}},'./deck-text':text});
const ordinary=marks.StateMark({glyph:{kind:'text',text:'◉'},color:'#fff',size:24,animate:false});
assert.equal(ordinary.type,'native-text');assert.equal(ordinary.props.maxFontSizeMultiplier,undefined,'List retains ordinary system text scaling');
const onFace=marks.StateMark({glyph:{kind:'text',text:'◉'},color:'#fff',size:24,animate:false,onDeckFace:true});
assert.equal(onFace.type,text.DeckText);
assert.equal(readFileSync(new URL('../src/ui/deck/DeckList.tsx',import.meta.url),'utf8').includes('DeckText'),false);
console.log('PASS: bounded face text / full owner content / 1.5 cap / system-scaled List assertions (actual JSX; no native layout claim)');

const command=text.DeckText({variant:'command',style:{fontSize:13},children:'Synthetic critical label'});
assert.equal(command.props.adjustsFontSizeToFit,false,'critical command labels cannot shrink to hide a layout failure');
assert.equal(command.props.maxFontSizeMultiplier,1.5);

assert.equal(text.DeckText({variant:'command',style:{fontSize:3}}).props.style.at(-1)?.fontSize,13,'critical command base cannot fall below13');
