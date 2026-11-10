import assert from 'node:assert/strict';
import {classifyNavigation} from '../src/core/voice-navigation';
import {routeCapturedVoice} from '../src/core/ptt-gesture';
let count=0;
const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const labels=[{key:'one',label:'API workspace'},{key:'two',label:'UI workspace'}];
for(const [locale,phrases] of [['en',['next','previous','what needs me','go to API workspace']],['ko',['다음','이전','판단할 작업','API workspace 선택']]] as const){
 same(classifyNavigation(phrases[0],locale,labels),{kind:'focus.step',direction:'next'});
 same(classifyNavigation(phrases[1],locale,labels),{kind:'focus.step',direction:'prev'});
 same(classifyNavigation(phrases[2],locale,labels),{kind:'focus.attention',direction:'next'});
 same(classifyNavigation(phrases[3],locale,labels),{kind:'focus.select',key:'one'});
}
same(classifyNavigation('  NEXT  ','en',labels),{kind:'focus.step',direction:'next'});
same(classifyNavigation('go to API workspace','both',[...labels,{key:'three',label:'API workspace'}]),{kind:'ambiguous',reason:'duplicate'});
same(classifyNavigation('go to missing','en',labels),{kind:'ambiguous',reason:'unknown'});
same(classifyNavigation('없는 이름 선택','ko',labels),{kind:'ambiguous',reason:'unknown'});
same(classifyNavigation('go to api WORKSPACE','en',[{key:'one',label:'API workspace'},{key:'two',label:'api WORKSPACE'}]),{kind:'ambiguous',reason:'duplicate'});
for(const text of ['allow','reject','confirm','send','approve this command','허용','거부','전송','승인','next and approve','다음 승인','next\n','n\u200bext','다음\n허용','please go to API workspace','次へ']){
 same(classifyNavigation(text,'both',labels),{kind:'dictation'});
}
same(classifyNavigation('go to UI workspace and send','both',labels),{kind:'ambiguous',reason:'unknown'});
// English and Korean are the only built-in command tables; installing a UI pack cannot add a command.
same(classifyNavigation('다음','en',labels),{kind:'dictation'});
same(classifyNavigation('next','ko',labels),{kind:'dictation'});
same(classifyNavigation('작업 선택','both',[{key:'nfd',label:'작업'.normalize('NFD')}]),{kind:'focus.select',key:'nfd'});
same(classifyNavigation('작업 선택','both',[{key:'nfc',label:'작업'}]),{kind:'focus.select',key:'nfc'});
// Device transcription can append exactly one sentence-ending period to a closed command.
same(classifyNavigation('Next.','en',labels),{kind:'focus.step',direction:'next'});
for(const text of ['next。','  NEXT.  '])same(classifyNavigation(text,'both',labels),{kind:'focus.step',direction:'next'});
for(const text of ['다음.','다음。'])same(classifyNavigation(text,'ko',labels),{kind:'focus.step',direction:'next'});
same(classifyNavigation('previous.','en',labels),{kind:'focus.step',direction:'prev'});
same(classifyNavigation('what needs me。','en',labels),{kind:'focus.attention',direction:'next'});
same(classifyNavigation('API workspace 선택.','ko',labels),{kind:'focus.select',key:'one'});
const punctuatedLabels=[{key:'plain',label:'Repo'},{key:'period',label:'Repo.'}];
const unchangedLabels=JSON.stringify(punctuatedLabels);
same(classifyNavigation('go to Repo.','en',[punctuatedLabels[0]]),{kind:'focus.select',key:'plain'});
same(classifyNavigation('go to Repo.','en',[punctuatedLabels[1]]),{kind:'focus.select',key:'period'});
same(classifyNavigation('go to Repo.','en',punctuatedLabels),{kind:'ambiguous',reason:'duplicate'});
same(classifyNavigation('go to Repo。','en',[{key:'literal',label:'Repo。'}]),{kind:'focus.select',key:'literal'});
same(classifyNavigation('go to Repo。','en',[punctuatedLabels[0],{key:'literal',label:'Repo。'}]),{kind:'ambiguous',reason:'duplicate'});
same(classifyNavigation('go to Repo..','en',[punctuatedLabels[1]]),{kind:'ambiguous',reason:'unknown'});
same(classifyNavigation('go to Repo..','en',[{key:'literal-dots',label:'Repo..'}]),{kind:'focus.select',key:'literal-dots'});
same(classifyNavigation('Repo. 선택.','ko',[punctuatedLabels[1]]),{kind:'focus.select',key:'period'});
same(classifyNavigation('go to Repo!.','en',[{key:'literal-bang',label:'Repo!'}]),{kind:'focus.select',key:'literal-bang'});
same(classifyNavigation('go to Repo.','en',[punctuatedLabels[0],punctuatedLabels[0]]),{kind:'ambiguous',reason:'duplicate'});
same(classifyNavigation('go to Repo 선택.','both',[{key:'en',label:'Repo 선택'},{key:'ko',label:'go to Repo'}]),{kind:'ambiguous',reason:'duplicate'});
same(classifyNavigation('go to missing.','en',labels),{kind:'ambiguous',reason:'unknown'});
same(classifyNavigation('없는 이름 선택.','ko',labels),{kind:'ambiguous',reason:'unknown'});
for(const text of ['next..','next...','next。。','next.。','next!','next?','next,','next…','Say next.','please next.','send.','approve.','allow.','reject.','confirm.','전송.','승인.','next.\n','n\u200bext.']){
 same(classifyNavigation(text,'both',labels),{kind:'dictation'});
}
same(classifyNavigation('다음.','ko',labels),{kind:'focus.step',direction:'next'});
same(JSON.stringify(punctuatedLabels),unchangedLabels);
// The real captured-voice router compares candidates but retains the exact original draft.
const capturedContext={key:'plain',generation:3,frameId:'before-capture',labels:punctuatedLabels};
same(routeCapturedVoice('Next.',capturedContext,false),{kind:'navigate',intent:{kind:'focus.step',direction:'next'}});
for(const text of ['Next.','다음.','  Say next.  ','send.','승인.']){
 same(routeCapturedVoice(text,capturedContext,true),{kind:'draft',draft:{text,targetKey:'plain',generation:3,frameId:'before-capture',ambiguous:false,destinationResolved:false}});
}
same(routeCapturedVoice('Say next.',capturedContext,false),{kind:'draft',draft:{text:'Say next.',targetKey:'plain',generation:3,frameId:'before-capture',ambiguous:false,destinationResolved:true}});
same(routeCapturedVoice('go to Repo.',capturedContext,false),{kind:'draft',draft:{text:'go to Repo.',targetKey:'plain',generation:3,frameId:'before-capture',ambiguous:true,destinationResolved:false}});
console.log(`PASS: ${count} closed voice navigation assertions (synthetic phrases; no capture or action)`);
