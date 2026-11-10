import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
const h=renderer(),api=h.load('src/ui/deck/deck-sheets.tsx');let picked=[];
const agent={id:'tab:leaf',title:'Very long title kept in accessibility',provider:'codex',state:'permission',stateSince:0,summary:'one\n\ntwo 🐳\nthree',place:{projectName:'Project',worktreeName:'Work'}};
const rows=[{key:'pane',agent,slot:3}];
if(!process.argv[2]||process.argv[2]==='list'){
 const nodes=h.walk(h.render(api.AgentKeyList,{rows,selectedKey:'pane',now:5000,onSelect:k=>{picked.push(k);return false;},onOpen:()=>picked.push('content'),width:411}));
 assert.equal(nodes.some(n=>n.props.testID==='deck-sheet-agent-grid'),true,'list uses agent keycap grid');
 const key=nodes.find(n=>n.props.testID==='deck-item-pane');assert.equal(key.props.accessibilityLabel.includes(agent.title),true);key.props.onPress();assert.deepEqual(picked,['pane'],'blocked selection must not open content');
 assert.equal(nodes.some(n=>n.type==='Image'&&String(n.props.source).includes('agent_amber_selected')),true,'same permission tone and selected sprite as deck');
}
if(process.argv[2]==='content'){
 const nodes=h.walk(h.render(api.DeckContent,{agent,live:true,host:'Host',version:'1.4.252',width:390,height:844}));
 assert.equal(nodes.some(n=>n.props.testID==='deck-content-full-body'&&n.props.children===agent.summary),true,'full original body, not per-page sliced strings');
 assert.equal(nodes.some(n=>n.props.accessibilityRole==='adjustable'),true,'content dial is accessible and changes scroll only');
 assert.equal(nodes.filter(n=>n.type==='Pressable').length,3,'previous, next, dial only; no new write actions');
}
if(process.argv[2]==='status'){
 const nodes=h.walk(h.render(api.StatusDisplay,{link:'LIVE',host:'Host',version:'1.4.252',generation:4,unresolved:2,now:1000}));
 assert.equal(nodes.some(n=>n.props.testID==='deck-status-lcd'),true,'LIVE identity and unresolved values are inside LCD');
 assert.equal(h.text(nodes).includes('!2'),true);assert.equal(h.text(nodes).includes('#4'),true);
}
console.log('PASS: D30 '+(process.argv[2]??'list')+' actual rendering/safety contract');
if(!process.argv[2]||process.argv[2]==='list'){
 for(const [state,tone] of [['permission','amber'],['question','amber'],['review','violet'],['working','blue'],['done','off'],['failed','red'],['unknown','gray']]){
  const r=renderer('en',821,1088,1.5),{AgentKeyList}=r.load('src/ui/deck/deck-sheets.tsx');let opened=0,selected=0;
  const a={...agent,state,stateSince:undefined,updatedAt:new Date(1000).toISOString()};
  const nodes=r.walk(r.render(AgentKeyList,{rows:[{key:'p',agent:a,slot:null}],selectedKey:null,width:821,now:2000,onSelect:()=>{selected++;return true;},onOpen:()=>opened++}));
  assert.equal(nodes.some(n=>n.type==='Image'&&String(n.props.source).includes('agent_'+tone+'_up.png')),true,'actual deck palette '+state);
  const led={permission:'#FF8A3D',question:'#FF8A3D',review:'#D3C3FF',working:'#F0B100',done:'#00BC7D',failed:'#FF6B6B',unknown:'#F5B451'}[state];assert.equal(nodes.some(n=>n.type==='View'&&n.props.style?.backgroundColor===led),true,'semantic LED remains deck state color '+state);
  nodes.find(n=>n.props.testID==='deck-item-p').props.onPress();assert.equal(selected,1);assert.equal(opened,1);
  for(const n of nodes.filter(n=>n.type==='Text'))assert.equal(n.props.maxFontSizeMultiplier,1.5);
 }
}
if(process.argv[2]==='content'){
 const r=renderer('en'),{DeckContent}=r.load('src/ui/deck/deck-sheets.tsx');
 let nodes=r.walk(r.render(DeckContent,{agent,live:true,width:390,height:844}));
 let sc=nodes.find(n=>n.type==='ScrollView');sc.props.onLayout({nativeEvent:{layout:{height:100}}});sc.props.onContentSizeChange(100,300);sc.props.onScroll({nativeEvent:{contentOffset:{y:200}}});
 nodes=r.walk(r.render(DeckContent,{agent,live:true,width:390,height:844}));
 assert.equal(nodes.find(n=>n.props.accessibilityRole==='adjustable').props.accessibilityValue.text,'3/3');
 assert.equal(nodes.find(n=>n.props.testID==='deck-content-full-body').props.children,agent.summary);
}
