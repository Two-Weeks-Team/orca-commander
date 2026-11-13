import React from 'react';
import {createRoot} from 'react-dom/client';
import {View,ScrollView} from 'react-native-web';
import {PreviewMessages} from './messages.jsx';
import {DeckScreen} from '../../apps/mobile/src/ui/deck/DeckScreen';
import {DeckSheetFrame} from '../../apps/mobile/src/ui/deck/sheet-frame';
import {DeckSheetFooter} from '../../apps/mobile/src/ui/deck/sheet-footer';
import {AgentKeyList,DeckContent,StatusDisplay} from '../../apps/mobile/src/ui/deck/deck-sheets';
import {bindKey,emptyDeckState,reconcileDeck,deriveDeckView} from '../../apps/mobile/src/core/deck-model';
import {createTranslator} from '../../apps/mobile/src/i18n/messages';
import numeralFont from '../../apps/mobile/assets/fonts/BarlowCondensed-Bold.ttf';
const config=JSON.parse(document.getElementById('preview-config').textContent);
window.__PREVIEW_FRAME__=config.viewport;
const NOW=Date.parse('2026-11-11T09:00:00.000Z'),NativeDate=Date;
window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}};
const style=document.createElement('style');style.textContent='@font-face{font-family:BarlowCondensed-Bold;src:url("'+numeralFont+'")}';document.head.append(style);
const noop=()=>{},locale=config.locale,{width,height}=config.viewport,t=createTranslator(locale);
const english=['Settings UI','Payment API','Login review','Add tests','Update docs','Build checked','Accessibility','Query cache','Release notes'];
const korean=['설정 화면 정리','결제 API 확인','로그인 검토','테스트 추가','문서 업데이트','빌드 확인','접근성 점검','캐시 정리','릴리스 메모'];
const names=(locale==='ko'?korean:english).slice(0,width>=700?9:6);
const agents=names.map((title,i)=>({
 id:'sample-agent-'+i,title,provider:i%2?'claude':'codex',state:['working','question','review','working','failed','done','review','working','idle'][i],
 stateSince:NOW-(i+1)*18000,updatedAt:new Date(NOW-2000).toISOString(),eventType:i===1?'user_question':i===2?'review_required':i===4?'task_failure':'informational',
 target:{hostId:'sample-host',worktreeId:'sample-worktree-'+i,terminalId:'sample-pane-'+i},
 place:{repo:'sample-app',worktreeName:['settings-ui','payment-api','login-flow','tests','docs','build','accessibility','cache','release'][i]},
 summary:locale==='ko'?'로그인 흐름과 접근성 레이블을 검토했습니다.\n\n변경 사항\n• 영어·한국어 문자열 정리\n• 선택한 항목의 상태 표시\n• 본문 스크롤과 탐색 동작 유지\n\n검토 후 다음 작업을 알려주세요.':'Reviewed the login flow and accessibility labels.\n\nChanges\n• Clear English and Korean strings\n• Visible selection and connection state\n• Full content remains scrollable\n\nPlease review before the next task.'
}));
const inventory={live:true,complete:true,agents,generation:1,unresolvedPanes:new Set(),uncertaintyKnown:true,confirmedAt:NOW};
const state=reconcileDeck(emptyDeckState(),inventory,NOW-1000);state.selected=bindKey(agents[0]);
const context={...inventory,now:NOW,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:false,speech:true},unresolvedCount:0};
const view=deriveDeckView(state,context,width>=700?{keys:agents.map(bindKey),items:agents.map(bindKey)}:undefined);
const usage={observedAt:NOW,claude:{status:'ok',session:{usedPercent:46},weekly:{usedPercent:61},fableWeekly:{usedPercent:0}},codex:{status:'ok',session:{usedPercent:18},weekly:{usedPercent:32}}};
const props={frame:{width,height},view,focusInfo:{project:'sample-app',worktree:'settings-ui',following:true,synced:true},usage,readAgeSeconds:2,voiceAvailable:true,onVoicePressIn:noop,onVoicePressOut:noop,onPressKey:noop,onStep:noop,onAttention:noop,onContent:noop,onInput:noop,onList:noop,onStatus:noop,onExplainKey:noop,onReconnect:noop,onScan:noop,onPhraseConfirm:noop,phrase:{name:locale==='ko'?'계속':'Continue',text:'Continue after review.'}};
function Preview(){
 if(config.kind==='controller'||config.kind==='recording'){
  const voice=config.kind==='recording'?{voiceRecording:true,voiceDisplay:{phase:'recording',elapsedMs:7000,text:locale==='ko'?'검토 후 다음 작업을 정리해 주세요.':'Summarize the next task after review.',level:.55}}:{};
  return <DeckScreen {...props} {...voice}/>;
 }
 const kind=config.kind;
 const body=kind==='list'?<AgentKeyList rows={agents.map((agent,i)=>({key:'sample-'+i,agent,slot:i+1}))} selectedKey="sample-0" now={NOW} onSelect={()=>false} onOpen={noop} width={width} live/>:kind==='content'?<DeckContent agent={agents[2]} live host="sample-desktop" version="1.4.245" width={width} height={height} position={3} viewportHeight={height*.9-190}/>:<StatusDisplay link="LIVE" host="sample-desktop" version="1.4.245" generation={1} unresolved={0} now={NOW} readAgeSeconds={2} usage={usage}/>;
 return <DeckSheetFrame physical title={t(kind==='list'?'cmd.list':kind==='content'?'cmd.content':'status.history')} count={kind==='list'?agents.length:undefined} onClose={noop} keyboardVisible={false}>
  <View style={{flex:1,minHeight:0}}><ScrollView style={{flex:1}} contentContainerStyle={{gap:12,padding:2}}>{body}</ScrollView><DeckSheetFooter kind={kind} onSettings={noop} onHistory={noop} onContent={noop} onClose={noop} pttProps={{disabled:true}}/></View>
 </DeckSheetFrame>;
}
createRoot(document.getElementById('preview-root')).render(<PreviewMessages locale={locale}><Preview/></PreviewMessages>);
// Capture tools wait for real layout/image/font completion, then this marker.
window.__PREVIEW_KIND__='source-components-on-react-native-web';
