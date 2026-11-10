import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindKey,deriveDeckView,emptyDeckState,reconcileDeck,type DeckItem} from '../src/core/deck-model';
import {captureDisplayCache,encodeDisplayCache,pendingSelectionDisplay,type CacheCapture,type DeckDisplayCache} from '../src/core/deck-display-cache';
const now=500_000,hostId='fixture-host';
const agent=(n:number):DeckItem=>({id:`pane-${n}`,provider:'claude',title:`Live task ${n}`,summary:'DO_NOT_COPY_BODY',state:'working',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId,worktreeId:'fixture-workspace',terminalId:`tab-${n}:leaf`,connectionGeneration:2},place:{repoId:'repo',repo:'Project',worktreeName:'Workspace',worktreeActive:false,worktreeRank:0,agentRank:n}});
const agents=Array.from({length:8},(_,i)=>agent(i)),items=agents.map(bindKey),keys=items.slice(0,6),selected=items[7];
const initial:CacheCapture={hostId,issuedAt:now-20_000,agents:agents.map((a,i)=>i===7?{...a,title:'Restored old title',state:'done'}:a),items,keys,selectedKey:selected,partial:false,unresolved:0,focusInfo:{project:'Project',worktree:'Workspace',following:true,synced:true}};
const cache=captureDisplayCache(initial,now-20_000)!;
const live:CacheCapture={...initial,issuedAt:now,agents,selectedKey:null,focusInfo:{project:null,worktree:null,following:true,synced:false}};
const pending=(value:DeckDisplayCache,source:CacheCapture,at=now)=>Reflect.apply(pendingSelectionDisplay,undefined,[value,hostId,at,true,null,source.items??[],source]) as (DeckDisplayCache&{lcdSource?:'live-row'|'retained'})|null;

test('LIVE inventory refreshes the cached LCD from its exact row outside the six numbered keys',()=>{
 const shown=pending(cache,live);assert.ok(shown);
 assert.equal(shown.rows.find(row=>row.key===selected)?.title,'Live task 7');
 assert.equal(shown.rows.find(row=>row.key===selected)?.state,'working');
 assert.equal(shown.issuedAt,now,'a matching actual live row supplies its own current source clock');
 assert.equal(shown.lcdSource,'live-row');
 assert.equal(shown.selectedKey,selected,'this is a display identity only');
 assert.equal(shown.items.indexOf(selected),7,'the full live list is used rather than the six keys');
 assert.equal(shown.focusInfo.project,'Project');assert.equal(shown.focusInfo.worktree,'Workspace');assert.equal(shown.focusInfo.synced,false);
});

test('LIVE inventory without that row keeps the last LCD only until its original display TTL',()=>{
 const missing={...live,agents:agents.slice(0,7),items:items.slice(0,7)};
 const shown=pending(cache,missing);assert.ok(shown);
 assert.equal(shown.lcdSource,'retained');
 assert.equal(shown.rows.find(row=>row.key===selected)?.title,'Restored old title');
 assert.equal(shown.issuedAt,now-20_000,'an unrelated live read never renews missing-row metadata');
 assert.ok(pending(cache,{...missing,issuedAt:now+160_000},now+160_000));
 assert.equal(pending(cache,{...missing,issuedAt:now+160_001},now+160_001),null);
});

test('old generation cache never restores a live selected target or enables an action',()=>{
 const source={live:true,complete:true,generation:2,agents,confirmedAt:now,scopeIdentity:'fixture-scope',uncertaintyKnown:true,unresolvedPanes:new Set<string>()};
 const deck=reconcileDeck(emptyDeckState(),source,now);
 const before=JSON.stringify(deck);const shown=pending(cache,live);assert.ok(shown);
 assert.equal(JSON.stringify(deck),before);assert.equal(deck.selected,null);
 const view=deriveDeckView(deck,{...source,now,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:true,speech:true},unresolvedCount:0},{keys,items});
 assert.equal(view.display.agent,null);assert.equal(view.commands.input,false);assert.equal(view.commands.allow,false);assert.equal(view.commands.reject,false);
 const encoded=encodeDisplayCache(shown)!;assert.ok(encoded);
 for(const word of ['DO_NOT_COPY_BODY','"target"','connectionGeneration','lcdSource'])assert.equal(encoded.includes(word),false,word);
});

test('freshness, host and duplicate guards cannot promote a different row into the display',()=>{
 assert.equal(pending(cache,{...live,hostId:'foreign'}),null);
 assert.equal(pending(cache,{...live,issuedAt:now-30_001}),null);
 assert.equal(pending(cache,{...live,issuedAt:now+1}),null);
 const duplicate=pending(cache,{...live,agents:[...agents,agents[7]]});assert.ok(duplicate);assert.equal(duplicate.lcdSource,'retained');
 assert.equal(duplicate.issuedAt,cache.issuedAt);
 assert.equal(Reflect.apply(pendingSelectionDisplay,undefined,[cache,hostId,now,true,items[0],items,live]),null,'a real fresh selection always wins');
 assert.equal(Reflect.apply(pendingSelectionDisplay,undefined,[cache,hostId,now,false,null,items,live]),null,'unapplied live inventory still uses the existing whole readonly cache');
});
