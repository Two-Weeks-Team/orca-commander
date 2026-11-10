import assert from 'node:assert/strict';
import {resolveVoiceDestination} from '../src/core/voice-destination';
import {bindKey,type DeckItem} from '../src/core/deck-model';
let count=0;const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const agent=(id:string):DeckItem=>({id,provider:'codex',title:id,summary:'',state:'working',eventType:'informational',updatedAt:'',target:{hostId:'fixture',worktreeId:'worktree',terminalId:id,connectionGeneration:2}});
const A=agent('A'),B=agent('B'),a=bindKey(A),b=bindKey(B);
const draft={text:'fixture input',targetKey:a,generation:2,ambiguous:false,destinationResolved:true};
const c={live:true,hostId:'fixture',generation:2,agents:[A,B],present:new Set([a,b]),selected:b,desktop:{worktreeId:'worktree',tabId:'A'}};
same(resolveVoiceDestination(draft,true,{...c,selected:a}),{key:a,generation:2,source:'captured'});
same(resolveVoiceDestination(draft,true,c),null); // A changed selection never retargets the recorded draft.
same(resolveVoiceDestination({...draft,targetKey:null,destinationResolved:false},true,c),null);
same(resolveVoiceDestination({...draft,generation:1},true,c),null);
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,selected:null}),null);
same(resolveVoiceDestination({...draft,destinationResolved:false},true,{...c,selected:a}),null);
same(resolveVoiceDestination({...draft,ambiguous:true},true,{...c,selected:a}),null);
same(resolveVoiceDestination(draft,true,{...c,agents:[B],present:new Set([b])}),null); // Missing captured pane cannot fall through to B.
same(resolveVoiceDestination(draft,true,{...c,selected:a,agents:[A,A,B]}),null);
same(resolveVoiceDestination(draft,false,c),null); // A canceled/failed capture cannot open automatic confirmation.
same(resolveVoiceDestination(draft,true,{...c,live:false}),null);
same(resolveVoiceDestination(draft,true,{...c,generation:null}),null);
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,selected:null}),null);
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,selected:null}),null); // No arbitrary first pane.
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,selected:null,agents:[A,A,B]}),null); // Duplicate desktop evidence is not unique.
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,selected:null,agents:[A],present:new Set([a])}),null);
same(resolveVoiceDestination(draft,true,{...c,agents:[{...A,target:{...A.target,connectionGeneration:1}}],selected:null}),null);
const request={...A,nativeRequest:{tabId:'A',sessionId:'request-session',itemId:'request-item'}},native=bindKey(request);
const structured={...c,agents:[A,B,request],present:new Set([a,b,native]),selected:native};
same(resolveVoiceDestination({...draft,targetKey:native},true,structured),null);
same(resolveVoiceDestination({...draft,targetKey:null},true,structured),null);
const sibling={...A,target:{...A.target,terminalId:'tab:surviving'}};
same(resolveVoiceDestination({...draft,targetKey:null},true,{...c,agents:[sibling],present:new Set([bindKey(sibling)]),selected:null}),null); // A closed focused leaf cannot propose a sibling.
console.log(`PASS: ${count} fresh voice destination proposals (pure metadata; no prepare or send)`);
