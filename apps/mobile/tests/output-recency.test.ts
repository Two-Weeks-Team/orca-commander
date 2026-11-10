import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeWorktreePs} from '../src/adapters/orca-read-model';
import {bindKey} from '../src/core/deck-model';
import {dashboardPresent,recencyOrder,recentView} from '../src/core/project-focus';
import {captureDisplayCache,encodeDisplayCache,decodeDisplayCache,pendingSelectionDisplay} from '../src/core/deck-display-cache';

const now=1_800_000_000_000;
const hook=(id:string,state='done',started=now-1000)=>({paneKey:`${id}:leaf`,agentType:'codex',state,updatedAt:now-1000,stateStartedAt:started,conversationName:id});
const terminal=(id:string,output:number|null)=>({handle:`handle-${id}`,worktreeId:'workspace',tabId:id,leafId:'leaf',agentIdentity:'codex',connected:true,orphaned:false,lastOutputAt:output});
const normalize=(hooks:unknown[],terminals:unknown[],ui:unknown={},observedAt=now)=>{
 const scope={hostIds:['local'],omittedHostIds:[]};
 const result=normalizeWorktreePs({worktrees:[{worktreeId:'workspace',hostId:'local',unverifiableTerminalCount:0,agents:hooks}],totalCount:1,truncated:false,hostScope:scope},{hostId:'paired',generation:1,observedAt},{catalog:{terminals,totalCount:terminals.length,truncated:false,hostScope:scope},statuses:new Map(),ui});
 assert.ok(result.ok);return result.agents;
};
const titles=(rows:ReturnType<typeof normalize>,keys:readonly string[])=>keys.map(key=>rows.find(row=>bindKey(row)===key)!.title);

test('D25 retains read and stale live panes, ranked by output rather than dashboard state',()=>{
 const rows=normalize([hook('read'),{...hook('stale','working'),updatedAt:now-3_600_000},hook('attention','waiting')],[terminal('read',now-10),terminal('stale',now-20),terminal('attention',now-30)],{ui:{acknowledgedAgentsByPaneKey:{'read:leaf':now}}});
 const present=dashboardPresent(rows,new Set(rows.map(bindKey)));
 assert.deepEqual(titles(rows,recencyOrder(rows,present)),['read','stale','attention']);
});

test('equal output uses the original state event then fixed identity; missing output is last',()=>{
 const rows=normalize([hook('z', 'done',now-20),hook('b','working',now-10),hook('a','done',now-10),hook('missing','waiting',now)],
  [terminal('z',now-100),terminal('b',now-100),terminal('a',now-100),terminal('missing',null)]);
 const present=dashboardPresent(rows,new Set(rows.map(bindKey)));
 assert.deepEqual(titles(rows,recencyOrder(rows,present,new Map([[bindKey(rows[3]),now+1000]]))),['a','b','z','missing']);
 const later=normalize([hook('z','done',now-20),hook('b','working',now-10),hook('a','done',now-10),hook('missing','waiting',now)],
  [terminal('z',now-100),terminal('b',now-100),terminal('a',now-100),terminal('missing',null)],{},now+1000);
 assert.deepEqual(titles(later,recencyOrder(later,new Set(later.map(bindKey)))),['a','b','z','missing'],'polling cannot mint output timestamps');
});

test('orphaned, disconnected, absent and ambiguous hook panes stay in inventory but off keys',()=>{
 const rows=normalize(['live','orphan','closed','absent','duplicate'].map(id=>hook(id,'working')),
  [terminal('live',now),{...terminal('orphan',now),orphaned:true},{...terminal('closed',now),connected:false},terminal('duplicate',now),{...terminal('duplicate',now),handle:'second'}]);
 assert.equal(rows.length,5,'presentation exclusion cannot delete protected inventory');
 assert.deepEqual(titles(rows,recencyOrder(rows,dashboardPresent(rows,new Set(rows.map(bindKey))))),['live']);
});

test('recent keys keep their number while in the newest six or nine',()=>{
 assert.deepEqual(recentView(['b','a','c','d','e','f'],['f','b','a','c','d','e','g']).keys,['b','a','c','d','e','f']);
 assert.deepEqual(recentView(['b','a','c','d','e','f'],['g','b','a','c','d','e','f']).keys,['b','a','c','d','e','g']);
 assert.deepEqual(recentView(['b','a','c','d','e','f','g','h','i'],['j','b','a','c','d','e','f','g','h','i'],9).keys,['b','a','c','d','e','f','g','h','j']);
});

test('the display-only cache retains the same live read pane without reviving a disconnected pane',()=>{
 const rows=normalize([hook('read')],[terminal('read',now)],{ui:{acknowledgedAgentsByPaneKey:{'read:leaf':now}}});
 const key=bindKey(rows[0]),input={hostId:'paired',issuedAt:now,agents:rows,keys:[key],items:[key],selectedKey:key,partial:false,unresolved:0,focusInfo:{project:null,worktree:null,following:true}};
 const cached=captureDisplayCache(input,now);assert.ok(cached,'D25 membership must survive the display cache boundary');
 const restored=decodeDisplayCache(encodeDisplayCache(cached),now);assert.ok(restored);
 assert.equal(pendingSelectionDisplay(restored,'paired',now+100,true,null,[key],{...input,issuedAt:now+100,selectedKey:null})?.lcdSource,'live-row');
 const closed=normalize([hook('read')],[{...terminal('read',now),connected:false}]);
 assert.equal(pendingSelectionDisplay(restored,'paired',now+100,true,null,[],{...input,agents:closed,issuedAt:now+100,keys:[],items:[],selectedKey:null})?.lcdSource,'retained');
});
