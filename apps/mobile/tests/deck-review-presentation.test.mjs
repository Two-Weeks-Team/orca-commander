import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
const scenario=process.argv[2]??'marks',now=4_000_000;
if(scenario==='marks'||scenario==='labels')for(const locale of ['ko','en'])for(const [kind,state,extra,mark] of [
 ['done','done',{},'#00BC7D'],['monitoring','working',{monitoring:true},'#F0B100'],['stale','working',{livePty:true,updatedAt:new Date(0).toISOString()},'#F5B451'],['unconfirmed','unknown',{unconfirmed:true},'#F5B451'],['stopping','working',{stopping:true},'#08224D']]){
 const r=renderer(locale),{AgentKeyList}=r.load('src/ui/deck/deck-sheets.tsx');
 const agent={id:'A',state,provider:'claude',title:'Owned title',summary:'Body',updatedAt:new Date(now-1000).toISOString(),...extra};
 const nodes=r.walk(r.render(AgentKeyList,{rows:[{key:'A',agent,slot:1}],live:true,width:411,now,selectedKey:'A',onSelect:()=>true,onOpen(){}}));
 if(scenario==='marks'){
  const glyph=nodes.find(n=>n.type==='Image'&&(/circle-check|activity|circle-dashed/.test(n.props.source)));
  if(glyph)assert.equal(glyph.props.tintColor,mark,'same deck mark color for '+kind);
  const logo=nodes.find(n=>n.type==='Image'&&String(n.props.source).endsWith('/claude.png'));assert.equal(logo.props.tintColor,undefined,'active Claude logo retains original color');
 }else{
  const label=kind==='stale'?r.t('state.stale',{time:'1h'}):r.t('state.'+kind);
  assert.equal(nodes.find(n=>n.props.testID==='deck-item-A').props.accessibilityLabel.includes(label),true,'announces rendered '+kind+' rather than raw '+state);
 }
}
if(scenario==='status')for(const link of ['LIVE','OFFLINE','UNPAIRED','STALE']){
 const r=renderer('en',390,844,1.5),{StatusDisplay}=r.load('src/ui/deck/deck-sheets.tsx');
 const nodes=r.walk(r.render(StatusDisplay,{link,generation:123456789,unresolved:0,now})),flat=r.native.StyleSheet.flatten;
 const linkNode=nodes.find(n=>n.type==='Text'&&r.text(n).includes(link));assert.equal(flat(linkNode.props.style).color,link==='LIVE'?'#8BE8AE':'#FF7A8A','lost link is not green');
 const count=nodes.find(n=>n.type==='Text'&&r.text(n)==='!0');assert.equal(flat(count.props.style).color,'#5F7A70','zero unresolved is muted');
 const row=nodes.find(n=>n.type==='View'&&n.props.style?.flexWrap==='wrap');assert.ok(row,'header values can wrap at 390pt and 1.5');
}
if(scenario==='dial'){
 const r=renderer('en',390,844,1.5),{DeckContent}=r.load('src/ui/deck/deck-sheets.tsx'),agent={id:'A',state:'done',provider:'codex',title:'T',summary:'Uncut body'};
 let nodes=r.walk(r.render(DeckContent,{agent,live:true,width:390,height:844})),sc=nodes.find(n=>n.type==='ScrollView');sc.props.onLayout({nativeEvent:{layout:{height:100}}});sc.props.onContentSizeChange(300,1200);sc.props.onScroll({nativeEvent:{contentOffset:{y:900}}});
 nodes=r.walk(r.render(DeckContent,{agent,live:true,width:390,height:844}));const label=nodes.find(n=>n.type==='Text'&&r.text(n)==='10/12');assert.ok(label);assert.equal(label.props.adjustsFontSizeToFit,true,'multi-digit counter fits inside 66pt knob at system scale1.5');
}
if(scenario==='backdrop'){
 const r=renderer(),{DeckSheetFrame}=r.load('src/ui/deck/sheet-frame.tsx'),nodes=r.walk(r.render(DeckSheetFrame,{physical:true,title:'List',onClose(){},keyboardVisible:false,children:'Body'}));
 const surface=nodes.find(n=>n.props.testID==='deck-sheet-backdrop');assert.ok(surface,'opaque modal transitions need an opaque deck backdrop');assert.equal(surface.props.style.backgroundColor,'#0A0D12');
}
if(scenario==='recording'){
 const r=renderer(),{RecordingDisplay}=r.load('src/ui/deck/recording-display.tsx'),nodes=r.walk(r.render(RecordingDisplay,{label:'Recording',text:'long transcript ending with latest words',phase:'recording',elapsedMs:7000,level:.5,position:'2/3',counts:null,link:'LIVE',age:'2s',scale:1}));
 const transcript=nodes.find(n=>n.type==='Text'&&r.text(n).includes('latest words'));assert.equal(transcript.props.ellipsizeMode,'head','latest dictated words remain visible');
}
console.log('PASS: D30 review '+scenario+' rendering contract');
