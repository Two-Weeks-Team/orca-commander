import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),{createTranslator}=require('../.test-build/src/i18n/messages.js'),{createConfirmationGesture}=require('../.test-build/src/core/confirmation-gesture.js');
const jsx=(type,props,key)=>({type,key,props:props??{}}),walk=n=>Array.isArray(n)?n.flatMap(walk):n?.props?typeof n.type==='function'?walk(n.type(n.props)):[n,...walk(n.props.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'||typeof n==='number'?String(n):n?.type==='Text'?text(n.props.children):'';
function load(file,deps){const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:require(id),Date,performance,setTimeout,clearTimeout});return module.exports;}
let checks=0;const same=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);};
for(const locale of ['ko','en']){
 let measuredHeaderWidth=0;
 const t=createTranslator(locale),react={useState:initial=>initial===0?[measuredHeaderWidth,value=>{measuredHeaderWidth=value;}]:[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useEffect(){}},native=Object.fromEntries(['Text','View','Pressable','Modal','ScrollView'].map(n=>[n,n]));native.StyleSheet={create:v=>v};native.AppState={currentState:'active'};
 const deps={react,'react-native':native,'react/jsx-runtime':{jsx,jsxs:jsx},'./deck-fonts':{DECK_NUMERAL_FONT:'BarlowCondensed-Bold'},'../i18n/provider':{useMessages:()=>({t,locale,presentationRevision:1})},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'../core/confirmation-gesture':{createConfirmationGesture}};
 const theme=load('../src/ui/theme.tsx',deps);deps['./theme']=theme;
 const {ConfirmPanel}=load('../src/ui/confirmation-panel.tsx',deps);deps['./confirmation-panel']={ConfirmPanel};
 const {PromptConfirmationDialog}=load('../src/ui/prompt-confirmation.tsx',deps);
 const {NativeConfirmationDialog}=load('../src/ui/native-confirmation.tsx',deps);
 const ticket=Object.freeze({id:'private-ticket-id',hostId:'private-host-id',worktreeId:'private-worktree-id',paneKey:'private-tab:private-leaf',handle:'private-handle',incarnationId:'private-incarnation',generation:7,hostVersion:'1.4.248',preparedAt:Date.now(),title:'Human tab title',text:'Full owned body\nSecond line 🐳\nLast line'});
 const target=Object.freeze({provider:'CODEX',project:'Human project',worktree:'Human workspace',host:'Human desktop'});
 let confirm=0,cancel=0,firstKey;
 const base={confirmation:ticket,target,origin:'voice',disabled:false,onConfirm:()=>confirm++,onCancel:()=>cancel++};
 const manual=PromptConfirmationDialog({...base,origin:'typed'}),manualInner=ConfirmPanel(manual.props),manualNodes=walk(manualInner.type(manualInner.props));
 same(manualNodes.some(n=>n.props.testID==='deck-confirm-countdown'||n.props.testID==='deck-confirm-time-meter'),false,'D29 approved manual review has no expiry number or bar');
 same(manualNodes.some(n=>n.type==='Text'&&text(n)===t('confirm.explanation')),true,'D29 approved destination recheck hint is visible');
 for(const processingLabel of [locale==='ko'?'대상을 다시 확인하고 있습니다.':'Checking the destination again.',locale==='ko'?'답이 반영됐는지 확인하고 있습니다.':'Checking whether the answer was applied.',locale==='ko'?'호스트 결과를 기다리고 있습니다. 같은 동작을 반복하지 마세요.':'Waiting for the host result. Do not repeat the action.']){
  const wrapper=PromptConfirmationDialog({...base,cancelDisabled:true,processingLabel}),inner=ConfirmPanel(wrapper.props),nodes=walk(inner.type(inner.props));
  same(nodes.some(n=>n.type==='Text'&&text(n)===processingLabel),true,'D29 R3 busy confirmation displays the actual processing stage');
 }
 const cases=[['speaking',{voiceStage:'speaking'}],['preparing',{voiceStage:'preparing'}],['listening',{voiceStage:'listening',listeningRemainingMs:2500}],['transcribing',{voiceStage:'transcribing'}],['unavailable',{voicePromptUnavailable:true}],['sent',{resultStatus:'accepted',resultLabel:'accepted',readReply:true}],['unknown',{resultStatus:'unknown',resultLabel:'not sent'}],['unknown',{resultStatus:'partial',resultLabel:'sent'}],['sending',{cancelDisabled:true}]];
 for(const [stage,patch] of cases){
  const wrapper=PromptConfirmationDialog({...base,...patch}),inner=ConfirmPanel(wrapper.props),tree=inner.type(inner.props),nodes=walk(tree);
  firstKey??=inner.key;same(inner.key,firstKey,'state transitions never remount/rearm the gesture');same(wrapper.props.preparedAt,ticket.preparedAt);
  same(tree.props.transparent,true);same(tree.props.presentationStyle,'overFullScreen');same(nodes.some(n=>n.props.testID===`deck-confirm-stage-${stage}`),true);
  if(stage!=='listening')same(nodes.some(n=>n.props.testID==='deck-confirm-countdown'),false,'only actual listening has a countdown');
  if(stage==='speaking'||stage==='listening'){
   const meter=nodes.find(n=>n.props.testID===(stage==='speaking'?'deck-confirm-reading-wave':stage==='listening'?'deck-confirm-listening-meter':'deck-confirm-time-meter'));
   same(walk(meter).filter(n=>Array.isArray(n.props.style)&&n.props.style.includes(theme.CS.segment)).length,30,'reading/listening retain the board’s 30 visible ticks');
   same(meter.props.style.aspectRatio,360/22,'bar aspect follows the board rather than fixed tiny waves');
  }
  if(stage==='unknown')same(nodes.some(n=>n.props.testID==='deck-confirm-unknown-icon'),true,'uncertain result has its own visible icon');
  const counter=nodes.find(n=>n.props.testID==='deck-confirm-countdown');
  if(counter){same(counter.props.style.fontSize,76,'actual listening keeps its approved large Barlow counter');same(counter.props.style.fontFamily,'BarlowCondensed-Bold');}

  const body=nodes.find(n=>n.props.testID==='deck-confirm-full-body');same(body.props.children,ticket.text,'complete original body survives every phase');
  const card=nodes.find(n=>n.props.testID==='deck-confirm-target-card'),labels=walk(card).filter(n=>n.type==='Text').map(text).join('|');
  for(const value of Object.values(target))same(labels.includes(value),true);
  same(walk(card).filter(n=>n.type==='Text').some(n=>n.props.selectable===true),false,'target labels do not take text-selection focus');
  for(const n of walk(card).filter(n=>n.props.style===theme.CS.metaLabel)){same(n.props.style.textDecorationLine,'none');same(n.props.style.fontWeight,'800');}
  same(nodes.some(n=>n.type==='Text'&&text(n)==='1/1'&&n.props.style===theme.CS.bodyPage),true,'the full continuous body is one document card');
  same(nodes.some(n=>n.type==='Text'&&text(n)===t(Array.from(ticket.text).length===1?'count.chars.one':'count.chars.other',{n:Array.from(ticket.text).length})&&n.props.style===theme.CS.bodyCount),true,'count formatting keeps the locale’s text around the numeric span');
  for(const raw of [ticket.id,ticket.hostId,ticket.worktreeId,ticket.paneKey,ticket.handle,ticket.incarnationId])same(labels.includes(raw),false,'raw target identity is not presented');
  const buttons=nodes.filter(n=>n.type==='Pressable'),hold=buttons.find(n=>n.props.testID==='deck-confirm-send'),close=buttons.find(n=>n.props.testID==='deck-confirm-cancel');same(!!close,true);
  if(patch.resultLabel!==undefined){same(buttons.length,1,'settled result has exactly one Close button');same(hold,undefined);same(text(close.props.children),t('common.close'));}
  else if(!patch.cancelDisabled)same(!!hold,true,'manual hold remains available alongside voice review');
  if(hold){same(walk(hold).some(n=>n.type==='Text'&&text(n)==='0.8s'&&n.props.style.fontFamily==='BarlowCondensed-Bold'),true,'hold duration has a separate bold numeric face');const styles=hold.props.style.flat(Infinity);same(styles.some(s=>s?.boxShadow?.some(shadow=>shadow.inset)),true,'metal button keeps the board’s inset lighting');}

  const notices=nodes.filter(n=>n.props.testID==='deck-confirm-playback-unavailable');same(notices.length,stage==='unavailable'?1:0);
  if(stage==='unavailable'){
   same(notices[0].props.children,t('voice.promptUnavailable'));
   const footer=nodes.find(n=>n.props.style===theme.CS.footer),actions=nodes.find(n=>n.props.style===theme.CS.actions),ordered=walk(footer);
   same(ordered.indexOf(notices[0])<ordered.indexOf(actions),true,'failure notice appears once immediately above the two-button row');
  }
  if(stage==='unknown'){
   const visible=nodes.filter(n=>n.type==='Text').map(text);same(visible.includes(t('confirmSheet.sent')),false);same(visible.filter(v=>v===t('confirmSheet.unknownHint')).length,1);
  }
  same(nodes.some(node=>{
   const style=Object.assign({},...[node.props.style].flat(Infinity).filter(v=>v&&typeof v==='object'));
   return !!node.props.testID&&(style.height===0||style.width===0||style.opacity===0||style.display==='none'||node.props.accessibilityElementsHidden===true||node.props.importantForAccessibility==='no-hide-descendants');
  }),false,'the product confirmation contains no invisible test-only node');
  const heading=nodes.find(n=>n.props.testID?.startsWith('deck-confirm-state-'));
  same(heading?.type,'Text');same(heading?.props.accessibilityRole,'header','gesture metadata belongs to the visible heading');same(heading?.props.accessibilityState.busy,!!patch.cancelDisabled);
  same(typeof heading?.props.accessibilityValue.text,'string');
  for(const node of nodes.filter(n=>n.type==='Text')){
   const style=Object.assign({},...[node.props.style].flat(Infinity).filter(v=>v&&typeof v==='object'));
   if(style.fontSize!==undefined)same(style.fontSize>0,true,'every native Text, including the visible state heading, needs a positive font size');
  }
  for(const node of nodes.filter(n=>n.type==='Text'))same(node.props.maxFontSizeMultiplier,1.5,'sheet text keeps the system scale with the approved ceiling');
 }
 // Even a locale/scope revision may not replace the native VC that owes onDismiss.
 let nativeOwnerRef;const originalUseRef=react.useRef;react.useRef=value=>nativeOwnerRef??(nativeOwnerRef={current:value});
 const ownerA=ConfirmPanel({preparedAt:ticket.preparedAt,scopeKey:'A',visible:true});
 const closingB=ConfirmPanel({preparedAt:ticket.preparedAt,scopeKey:'B',visible:false});same(closingB.key,ownerA.key);
 const closingC=ConfirmPanel({preparedAt:ticket.preparedAt,scopeKey:'C',visible:false});same(closingC.key,ownerA.key);
 const openedC=ConfirmPanel({preparedAt:ticket.preparedAt,scopeKey:'C',visible:true});same(openedC.key===ownerA.key,false,'only a visible new presentation receives a new native owner');react.useRef=originalUseRef;
 const silent=PromptConfirmationDialog({...base,resultStatus:'accepted',resultLabel:'accepted',readReply:false});
 same(walk(silent.props.header({phase:"consumed",cancellationReason:null,maxGapMs:0})).some(n=>text(n)===t('confirmSheet.replyHint')),false,'no reply-reading promise without an armed observer');
 const started=PromptConfirmationDialog({...base,voiceStage:'listening',listeningRemainingMs:3500});same(text(walk(started.props.header({phase:"idle",cancellationReason:null,maxGapMs:0})).find(n=>n.props.testID==='deck-confirm-countdown')),'3','3.5-second listening never displays a four-second countdown');
 for(const width of [375,599,600,668,375]){
  let dialog=PromptConfirmationDialog({...base,voiceStage:'listening'});
  let header=dialog.props.header({phase:'idle',cancellationReason:null,maxGapMs:0});
  same(typeof header.props.onLayout,'function','sheet measures its actual available header width');
  header.props.onLayout({nativeEvent:{layout:{width}}});
  dialog=PromptConfirmationDialog({...base,voiceStage:'listening'});header=dialog.props.header({phase:'idle',cancellationReason:null,maxGapMs:0});
  const row=walk(header).find(n=>Array.isArray(n.props.style)&&n.props.style.includes(theme.CS.meterRow));
  const style=Object.assign({},...row.props.style.filter(Boolean));
  same(style.flexDirection,width>=600?'row':'column','narrow phones stay vertical and only the wide sheet shares a row');
 }
 measuredHeaderWidth=0;
 const active=PromptConfirmationDialog(base);active.props.onConfirm();active.props.onCancel();same([confirm,cancel],[1,1],'original owner callbacks are preserved');
 same(PromptConfirmationDialog({...base,confirmation:undefined}),null);
 let dismissed=0;const hidden=PromptConfirmationDialog({...base,visible:false,onDismiss:()=>dismissed++}),hiddenInner=ConfirmPanel(hidden.props),hiddenTree=hiddenInner.type(hiddenInner.props);
 same(hiddenTree.props.visible,false,'the child remains mounted with native visibility false');hiddenTree.props.onDismiss();same(dismissed,1,'native dismiss propagates to the exact owner');
 const nativeDialog=NativeConfirmationDialog({confirmation:{...ticket,kind:'async_reply',entry:{hostId:'fixed',target:{title:'Reply'},questions:[]}},visible:false,onDismiss:()=>dismissed++,onConfirm(){},onCancel(){}}),nativeInner=ConfirmPanel(nativeDialog.props),nativeTree=nativeInner.type(nativeInner.props);same(nativeTree.props.visible,false);nativeTree.props.onDismiss();same(dismissed,2);

}
console.log(`PASS: ${checks} actual D19 confirmation phase/target/body/close/scale JSX assertions (no native rendering)`);
