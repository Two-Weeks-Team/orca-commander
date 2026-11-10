import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindKey,deriveDeckView,emptyDeckState,reconcileDeck,type DeckInventory} from '../src/core/deck-model';
import {buildProjects,deckDetour,focusMark,followDesktop,recentView,recencyOrder,returnToDesktop,type FocusState} from '../src/core/project-focus';
import type {AgentSnapshot} from '../src/core/types';

const now=100_000;
const row=(id:string,worktree:string,repo:string,title:string):AgentSnapshot=>({id,provider:'claude',title,summary:'',state:'working',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:'fixture-host',worktreeId:worktree,terminalId:`${id}:leaf`,connectionGeneration:1},place:{repoId:repo,repo,worktreeName:worktree,worktreeActive:false,worktreeRank:0,agentRank:0}});
const rows=[row('last','workspace-a','project-a','Last live task'),row('other','workspace-b','project-b','Other task')];
const present=new Set(rows.map(bindKey)),selected=bindKey(rows[0]),projects=buildProjects(rows,present);
const oldFocus={worktreeId:'workspace-a',tabId:'last:leaf'};
const followed:FocusState={mode:'follow',repoId:'project-a',mark:focusMark(oldFocus)};
const manual:FocusState={...followed,mode:'manual'};
const unknowns=[{worktreeId:'workspace-without-deck-rows',tabId:'absent:leaf'},{worktreeId:'workspace-b'},{worktreeId:'workspace-b',tabId:'missing:leaf'}];

for(const state of [followed,manual])for(const desktop of unknowns)test(`unresolved desktop focus preserves ${state.mode} project and applied activation: ${desktop.tabId??'unknown tab'}`,()=>{
 const result=followDesktop(state,projects,rows,present,desktop,selected);
 assert.deepEqual(result,{state,select:null},'an unresolved activation cannot change the existing view or invent a selection');
 assert.deepEqual(returnToDesktop(state,rows,present,desktop),{state:{...state,mode:'follow'},select:null},'idle return leaves project view without substituting a target or consuming the unresolved activation');
 assert.equal(deckDetour(state,rows,present,desktop,selected).desktop,null,'the UI can dim its following indicator without changing the LCD');
});

test('the fresh last live LCD survives an empty desktop worktree without choosing another row',()=>{
 const inventory:DeckInventory={live:true,complete:true,agents:rows,generation:1,scopeIdentity:'fixture-scope',confirmedAt:now,uncertaintyKnown:true,unresolvedPanes:new Set()};
 const initial=reconcileDeck(emptyDeckState(),inventory,now);
 const deck=reconcileDeck({...initial,selected},inventory,now+100);
 const result=followDesktop(followed,projects,rows,present,unknowns[0],deck.selected);
 const next=result.select===null?deck:{...deck,selected:result.select};
 const layout=recentView([],recencyOrder(rows,present));
 const view=deriveDeckView(next,{...inventory,confirmedAt:now,now:now+100,link:'LIVE',journalReady:true,busy:false,caps:{input:false,approve:false,speech:false},unresolvedCount:0},layout);
 assert.equal(next.selected,selected);
 assert.equal(view.display.name,'Last live task');
 assert.equal(view.display.state,'working');
 assert.deepEqual(view.display.position,{n:1,m:2});
 assert.deepEqual(result.state,followed,'the project label remains attached to the retained live selection');
});

test('a later exact desktop pane can still resume the existing follow policy',()=>{
 const result=followDesktop(manual,projects,rows,present,{worktreeId:'workspace-b',tabId:'other:leaf'},selected);
 assert.equal(result.select,bindKey(rows[1]));
 assert.equal(result.state.mode,'follow');
 assert.equal(result.state.repoId,'project-b');
});

test('a formerly missing desktop pane is applied when its exact live row arrives',()=>{
 const desktop={worktreeId:'workspace-new',tabId:'arrived:leaf'};
 const first=followDesktop(followed,projects,rows,present,desktop,selected);
 const arrived=row('arrived','workspace-new','project-new','Arrived task');
 const nextRows=[...rows,arrived],nextPresent=new Set(nextRows.map(bindKey));
 const second=followDesktop(first.state,buildProjects(nextRows,nextPresent),nextRows,nextPresent,desktop,selected);
 assert.equal(second.select,bindKey(arrived),'an unresolved activation must not be consumed before its exact pane is known');
});
