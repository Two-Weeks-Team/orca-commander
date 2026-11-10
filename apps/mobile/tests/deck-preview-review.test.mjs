import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {renderer} from './helpers/deck-sheet-render.mjs';
const cases=['states','live-region','settled-key','content','fallback','title','toggle','nav','preserved','usage-layout','history-strip','footer-space','language-packs','language-keys'];
if(!process.argv[2]){
 for(const locale of ['ko','en'])for(const c of cases){const r=spawnSync(process.execPath,[import.meta.filename,c,locale],{encoding:'utf8'});assert.equal(r.status,0,`${c} ${locale}\n${r.stdout}${r.stderr}`);}
 console.log('PASS: D30 review states, announcements, outcome semantics, overflow and actual Home footer wiring');
}else{
 const c=process.argv[2],locale=process.argv[3]??'ko',h=renderer(locale,390,844,1.5),flat=h.native.StyleSheet.flatten;h.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;
 const baseView={keys:[],display:{link:'LIVE',agent:null,counts:null,unresolved:0},commands:{voice:true,nextDecision:{lit:false},list:{lit:false}}};
 const props={frame:{width:390,height:844},view:baseView,focusInfo:{project:'sample-app',worktree:'login-ui',following:true},voiceAvailable:true,onVoicePressIn(){},onVoicePressOut(){},onPressKey(){},onStep(){},onAttention(){},onContent(){},onInput(){},onList(){},onStatus(){},onExplainKey(){},onReconnect(){},onScan(){}};
 const voice={phase:'recording',elapsedMs:7000,text:'Exact partial transcript',level:.5};
 if(c==='states')for(const [extra,key] of [[{phase:'error'},'voiceDisplay.error'],[{preparing:true},'voiceDisplay.preparing'],[{phase:'finishing'},'voiceDisplay.finishing'],[{targetChangeBlocked:true},'voice.targetLocked']]){
  const r=renderer(locale),api=r.load('src/ui/deck/DeckScreen.tsx'),n=r.walk(r.render(api.DeckScreen,{...props,voiceRecording:true,voiceDisplay:{...voice,...extra}}));assert.ok(n.some(n=>n.type==='Text'&&r.text(n)===r.t(key)),key+' remains visible through actual DeckScreen wiring');
 }
 if(c==='live-region'){
  const n=h.walk(h.render(h.load('src/ui/deck/recording-display.tsx').RecordingDisplay,{label:'State',projectPath:'sample-app',text:voice.text,phase:'recording',elapsedMs:7000,level:.5,position:'2/3',counts:null,link:'LIVE',age:'2s',scale:1}));
  assert.equal(n.find(n=>n.props.testID==='deck-recording-transcript').props.accessibilityLiveRegion,undefined,'partial transcript must not auto-speak into the live microphone');assert.equal(n.find(n=>n.props.testID==='deck-recording-status')?.props.accessibilityLiveRegion,'polite','state transitions retain polite announcement');
 }
 if(c==='usage-layout')for(const scale of [1,1.1,1.5]){
  const r=renderer(locale,390,844,scale);r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;
  const usage={observedAt:1000,claude:{status:'ok',session:{usedPercent:46},weekly:{usedPercent:61},fableWeekly:{usedPercent:0}},codex:{status:'ok',session:{usedPercent:18},weekly:{usedPercent:32}}};
  const n=r.walk(r.render(r.load('src/ui/deck/usage-panel.tsx').UsagePanel,{usage,now:1000}));
  for(const provider of ['usage.claude','usage.codex']){const label=n.find(n=>n.type==='Text'&&r.text(n)===r.t(provider));assert.equal(label.props.numberOfLines,1,'provider names cannot break in the middle');assert.ok(flat(label.props.style).minWidth>=54*Math.min(1.5,scale));}
  const row=n.find(n=>n.props.testID==='deck-usage-claude-row');assert.equal(flat(row.props.style).flexDirection,scale>1.15?'column':'row','large type folds label above values, baseline remains compact');
  const gauge=n.find(n=>n.props.testID==='deck-usage-usage.session');assert.equal(flat(gauge.props.style).flexDirection,scale>1.15?'column':'row');assert.notEqual(flat(gauge.props.style).flexWrap,'wrap','gauge labels and values must not wrap unpredictably');
 }
 const receipt={id:'r',at:0,hostId:'h',worktreeId:'w',paneKey:'raw:opaque-pane',hostVersion:'1.4.252',handle:'term',incarnationId:'i',acknowledged:false,bodyAccepted:false,submitAttempted:false};
 if(c==='settled-key'){
  const labels=new Set();for(const status of ['accepted','refused','target_changed','expired','not_connected','busy','unavailable','storage_unavailable','already_submitted','cursor_required']){
   const r=renderer(locale);r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;const n=r.walk(r.render(r.load('src/ui/action-history.tsx').ActionHistory,{receipts:[{...receipt,status}],busy:false,titleFor:()=> 'Owned title',now:1000,onAcknowledge:async()=>false}));const key=n.find(n=>n.props.testID==='deck-result-r'),led=n.find(n=>n.type==='View'&&flat(n.props.style).borderRadius===4);const text=n.filter(n=>n.type==='Text'&&n.props.accessibilityLiveRegion==='polite').map(n=>r.text(n)).join('');labels.add(text);assert.equal(led.props.style.backgroundColor==='#00BC7D',status==='accepted','green is reserved for accepted');assert.equal(text.includes('history.'),false,'localized short outcome');assert.ok(key.props.accessibilityLabel.length>text.length,'long explanation stays accessible');
  }assert.equal(labels.size,10,'distinct outcomes retain distinct human-readable short labels');
 }
 if(c==='content'){
  const title='Long exact title '.repeat(50),path='long/worktree/'.repeat(20),agent={id:'a',title,provider:'codex',state:'done',summary:'Full original body',place:{repo:'Project',worktreeName:path}};
  const n=h.walk(h.render(h.load('src/ui/deck/deck-sheets.tsx').DeckContent,{agent,live:true,width:390,height:844}));const heading=n.find(n=>n.props.accessibilityRole==='header');assert.equal(heading.props.numberOfLines,2);assert.ok(heading.props.accessibilityLabel.includes(title));const body=n.find(n=>n.props.testID==='deck-content-body-scroll');assert.ok(flat(body.props.style).minHeight>=120,'body remains usable at large type');const root=n.find(n=>n.props.testID==='deck-content-layout');assert.equal(flat(root.props.style).flexShrink,0,'overflow grows the outer content instead of squashing body/navigation');
 }
 if(c==='content'){
  // Native47 RED: outer viewport559, root1224, navigation y1285 under footer726.
  // A finite parent height must not depend on the length of the original text.
  const api=h.load('src/ui/deck/deck-sheets.tsx'),agent={id:'a',title:'Exact title',provider:'codex',state:'done',summary:'Full original body\n'.repeat(200)};
  const render=viewportHeight=>h.walk(h.render(api.DeckContent,{agent,live:true,width:390,height:844,viewportHeight}));
  let n=render(547),root=n.find(n=>n.props.testID==='deck-content-layout');assert.equal(flat(root.props.style).height,547,'content receives a finite usable viewport, not unbounded flex in an outer ScrollView');
  n.find(n=>n.props.testID==='deck-content-body-scroll').props.onContentSizeChange(322,6000);
  n=render(547);assert.equal(flat(n.find(n=>n.props.testID==='deck-content-layout').props.style).height,547,'full original remains internally scrollable without growing its parent');assert.equal(h.text(n.find(n=>n.props.testID==='deck-content-full-body')),agent.summary);
  n.find(n=>n.props.testID==='deck-content-identity').props.onLayout({nativeEvent:{layout:{height:220}}});
  n=render(180);assert.equal(flat(n.find(n=>n.props.testID==='deck-content-layout').props.style).height,508,'short landscape viewport grows outer scroll to preserve identity, body minimum and navigation');
 }
 if(c==='history-strip')for(const count of [2,3,4]){
  const r=renderer(locale);r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;const receipts=Array.from({length:count},(_,i)=>({...receipt,id:'result-'+i,status:'unknown'}));const args={receipts,busy:false,titleFor:()=> 'Exact title',now:1000,onAcknowledge:async()=>false};let n=r.walk(r.render(r.load('src/ui/action-history.tsx').ActionHistory,args));const strip=n.find(n=>n.props.testID==='deck-result-strip');assert.equal(!!strip,count>=3,'three or more result keys use one horizontal strip');if(strip)assert.equal(strip.props.horizontal,true);assert.equal(n.filter(n=>n.props.testID?.startsWith('deck-result-result-')).length,count,'no result is dropped');n.find(n=>n.props.testID==='deck-result-result-0').props.onPress();n=r.walk(r.render(r.load('src/ui/action-history.tsx').ActionHistory,args));assert.ok(r.text(n).includes(receipt.paneKey),'original diagnostics still expand');
 }
 if(c==='language-keys')for(const [width,scale] of [[390,1],[390,1.1],[390,1.5],[821,1.5]]){
  const packs={subscribe(){},getSnapshot:()=>({packs:[],phase:'ready',locales:[],writable:true,busy:false})};const r=renderer(locale,width,844,scale,{'../../i18n/installed-packs':{languagePacks:packs},'./language-packs':{LanguagePacks:()=>null},'./reply-speech-settings':{ReplySpeechSettings:()=>null}});r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;const n=r.walk(r.render(r.load('src/ui/deck/customize.tsx').Customize,{}));
  const english=n.find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityLabel===r.t('set.english'));const label=r.walk(english).find(n=>n.type==='Text'&&r.text(n)==='English');assert.equal(label.props.numberOfLines,1,'English cannot split into Englis/h at native1.5');const style=english.props.style({pressed:false});assert.ok(flat(style).minWidth>=88*scale,'choice keys wrap as whole keys, rather than splitting their labels');if(scale===1.5&&width<700){assert.equal(flat(style).width,'48%','wrapped last language key must keep its row width instead of growing across the next LCD');assert.equal(flat(style).flexGrow,0,'wrapped choice cannot consume an unbounded flex share');}english.props.onPress();assert.equal(r.updates[0].language,'en','existing preference callback unchanged');
 }
 if(c==='language-packs'){
  let imports=0;const packs={subscribe(){},getSnapshot:()=>({packs:[],reviews:[],phase:'ready',locales:[],writable:true,busy:false})};const r=renderer(locale,390,844,1,{'../../i18n/installed-packs':{languagePacks:packs},'../../adapters/language-pack-files':{importLanguagePackFile:async()=>{imports++;return{status:'canceled'};},exportLanguagePackSource:async()=>({status:'unavailable'}),exportLanguagePackPrompt:async()=>({status:'unavailable'})}});r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;const api=r.load('src/ui/deck/language-packs.tsx');let n=r.walk(r.render(api.LanguagePacks,{}));assert.ok(n.some(n=>n.props.accessibilityRole==='header'&&r.text(n)===r.t('pack.count',{n:0})),'installed pack count is visible without expanding');const button=n.find(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===r.t('pack.import'));assert.ok(button,'full import label retained for accessibility');assert.ok(r.text(button).includes(r.t('pack.importShort')));assert.equal(r.text(button).includes(r.t('pack.import')),false,'long import wording is not printed on the key');button.props.onPress();assert.equal(imports,1,'existing import callback remains');
 }
 if(c==='fallback'){
  const api=h.load('src/ui/action-history.tsx'),args={receipts:[{...receipt,status:'unknown'}],busy:false,onAcknowledge:async()=>false};let n=h.walk(h.render(api.ActionHistory,args)),key=n.find(n=>n.props.testID==='deck-result-r');assert.equal(h.text(key).includes(receipt.paneKey),false,'opaque identity is not the visible fallback title');assert.ok(h.text(key).includes(h.t('history.previousTarget')));key.props.onPress();n=h.walk(h.render(api.ActionHistory,args));assert.ok(h.text(n).includes(receipt.paneKey),'exact pane remains in expanded diagnostics');
 }
 const source=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let attrs={},scrollAttrs={},contentAttrs={};
 const attributes=n=>Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(ast),a.initializer&&ts.isJsxExpression(a.initializer)?a.initializer.expression?.getText(ast):undefined]));
 function visit(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){if(n.tagName.getText(ast)==='DeckSheetFooter')attrs=attributes(n);if(n.tagName.getText(ast)==='DeckContent')contentAttrs=attributes(n);if(n.tagName.getText(ast)==='ScrollView'&&attributes(n).ref==='sheetScroll')scrollAttrs=attributes(n);}ts.forEachChild(n,visit);}visit(ast);
 const value=(code,env)=>{const module={exports:null};vm.runInNewContext(ts.transpileModule('module.exports=('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module,...env});return module.exports;};
 if(c==='content'){
  let viewport=0;assert.ok(scrollAttrs.onLayout,'actual outer scroll viewport must be measured');
  value(scrollAttrs.onLayout,{setSheetViewportHeight:v=>{viewport=typeof v==='function'?v(viewport):v;}})({nativeEvent:{layout:{height:559}}});
  assert.equal(value(contentAttrs.viewportHeight,{sheetViewportHeight:viewport}),547,'Home forwards measured viewport minus actual top4/bottom8 content padding');
 }
 if(c==='footer-space'){
  assert.ok(attrs.onLayout,'Home measures the actual physical footer');let footerHeight=0;value(attrs.onLayout,{setSheetFooterHeight:v=>{footerHeight=typeof v==='function'?v(footerHeight):v;}})({nativeEvent:{layout:{height:112}}});assert.equal(footerHeight,112);
  for(const sheet of ['status','content','list']){const style=value(scrollAttrs.contentContainerStyle,{D:{body:{}},physicalSheet:true,sheet,sheetFooterHeight:footerHeight});assert.ok(flat(style).paddingBottom>=112,'last scrolling controls can clear the entire fixed footer');}
  let measured=0;const onLayout=e=>measured=e.nativeEvent.layout.height;const n=h.walk(h.render(h.load('src/ui/deck/sheet-footer.tsx').DeckSheetFooter,{kind:'status',onSettings(){},onHistory(){},onContent(){},onClose(){},pttProps:{},onLayout}));const root=n.find(n=>n.type==='View'&&n.props.onLayout===onLayout);assert.ok(root,'functional layout measurement reaches the actual native footer');root.props.onLayout({nativeEvent:{layout:{height:112}}});assert.equal(measured,112);
 }
 if(c==='title'||c==='preserved'){
  let settings=false,sheet='status',calls=[],down=0,up=0;const env={sheet,settingsVisible:false,setSettingsVisible:v=>{settings=v;},setSheet:v=>{sheet=v;},sheetScroll:{current:{scrollTo:o=>calls.push(o.y)}},customizeY:{current:1000},voice:{available:true,snapshot:{phase:'idle'},pressIn:()=>down++,pressOut:()=>up++},screenReader:false,t:h.t};
  value(attrs.onSettings,env)();assert.equal(settings,true);assert.deepEqual(calls,[1000]);if(scrollAttrs.onScroll)value(scrollAttrs.onScroll,env)({nativeEvent:{contentOffset:{y:400}}});assert.equal(settings,true,'a clamped Fold scroll cannot undo Settings title chosen by the key');value(attrs.onHistory,env)();assert.equal(settings,false);value(attrs.onContent,env)();assert.equal(sheet,'content');value(attrs.onClose,env)();assert.equal(sheet,null);
  for(const [next,flag,wanted] of [['status',false,'status'],['status',true,'settings'],['list',false,'list'],['content',false,'content']])assert.equal(value(attrs.kind,{sheet:next,settingsVisible:flag}),wanted);
  const ptt=value(attrs.pttProps,env);const foot=h.walk(h.render(h.load('src/ui/deck/sheet-footer.tsx').DeckSheetFooter,{kind:'status',onSettings(){},onHistory(){},onContent(){},onClose(){},pttProps:ptt}));const trigger=foot.find(n=>n.props.testID==='deck-sheet-ptt');trigger.props.onPressIn();trigger.props.onPressOut();assert.deepEqual([down,up],[1,1]);assert.equal(ptt.disabled,false);value(attrs.pttProps,{...env,screenReader:true}).onPress();assert.deepEqual([down,up],[2,2]);if(scrollAttrs.scrollEnabled)assert.equal(value(scrollAttrs.scrollEnabled,{sheet:'content',frame:{height:844}}),true,'outer content can scroll when intrinsic minimum overflows');
 }
 if(c==='toggle'){
  const n=h.walk(h.render(h.load('src/ui/deck/sheet-controls.tsx').MetalToggle,{label:'Click',checked:true,onPress(){}}));const one=n.find(n=>n.type==='Text'&&h.text(n)==='1'),dot=n.find(n=>n.type==='View'&&flat(n.props.style).backgroundColor==='#00BC7D');assert.ok(flat(one.props.style).left<flat(dot.props.style).left,'on face reads 1 then dot');
 }
 if(c==='nav'&&locale==='en')assert.deepEqual([h.t('nav.previous'),h.t('nav.next')],['Previous','Next']);
 if(c==='preserved'){
  const api=h.load('src/ui/deck/DeckScreen.tsx'),n=h.walk(h.render(api.DeckScreen,{...props,voiceRecording:false}));assert.notEqual(flat(n.find(n=>n.props.testID==='deck-voice-microphone').props.style).borderColor,'#FF0C36','idle microphone is not recording red');
  const display=h.load('src/ui/deck/recording-display.tsx').RecordingDisplay;const heights=level=>h.walk(h.render(display,{label:'Recording',projectPath:'Path',text:'Exact body',phase:'recording',elapsedMs:7000,level,position:'2/3',counts:null,link:'LIVE',age:'2s',scale:1})).filter(n=>n.props.testID?.startsWith('deck-recording-tick-')).map(n=>flat(n.props.style).height);assert.ok(heights(.8).every((v,i)=>v>heights(.2)[i]),'real level changes waveform heights');
  const packs={subscribe(){},getSnapshot:()=>({packs:[],phase:'ready',locales:[],writable:true,busy:false})},r=renderer(locale,390,844,1,{'../../i18n/installed-packs':{languagePacks:packs},'./language-packs':{LanguagePacks:()=>null},'./reply-speech-settings':{ReplySpeechSettings:()=>null}});r.load('src/ui/deck/sheet-controls.tsx').SheetSkinContext.current=true;const nodes=r.walk(r.render(r.load('src/ui/deck/customize.tsx').Customize,{})),english=nodes.find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityLabel===r.t('set.english'));assert.ok(r.text(english).includes('EN')&&r.text(english).includes('English'));if(locale==='ko'){const korean=nodes.find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityLabel===r.t('set.korean'));assert.ok(r.text(korean).includes('한')&&r.text(korean).includes('한국어'));}
  const hist=h.load('src/ui/action-history.tsx'),closed=h.walk(h.render(hist.ActionHistory,{receipts:[{...receipt,status:'partial'}],titleFor:()=> 'Owned title',now:1000,busy:false,onAcknowledge:async()=>false}));assert.equal(h.text(closed.find(n=>n.props.testID==='deck-result-r')).includes(h.t('outcome.partial')),false,'EN also hides full explanation until expanded');
 }
 console.log('PASS: D30 review '+c+' '+locale);
}
