import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Check real JSX layout choices and run the real keyboard/close handlers. This is a source
// regression, not a native layout measurement or proof that a keyboard is gone on a device.
const url=new URL('../src/ui/deck-input-sheet.tsx',import.meta.url),text=readFileSync(url,'utf8');
const source=ts.createSourceFile(url.pathname,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const digest=value=>createHash('sha256').update(value).digest('hex');
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
const elements=[];let closeText,discardText;
function visit(node){
 if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node))elements.push(node);
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='close')closeText=node.initializer?.getText(source);
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='discardShortcuts')discardText=node.initializer?.getText(source);
 ts.forEachChild(node,visit);
}
visit(source);
const opening=node=>ts.isJsxElement(node)?node.openingElement:node;
const tag=node=>opening(node).tagName.getText(source);
const attr=(node,name)=>opening(node).attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(source)===name);
function value(node,name,environment={}){
 const attribute=attr(node,name);if(!attribute)return undefined;if(!attribute.initializer)return true;
 if(ts.isStringLiteral(attribute.initializer))return attribute.initializer.text;
 assert.ok(ts.isJsxExpression(attribute.initializer));return expression(attribute.initializer.expression.getText(source),environment);
}
function expression(code,environment){return vm.runInNewContext(ts.transpileModule('('+code+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,environment);}
const kav=elements.find(node=>tag(node)==='KeyboardAvoidingView');assert.ok(kav,'the fullscreen input modal must avoid the software keyboard');
const scroll=elements.find(node=>tag(node)==='ScrollView');assert.ok(scroll);
const modal=elements.find(node=>tag(node)==='Modal');assert.ok(modal);
const header=elements.find(node=>tag(node)==='SheetHeader');assert.ok(header,'the input sheet uses the shared fixed header');
const under=(node,parent)=>node.pos>=parent.pos&&node.end<=parent.end;
same(under(kav,modal),true);same(under(scroll,kav),true);same(under(header,kav),true);same(under(header,scroll),false,'header controls stay outside scrollable editor content');
same(value(header,'testIDPrefix'),'deck-input');
for(const OS of ['ios','android']){
 const env={Platform:{OS},reviewVisible:false};
 same(value(kav,'behavior',env),OS==='ios'?'padding':undefined,'Android uses its native Modal resize instead of double JS avoidance');
 same(value(kav,'keyboardVerticalOffset',env)??0,0,'fullscreen modal has no navigation/header offset');
 same(value(kav,'style',env).flex,1);same(value(scroll,'style',env).flex,1);same(value(scroll,'style',env).minHeight,0);
 same(value(scroll,'keyboardDismissMode',env),OS==='ios'?'interactive':'on-drag');
}
same(value(scroll,'keyboardShouldPersistTaps'),'handled');same(value(scroll,'automaticallyAdjustKeyboardInsets'),false,'one iOS keyboard inset owner');
// Shared header: close is always pinned top-right; keyboard dismissal exists only while a keyboard is shown.
const headerUrl=new URL('../src/ui/sheet-header.tsx',import.meta.url),headerText=readFileSync(headerUrl,'utf8');
const headerSource=ts.createSourceFile(headerUrl.pathname,headerText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const headerElements=[];(function walk(node){if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node))headerElements.push(node);ts.forEachChild(node,walk);})(headerSource);
const hOpening=node=>ts.isJsxElement(node)?node.openingElement:node;
const hAttr=(node,name)=>hOpening(node).attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(headerSource)===name);
const hValue=(node,name,environment={})=>{const attribute=hAttr(node,name);if(!attribute)return undefined;if(!attribute.initializer)return true;if(ts.isStringLiteral(attribute.initializer))return attribute.initializer.text;return expression(attribute.initializer.expression.getText(headerSource),environment);};
const hTag=node=>hOpening(node).tagName.getText(headerSource);
const env={testIDPrefix:'deck-input'};
const hide=headerElements.find(node=>hTag(node)==='Pressable'&&hValue(node,'testID',env)==='deck-input-hide-keyboard');assert.ok(hide,'keyboard dismissal control exists');
const close=headerElements.find(node=>hTag(node)==='Pressable'&&hValue(node,'testID',env)==='deck-input-close');assert.ok(close,'close control exists');
let conditional=hide.parent;while(conditional&&!ts.isConditionalExpression(conditional))conditional=conditional.parent;
same(conditional?.condition.getText(headerSource),'keyboard','keyboard dismissal renders only while a keyboard is shown');
let closeConditional=close.parent;while(closeConditional&&!ts.isConditionalExpression(closeConditional)&&!ts.isSourceFile(closeConditional))closeConditional=closeConditional.parent;
same(ts.isSourceFile(closeConditional),true,'close is never conditional');
const S={secondary:{flex:1}};
for(const button of [hide,close]){
 const flattened=Object.assign({},...hValue(button,'style',{S}));
 same(flattened.minHeight>=48,true);same(flattened.height,undefined,'controls may grow with large text');same(hValue(button,'android_disableSound'),true);
 same(flattened.flexShrink,1);same(hValue(button,'accessibilityRole'),'button');
}
const controlRow=headerElements.find(node=>hTag(node)==='View'&&hide.pos>=node.pos&&close.end<=node.end&&hValue(node,'style')?.flexDirection==='row');assert.ok(controlRow);
same(hValue(controlRow,'style').flexWrap,undefined,'controls never wrap under a long title');
const titleNode=headerElements.find(node=>hTag(node)==='Text'&&hValue(node,'accessibilityRole')==='header');assert.ok(titleNode);same(under(titleNode,controlRow),false,'title has its own full-width row');
let dismisses=0;hValue(hide,'onPress',{Keyboard:{dismiss:()=>{dismisses++;}}})();same(dismisses,1);
const state={selected:'original-owner',savedVisible:false},draft={text:'Original unsent draft',retained:['Full retained transcript']};
const environment={reviewDismissal:{current:undefined},viewSequence:{current:0},reviewOwner:{current:undefined},setReviewVisible(){},Keyboard:{dismiss:()=>{dismisses++;}},entries:{current:new Map([['original-owner',draft]])},setSavedVisible:value=>{state.savedVisible=value;},setSelected:value=>{state.selected=value;}};
environment.discardShortcuts=expression(discardText,environment);
const closeHandler=expression(closeText,environment);environment.close=closeHandler;
same(state.selected,'original-owner');same(draft.text,'Original unsent draft');same(draft.retained[0],'Full retained transcript');
same(value(modal,'onRequestClose',environment),closeHandler,'Android back uses the same preserving close path');
same(value(header,'onClose',environment),closeHandler,'header close uses the same preserving close path');environment.reviewDismissal.current={};closeHandler();same(dismisses,1,'parent header/Back cannot dismiss during the child native transition');same(state.selected,'original-owner');environment.reviewDismissal.current=undefined;closeHandler();same(dismisses,2);same(state.selected,null);same(environment.entries.current.get('original-owner'),draft);
// Version-matched native contract: RN 0.83 modal windows request adjustResize themselves.
const nativeModal=readFileSync(new URL('../node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/modal/ReactModalHostView.kt',import.meta.url),'utf8');
same(/setSoftInputMode\(WindowManager\.LayoutParams\.SOFT_INPUT_ADJUST_RESIZE\)/.test(nativeModal),true);
const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));same(config.expo.android.softwareKeyboardLayoutMode??'resize','resize');
same(digest(readFileSync(url,'utf8')),digest(text));
console.log(`PASS: ${count} input keyboard layout/handler assertions (source only; no native geometry/device proof)`);
