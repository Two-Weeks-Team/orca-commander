import {wrapTerminalBracketedPasteText} from '../upstream/orca-1.4.245/src/shared/terminal-bracketed-paste-text';
import type {AgentSnapshot} from './types';
export type ClaudePromptKind='permission'|'question';
export function isClaudeTerminalWaiting(agent:AgentSnapshot|undefined|null):agent is AgentSnapshot&{terminalPrompt:NonNullable<AgentSnapshot['terminalPrompt']>}{
 return !!agent&&agent.provider==='claude'&&!('nativeRequest'in agent)&&agent.permissionEvidence!=='structured_verified'&&!!agent.terminalPrompt&&['waiting','blocked'].includes(agent.terminalPrompt.state)&&agent.state===(agent.terminalPrompt.kind==='permission'?'permission':'question');
}
export interface ClaudePromptOption {number:number;label:string;description:string;input:boolean}
export interface ClaudeTerminalPrompt {kind:ClaudePromptKind;question:string;detail:string;options:readonly ClaudePromptOption[];currentIndex:number;block:string;clipped:boolean;canSend:boolean}
export type ClaudePromptParse={ok:true;prompt:ClaudeTerminalPrompt}|{ok:false;reason:'unparsed'|'short_terminal'};
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** One complete current viewport, never a scrollback stream. `truncated` denotes older history, not this frame. */
export function claudeScreenLines(raw:unknown,handle:string):string[]|null{
 if(!rec(raw)||!rec(raw.terminal))return null;const t=raw.terminal;
 if(t.handle!==handle||t.source!=='screen'||t.limited!==false||!Array.isArray(t.tail)||!Array.isArray(t.tailRows)||t.tail.length!==t.tailRows.length||t.returnedLineCount!==t.tail.length||t.tail.length>1000)return null;
 const lines:string[]=[];let length=0;
 for(let i=0;i<t.tail.length;i++){
  const line=t.tail[i],row=t.tailRows[i];
  // The screen serializer supplies plain lines; raw control bytes are not screen text.
  if(typeof line!=='string'||/[\u0000-\u0008\u000a-\u001f\u007f]/.test(line)||!rec(row)||typeof row.wrapped!=='boolean'||!Number.isSafeInteger(row.trailingSpaces)||Number(row.trailingSpaces)<0||Number(row.trailingSpaces)>1000)return null;
  length+=line.length;if(length>200000)return null;
  if(row.wrapped){if(!lines.length)return null;const previous=t.tailRows[i-1];if(!rec(previous))return null;lines[lines.length-1]+=' '.repeat(Number(previous.trailingSpaces))+line.trimEnd();}else lines.push(line.trimEnd());
 }
 return lines;
}
const direct=(s:string)=>/^(?:Type something[.\u2026]?|Other|직접 입력)$/i.test(s.trim());
const option=/^\s*(❯)?\s*(\d{1,2})\.\s+(.+?)\s*$/;
const separator=/^\s*[─━═╌╍┄┈\-]{4,}\s*$/;
/** Conservative recognition of the bottom-most Claude menu. Original text is kept only in this returned memory value. */
export function parseClaudePrompt(raw:unknown,handle:string,kind:ClaudePromptKind):ClaudePromptParse{
 const lines=claudeScreenLines(raw,handle);if(!lines)return{ok:false,reason:'unparsed'};
 if(lines.some(line=>/[☐☑].*\bSubmit\b/.test(line)))return{ok:false,reason:'unparsed'};
 if(lines.some(line=>/Make the terminal taller/i.test(line)))return{ok:false,reason:'short_terminal'};
 let end=-1;for(let i=0;i<lines.length;i++)if(/Esc to cancel/i.test(lines[i]))end=i;
 if(end<0||/space.*(?:toggle|select)|multi.select/i.test(lines[end]))return{ok:false,reason:'unparsed'};
 let first=-1;for(let i=0;i<end;i++){const m=lines[i].match(option);if(m&&m[2]==='1')first=i;}
 if(first<1)return{ok:false,reason:'unparsed'};
 const options:ClaudePromptOption[]=[];let currentIndex=-1;
 let divided=false;
 for(let i=first;i<end;i++){
  const line=lines[i],m=line.match(option);
  if(m){
   if(Number(m[2])!==options.length+1||options.length>=20)return{ok:false,reason:'unparsed'};
   if(m[1]){if(currentIndex!==-1)return{ok:false,reason:'unparsed'};currentIndex=options.length;}
   options.push({number:Number(m[2]),label:m[3],description:'',input:direct(m[3])});
   divided=false;
  }else if(kind==='question'&&separator.test(line)&&options.length&&!divided){
   divided=true;
  }else if(line.trim()){
   if(!/^\s{2,}\S/.test(line)||line.includes('❯')||!options.length)return{ok:false,reason:'unparsed'};
   const last=options[options.length-1];last.description+=(last.description?'\n':'')+line.trim();
  }
 }
 if(options.length<2||currentIndex<0||options.filter(x=>x.input).length>1)return{ok:false,reason:'unparsed'};
 let start=0;for(let i=0;i<first;i++)if(separator.test(lines[i])||/Esc to cancel/i.test(lines[i]))start=i+1;
 const prefix=lines.slice(start,first);while(prefix.length&&!prefix[0].trim())prefix.shift();while(prefix.length&&!prefix[prefix.length-1].trim())prefix.pop();
 if(!prefix.length)return{ok:false,reason:'unparsed'};
 // Only the observed single-tab AskUserQuestion format is supported. Multiple
 // tabs need independent navigation/Submit handling that this route does not own.
 if(kind==='question'&&(prefix.join('\n').match(/[☐☑]/g)?.length!==1||!prefix.some(line=>/^\s*[☐☑]\s+\S/.test(line))))return{ok:false,reason:'unparsed'};
 let proceed=-1;for(let i=0;i<prefix.length;i++)if(/^\s*Do you want to proceed\?\s*$/.test(prefix[i]))proceed=i;
 if(kind==='permission'&&(proceed<1||proceed!==prefix.length-1)||kind==='question'&&proceed>=0)return{ok:false,reason:'unparsed'};
 const question=kind==='permission'?prefix[proceed].trim():prefix.join('\n').trim();
 const detail=kind==='permission'?prefix.slice(0,proceed).join('\n').trim():'';
 const block=[...prefix,...lines.slice(first,end+1)].join('\n');
 const clipped=/^\s*\[(?:truncated|omitted)\]\s*$|^\s*[.\u2026]+\s*\+?\d+\s+lines\b.*(?:expand|omitted|truncated).*$/im.test([question,detail,...options.flatMap(o=>[o.input?'':o.label,o.description])].join('\n'));
 return{ok:true,prompt:{kind,question,detail,options,currentIndex,block,clipped,canSend:!clipped}};
}
export function sameClaudePrompt(a:ClaudeTerminalPrompt,b:ClaudeTerminalPrompt):boolean{return a.kind===b.kind&&a.block===b.block&&a.currentIndex===b.currentIndex;}
export function sameClaudePromptContent(a:ClaudeTerminalPrompt,b:ClaudeTerminalPrompt):boolean{return a.kind===b.kind&&a.question===b.question&&a.detail===b.detail&&JSON.stringify(a.options)===JSON.stringify(b.options);}
export function claudeInputVisible(original:ClaudeTerminalPrompt,after:ClaudeTerminalPrompt,index:number,text:string):boolean{
 const row=after.options[index];if(!row||!original.options[index]?.input||after.currentIndex!==index||[row.label,row.description].filter(Boolean).join('\n')!==text)return false;
 return sameClaudePromptContent(original,{...after,options:after.options.map((o,i)=>i===index?original.options[index]:o)});
}
export type ClaudeResponsePlan={kind:'digit';text:string}|{kind:'cursor';direction:-1|0|1;steps:number;paste?:string};
/** D27 revised: one digit by default, never digits in an input row; explicit fallback verifies each arrow. */
export function claudePromptKeys(prompt:ClaudeTerminalPrompt,index:number,text?:string,mode:'digit'|'cursor'='digit'):ClaudeResponsePlan|null{
 if(!prompt.canSend||!Number.isInteger(index)||index<0||index>=prompt.options.length)return null;
 const choice=prompt.options[index];
 if(choice.input&&(!text?.trim()||text.length>32768||text.split(/\r\n|\r|\n/).length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)))return null;
 if(!choice.input&&text!==undefined)return null;
 if(mode==='digit'&&!choice.input&&!prompt.options[prompt.currentIndex].input&&choice.number<=9)return{kind:'digit',text:String(choice.number)};
 const delta=index-prompt.currentIndex;return{kind:'cursor',direction:delta<0?-1:delta>0?1:0,steps:Math.abs(delta),...(choice.input?{paste:wrapTerminalBracketedPasteText(text!)}:{})};
}
