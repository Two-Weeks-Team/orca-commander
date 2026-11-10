import assert from 'node:assert/strict';
import {parseClaudePrompt,claudePromptKeys,sameClaudePrompt} from '../src/core/claude-terminal-prompt';
import {claudePermissionPartial} from './fixtures/claude-permission-partial';
import {claudeQuestion2319,claudeQuestion2319Rows} from './fixtures/claude-question-2.1.319';
// Original Claude 2.1.319 terminal shape. All addresses and command data below are synthetic.
const permission=[
 'Bash command',
 'Hook tool.check requires confirmation for this command: account email test@example.invalid',
 '  printf "harmless fixture"',
 'Do you want to proceed?',
 '❯ 1. Yes',
 '  2. No',
 'Esc to cancel · Tab to amend',
];
const frame=(lines:string[])=>({terminal:{handle:'term-test',source:'screen',limited:false,truncated:true,returnedLineCount:lines.length,tail:lines,tailRows:lines.map(()=>({wrapped:false,trailingSpaces:0}))}});
const parsed=parseClaudePrompt(frame(permission),'term-test','permission');assert.ok(parsed.ok);
assert.equal(parsed.prompt.question,'Do you want to proceed?');assert.equal(parsed.prompt.currentIndex,0);
assert.deepEqual(parsed.prompt.options.map(o=>o.label),['Yes','No']);assert.equal(parsed.prompt.canSend,true);
assert.match(parsed.prompt.detail,/test@example.invalid/);assert.match(parsed.prompt.detail,/harmless fixture/);
assert.deepEqual(claudePromptKeys(parsed.prompt,1),{kind:'digit',text:'2'});
const no=permission.map(x=>x==='❯ 1. Yes'?'  1. Yes':x==='  2. No'?'❯ 2. No':x);
const declined=parseClaudePrompt(frame(no),'term-test','permission');assert.ok(declined.ok);
assert.deepEqual(claudePromptKeys(declined.prompt,0,undefined,'cursor'),{kind:'cursor',direction:-1,steps:1},'the explicit defaultToNo fallback is a cursor plan');
assert.equal(sameClaudePrompt(parsed.prompt,declined.prompt),false,'current cursor is part of revalidation');
const question=[' ☐ Test','Pick a harmless test result.','❯ 1. Alpha','    First result','  2. Beta','    Second result','  3. Type something.','Enter to select · ↑/↓ to navigate · Esc to cancel'];
const q=parseClaudePrompt(frame(question),'term-test','question');assert.ok(q.ok);
assert.equal(q.prompt.options[0].description,'First result');assert.equal(q.prompt.options[2].input,true);
assert.deepEqual(claudePromptKeys(q.prompt,2,'Synthetic answer'),{kind:'cursor',direction:1,steps:2,paste:'\u001b[200~Synthetic answer\u001b[201~'});
assert.equal(claudePromptKeys(q.prompt,2),null);assert.equal(claudePromptKeys(q.prompt,-1),null);
assert.equal(claudePromptKeys(q.prompt,0,'unexpected'),null);
const three=parseClaudePrompt(frame(permission.slice(0,-1).concat(['  3. Yes, for this session',permission.at(-1)!])),'term-test','permission');assert.ok(three.ok);assert.equal(three.prompt.options.length,3);
const tall=parseClaudePrompt(frame([...permission,'Make the terminal taller to approve.']),'term-test','permission');assert.deepEqual(tall,{ok:false,reason:'short_terminal'});
const clipped=parseClaudePrompt(frame(permission.slice(0,3).concat(['[truncated]',...permission.slice(3)])),'term-test','permission');assert.ok(clipped.ok);assert.equal(clipped.prompt.clipped,true);assert.equal(claudePromptKeys(clipped.prompt,0),null);
for(const lines of [permission.filter(x=>!x.startsWith('❯')),permission.map(x=>x==='  2. No'?'❯ 2. No':x),permission.map(x=>x==='  2. No'?'  3. No':x),permission.slice(0,-1),['1. Yes','❯ 2. No','Esc to cancel']])assert.equal(parseClaudePrompt(frame(lines),'term-test','permission').ok,false);
assert.equal(parseClaudePrompt({...frame(permission),terminal:{...frame(permission).terminal,source:'stream'}},'term-test','permission').ok,false);
assert.equal(parseClaudePrompt({...frame(permission),terminal:{...frame(permission).terminal,limited:true}},'term-test','permission').ok,false);
assert.equal(parseClaudePrompt(frame(permission),'wrong-handle','permission').ok,false);
const changed=parseClaudePrompt(frame(permission.map(x=>x==='  2. No'?'  2. Deny this command':x)),'term-test','permission');assert.ok(changed.ok);assert.equal(sameClaudePrompt(parsed.prompt,changed.prompt),false);
const latest=parseClaudePrompt(frame([...permission,'',...permission.map(x=>x.includes('printf')?'  printf "new fixture"':x)]),'term-test','permission');assert.ok(latest.ok);assert.doesNotMatch(latest.prompt.detail,/harmless fixture/,'only the last prompt block is actionable');
const wrapped=frame(['Bash command','Reason: synthetic test','  printf hello','world',...permission.slice(3)]);wrapped.terminal.tailRows[2].trailingSpaces=1;wrapped.terminal.tailRows[3].wrapped=true;const w=parseClaudePrompt(wrapped,'term-test','permission');assert.ok(w.ok);assert.match(w.prompt.detail,/printf hello world/,'xterm row metadata preserves spaces across soft wrapping');
const actualQuestion=parseClaudePrompt(frame([...question.slice(0,-1),'────────────────────────────','  4. Chat about this',question.at(-1)!]),'term-test','question');assert.ok(actualQuestion.ok,'H1: the separator before Chat about this belongs to the real menu');assert.equal(actualQuestion.prompt.options.length,4);
assert.equal(parseClaudePrompt(frame(['☐ Q1  ☐ Q2  ✔ Submit',...question]),'term-test','question').ok,false,'multi-question tabs remain desktop only');
const boundary=parseClaudePrompt(frame(['Earlier conversation … +12 lines (ctrl+o to expand)','╌'.repeat(80),...permission.map(x=>x.includes('printf')?'  git diff A...B':x)]),'term-test','permission');assert.ok(boundary.ok);assert.equal(boundary.prompt.canSend,true,'literal command ellipses are not clipping and dotted dialog boundaries exclude history');assert.doesNotMatch(boundary.prompt.detail,/Earlier conversation/);
const partial=parseClaudePrompt(frame(claudePermissionPartial),'term-test','permission');assert.ok(partial.ok);assert.equal(partial.prompt.canSend,true);assert.doesNotMatch(partial.prompt.detail,/Earlier conversation/);
console.log('PASS: Claude permission parser and nonnumeric cursor sequence (fake fixture; no host send)');
const realQuestion=parseClaudePrompt({terminal:{...frame(claudeQuestion2319).terminal,tailRows:claudeQuestion2319Rows}},'term-test','question');
assert.ok(realQuestion.ok,'H1: exact supplied single-tab AskUserQuestion parses');
assert.equal(realQuestion.prompt.currentIndex,0);
assert.deepEqual(realQuestion.prompt.options.map(o=>o.label),['빨강','초록','파랑','Type something.','Chat about this']);
assert.equal(realQuestion.prompt.options[0].description,'시험 선택지 1입니다. 아무 동작도 하지 않습니다.');
assert.match(realQuestion.prompt.question,/어느 색을 고를까요\?/,'wrapped question body is complete');
assert.equal(realQuestion.prompt.canSend,true);
assert.equal(parseClaudePrompt(frame([' ☐ Q1  ☐ Q2',...claudeQuestion2319.slice(1)]),'term-test','question').ok,false,'two tab chips without Submit are still unsupported');
assert.equal(parseClaudePrompt(frame(claudeQuestion2319.slice(1)),'term-test','question').ok,false,'a question without one identifiable tab is ambiguous');
