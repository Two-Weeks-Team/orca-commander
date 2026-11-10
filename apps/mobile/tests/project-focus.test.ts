import assert from 'node:assert/strict';
import type {AgentSnapshot} from '../src/core/types';
import {bindKey} from '../src/core/deck-model';
import {activePaneKey} from '../src/adapters/orca-read-model';
import {buildProjects,currentProject,deckDetour,desktopSelection,emptyFocus,focusForChoice,followDesktop,projectKeys,recencyOrder,recentView,resumeFollow,returnToDesktop,stableSlots,stepProject,stepWithinProject} from '../src/core/project-focus';
let count=0;const same=(a:unknown,b:unknown,label='project focus')=>{count++;assert.deepEqual(a,b,label);};
const row=(repo:string,worktree:string,tab:string,worktreeRank:number,agentRank:number,active=false):AgentSnapshot=>({id:tab,provider:'codex',title:tab,summary:'',state:'working',eventType:'informational',updatedAt:new Date(0).toISOString(),
 target:{hostId:'h',worktreeId:worktree,terminalId:`${tab}:leaf`,connectionGeneration:1},
 place:{repoId:repo,repo:repo.toUpperCase(),worktreeName:worktree,worktreeActive:active,worktreeRank,agentRank}});
// Host order: deck repo (two worktrees) then museion; musely has no agent rows.
const agents=[row('deck','wt-a','t1',0,0),row('deck','wt-a','t2',0,1),row('museion','wt-m','m1',1,0),row('deck','wt-b','t3',2,0,true),
 ...Array.from({length:6},(_,i)=>row('museion','wt-m','m'+(i+2),1,i+1))];
const present=new Set(agents.map(bindKey));const key=(tab:string)=>bindKey(agents.find(a=>a.id===tab)!);
const projects=buildProjects(agents,present);
same(projects.map(p=>p.repoId),['deck','museion'],'projects in host order');
same(projects[0].items,[key('t1'),key('t2'),key('t3')],'worktree rank, then row rank');
same(projects[0].worktreeIds,['wt-a','wt-b']);
same(projects[0].name,'DECK');
// Absent rows never take a key.
same(buildProjects(agents,new Set([key('t2')]))[0].items,[key('t2')]);
// Only the exact active pane, or an unambiguous parent tab, can identify desktop focus.
same(desktopSelection(agents,present,{worktreeId:'wt-a',tabId:'t2'}),key('t2'));
same(desktopSelection(agents,present,{worktreeId:'wt-a'}),null,'a worktree alone never identifies its first pane');
same(desktopSelection(agents,present,{worktreeId:'wt-a',tabId:'gone'}),null,'a missing desktop tab never falls back to the first row');
same(desktopSelection(agents,present,{worktreeId:'none'}),null);
const split=[agents[0],{...agents[0],id:'second',target:{...agents[0].target,terminalId:'t1:other'}}];
same(desktopSelection(split,new Set(split.map(bindKey)),{worktreeId:'wt-a',tabId:'t1'}),null,'a split tab without a focused leaf is ambiguous');
same(desktopSelection(split,new Set(split.map(bindKey)),{worktreeId:'wt-a',tabId:'t1:other'}),bindKey(split[1]),'the exact focused leaf identifies its pane');
same(desktopSelection(agents,present,{worktreeId:'wt-a',tabId:'t1:gone'}),null,'a missing focused leaf cannot choose a sibling');
// Follow: first desktop focus selects the project and its active tab.
let r=followDesktop(emptyFocus(),projects,agents,present,{worktreeId:'wt-b',tabId:'t3'});
same(r.state,{mode:'follow',repoId:'deck',mark:JSON.stringify(['wt-b','t3'])});same(r.select,key('t3'));
same(projectKeys(currentProject(r.state,projects)),[key('t1'),key('t2'),key('t3'),null,null,null]);
// Same desktop focus again with the selection still in the project: nothing new to select.
const followed=r.state;r=followDesktop(followed,projects,agents,present,{worktreeId:'wt-b',tabId:'t3'},key('t1'));same(r.select,null);same(r.state.mode,'follow');
// Same focus but no selection yet (rows arrived after the activation): the desktop's tab is applied.
same(followDesktop(followed,projects,agents,present,{worktreeId:'wt-b',tabId:'t3'},null).select,key('t3'));
// Same focus, selection in another project: following shows every project's recent tabs, so the owner's choice stays.
same(followDesktop(followed,projects,agents,present,{worktreeId:'wt-b',tabId:'t3'},key('m1')).select,null);
// A selection that vanished is replaced by the desktop's tab.
same(followDesktop(followed,projects,agents,present,{worktreeId:'wt-b',tabId:'t3'},'gone').select,key('t3'));
same(followDesktop(followed,projects,agents,present,{worktreeId:'wt-empty'},null).select,null,'an unknown desktop pane cannot fill an empty selection from the project');
// Owner moves to another project: manual, first row selected, keys show that project (6 of 7).
// From the recent view the first push moves directly to the next/previous project.
r=stepProject(followed,projects,'down',key('t3'));same(r.state.mode,'manual');same(r.state.repoId,'museion');same(r.select,key('m1'));
same(stepProject(followed,projects,'up',key('m2')).state.repoId,'deck','first upward push moves to the previous project');
same(stepProject(followed,projects,'down',key('m2')).state.repoId,'museion','opens the project of the selected row');
r=stepProject(r.state,projects,'down');same(r.state.mode,'manual');same(r.state.repoId,'museion');same(r.select,key('m1'));
const manual=r.state;
same(projectKeys(currentProject(manual,projects)),['m1','m2','m3','m4','m5','m6'].map(key),'seventh row is keyless');
// An unchanged desktop keeps the manual project.
r=followDesktop(manual,projects,agents,present,{worktreeId:'wt-b',tabId:'t3'});same(r.state,manual);same(r.select,null);
// A new desktop activation is the newest state: follow again.
r=followDesktop(manual,projects,agents,present,{worktreeId:'wt-a',tabId:'t2'});same(r.state.mode,'follow');same(r.state.repoId,'deck');same(r.select,key('t2'));
// Resume follow re-applies the current desktop focus even if unchanged.
r=followDesktop(resumeFollow(manual),projects,agents,present,{worktreeId:'wt-b',tabId:'t3'});same(r.state.repoId,'deck');same(r.select,key('t3'));
// Idle always leaves project view, while an unknown desktop cannot replace the selected row.
same(returnToDesktop(manual,agents,present,undefined),{state:{...manual,mode:'follow'},select:null});
same(returnToDesktop(manual,agents,present,{worktreeId:'wt-a',tabId:'gone'}),{state:{...manual,mode:'follow'},select:null});
same(returnToDesktop(manual,agents,present,{worktreeId:'wt-a',tabId:'t2'}),{state:{...manual,mode:'follow',mark:JSON.stringify(['wt-a','t2'])},select:key('t2')});
const activation={worktreeId:'wt-a',tabId:'t2',activationSequence:1,source:{clientId:'desktop',windowId:'window'}};
const samePane=followDesktop(manual,projects,agents,present,activation);
same(followDesktop({...samePane.state,mode:'manual'},projects,agents,present,{...activation,activationSequence:2},key('m1')).select,key('t2'),'a new user activation of the same pane is new focus; heartbeat is not');
// Project stepping clamps at both ends.
same(stepProject(followed,projects,'up').state.repoId,'deck');same(stepProject(manual,projects,'down').state.repoId,'museion');
// Left/right within the project clamps and recovers a missing selection.
const deckProject=currentProject(followed,projects);
same(stepWithinProject(deckProject,key('t1'),'right'),key('t2'));same(stepWithinProject(deckProject,key('t3'),'right'),key('t3'));
same(stepWithinProject(deckProject,key('t1'),'left'),key('t1'));same(stepWithinProject(deckProject,null,'left'),key('t1'));
same(stepWithinProject(null,key('t1'),'right'),key('t1'));
// Desktop focus without an exact live pane leaves the applied focus and selection unchanged.
r=followDesktop(followed,projects,agents,present,{worktreeId:'wt-empty'},key('t1'));same(r.state.repoId,'deck');same(r.select,null);
// Unknown desktop focus never substitutes another project's header.
same(followDesktop({mode:'manual',repoId:'gone',mark:null},projects,agents,present,undefined).state.repoId,'gone');
// A momentarily empty read (reconnecting) keeps the open project; a lost project recovers once rows return.
same(followDesktop(manual,[],agents,present,{worktreeId:'wt-b',tabId:'t3'}).state,manual,'empty projects keep the open project');
same(followDesktop({...manual,repoId:null},projects,agents,present,{worktreeId:'wt-b',tabId:'t3'}).state.repoId,'deck','a lost project recovers');
// Native request items follow their worktree's pane rows and inherit its place.
const native={...row('deck','wt-a','n1',0,0),place:undefined,target:{hostId:'h',worktreeId:'wt-a',connectionGeneration:1},nativeRequest:{tabId:'nt',sessionId:'ns',itemId:'ni'}} as AgentSnapshot&{nativeRequest:{tabId:string;sessionId:string;itemId:string}};
const withNative=[...agents,native];
same(buildProjects(withNative,new Set(withNative.map(bindKey)))[0].items,[key('t1'),key('t2'),bindKey(native),key('t3')]);
// A supplied project order is honoured (e.g. the desktop sidebar's manual order).
same(buildProjects(agents,present,{sortBy:'recent',projectOrderBy:'manual',repoOrder:new Map([['museion',0],['deck',1]])},0).map(p=>p.repoId),['museion','deck']);
// Desktop settings: recent worktrees first, main worktree first inside its project, recent project order by activity.
const timed=(a:AgentSnapshot,at:number,main=false)=>({...a,place:{...a.place!,sort:{lastActivityAt:at,isMainWorktree:main}}});
const recentRows=[timed(agents[0],100),timed(agents[1],100),timed(agents[2],50),timed(agents[3],300)];
const recentProjects=buildProjects(recentRows,new Set(recentRows.map(bindKey)),{sortBy:'recent',projectOrderBy:'recent'},10_000_000);
same(recentProjects.map(p=>p.repoId),['deck','museion'],'deck holds the newest activity');
same(recentProjects[0].worktreeIds,['wt-b','wt-a'],'newest worktree first');
const mainRows=[timed(agents[0],100,true),timed(agents[1],100,true),timed(agents[3],300)];
same(buildProjects(mainRows,new Set(mainRows.map(bindKey)),{sortBy:'recent',projectOrderBy:'manual'},10_000_000)[0].worktreeIds,['wt-a','wt-b'],'main worktree first');
// Child agents follow their parent.
const parent={...row('deck','wt-a','p',0,0)},child={...row('deck','wt-a','c',0,2),place:{...row('deck','wt-a','c',0,2).place!,parentPaneKey:'p:leaf'}},other=row('deck','wt-a','o',0,1);
const lineage=[parent,other,child];
same(buildProjects(lineage,new Set(lineage.map(bindKey)))[0].items,[parent,child,other].map(bindKey));
// The host's activeTabId names the mobile tab; the pane key comes from its parentTabId:leafId.
const tabs=(active:string|undefined)=>({worktree:'wt-a',publication:{epoch:'e',version:1},published:true,complete:true,activeTabId:active,tabs:[{id:'mobile-1',type:'terminal',parentTabId:'t1',leafId:'leaf'},{id:'mobile-2',type:'terminal',parentTabId:'t2',leafId:'leaf'},{id:'md',type:'markdown'}]});
same(activePaneKey(tabs('mobile-2')),'t2:leaf');same(activePaneKey(tabs('md')),undefined,'non-terminal active tab has no pane');same(activePaneKey(tabs(undefined)),undefined);same(activePaneKey(tabs('gone')),undefined);
same(desktopSelection(agents,present,{worktreeId:'wt-a',tabId:'t2:leaf'}),key('t2'),'exact pane key');
// A row chosen elsewhere while a project is open moves the open project; following is untouched.
same(focusForChoice(manual,projects,key('t2')).repoId,'deck');same(focusForChoice(manual,projects,key('m3')),manual);same(focusForChoice(followed,projects,key('m3')),followed);
// Recency: the newer of the row's update and its last activation; ties by key.
const at=(a:AgentSnapshot,ms:number)=>({...a,updatedAt:new Date(ms).toISOString()});
const timedRows=[at(agents[0],1000),at(agents[1],3000),at(agents[2],2000),at(agents[3],500)];
const timedPresent=new Set(timedRows.map(bindKey));
same(recencyOrder(timedRows,timedPresent),[key('t2'),key('m1'),key('t1'),key('t3')]);
same(recencyOrder(timedRows,timedPresent,new Map([[key('t3'),9000]])),[key('t2'),key('m1'),key('t1'),key('t3')],'device activation cannot reorder the canonical host dashboard');
same(recencyOrder(timedRows,timedPresent,new Map(),new Set([key('t1'),key('t3')])),[key('t1'),key('t3')],'within one project');
// Stable keys: newest six, but a row already on a key keeps it.
const ranked=['a','b','c','d','e','f','g'];
same(stableSlots([],ranked),['a','b','c','d','e','f'],'first fill is newest first');
same(stableSlots(['a','b','c','d','e','f'],['f','a','b','c','d','e','g']),['a','b','c','d','e','f'],'f updating does not move any key');
same(stableSlots(['a','b','c','d','e','f'],['g','a','b','c','d','e','f']),['a','b','c','d','e','g'],'g replaces the row that dropped out, in its key');
same(stableSlots(['a','a',null,'x'],['a','b','c']),['a','b','c',null,null,null],'duplicates and departed rows free their keys');
same(recentView(['b',null],['a','b','c','d','e','f','g','h']),{keys:['b','a','c','d','e','f'],items:['a','b','c','d','e','f','g','h']});
// A deck on another tab or in a project view is away from the desktop until its idle return; on the desktop's tab it is not.
const follow={mode:'follow' as const,repoId:null,mark:null};
same(deckDetour(follow,agents,present,{worktreeId:'wt-a',tabId:'t2'},key('t2')),{away:false,desktop:key('t2')});
same(deckDetour(follow,agents,present,{worktreeId:'wt-a',tabId:'t2'},key('t1')),{away:true,desktop:key('t2')});
same(deckDetour({...follow,mode:'manual'},agents,present,{worktreeId:'wt-a',tabId:'t2'},key('t2')),{away:true,desktop:key('t2')});
same(deckDetour(follow,agents,present,undefined,key('t1')),{away:false,desktop:null},'no desktop focus: nothing to return to');


// A wide face has nine recent keys; shrinking does not retarget the selected item.
const rankedWide=Array.from({length:15},(_,i)=>`wide-${i}`);
const wideView=recentView([],rankedWide,9);
assert.equal(wideView.keys.length,9);
assert.deepEqual(wideView.keys,rankedWide.slice(0,9));
const updatedWide=recentView(wideView.keys,[rankedWide[14],...rankedWide],9);
assert.equal(updatedWide.keys[0],rankedWide[0]);
assert.equal(updatedWide.keys[8],rankedWide[14]);
assert.equal(recentView(updatedWide.keys,rankedWide,6).keys.length,6);


// Desktop activity thread recency uses the state event time, not a hook heartbeat.
const heartbeatOld={...agents[0],stateSince:new Date(1000).toISOString(),updatedAt:new Date(9000).toISOString()};
const eventRecent={...agents[1],stateSince:new Date(5000).toISOString(),updatedAt:new Date(6000).toISOString()};
assert.deepEqual(recencyOrder([heartbeatOld,eventRecent],new Set([bindKey(heartbeatOld),bindKey(eventRecent)])),[bindKey(eventRecent),bindKey(heartbeatOld)]);

console.log(`PASS: ${count+6} project focus assertions (six/nine keys; event recency; pure)`);
