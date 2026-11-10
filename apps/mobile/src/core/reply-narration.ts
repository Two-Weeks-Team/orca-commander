import type {NativeSpeech,SpeechLanguage,SpeechResult} from '../adapters/native-speech';
/** Fixed small utterances preserve the prefix even at the slowest supported device rate. */
function chunks(text:string):string[]{
 const chars=Array.from(text),out:string[]=[];
 while(chars.length){let count=Math.min(32,chars.length);if(count<chars.length){const boundary=chars.slice(0,count).map((c,i)=>/[\s.!?。！？]/u.test(c)?i+1:0).filter(Boolean).at(-1);if(boundary&&boundary>=16)count=boundary;}out.push(chars.splice(0,count).join(''));}
 return out;
}
export function buildReplySpeechSegments(intro:string,body:string,continuation:string):{intro:string[];body:string[];continuation:string|null}{
 const chars=Array.from(body);
 return{intro:chunks(Array.from(intro).slice(0,64).join('')),body:chunks(chars.slice(0,120).join('')),continuation:chars.length>120?continuation:null};
}
export interface ReplyNarration {id:string;segments:readonly string[];language:SpeechLanguage;rate():number;isCurrent():boolean}
export type ReplyNarrationResult=SpeechResult|'already_read'|'busy';
/** Owns one local utterance sequence, never sends a host request and never retries uncertain playback. */
export function createReplyNarrator(speech:NativeSpeech){
 const seen=new Set<string>();let run:{canceled:boolean}|undefined;
 const cancel=()=>{if(run){run.canceled=true;speech.cancel();}};
 return{cancel,async read(request:ReplyNarration):Promise<ReplyNarrationResult>{
  if(run)return 'busy';if(seen.has(request.id))return 'already_read';
  if(!request.id||request.id.length>1024||seen.size>=256||request.segments.length===0||request.segments.length>16||request.segments.some(s=>!s.trim()||s.length>4000))return 'unavailable';
  seen.add(request.id);const own={canceled:false};run=own;const segments=[...request.segments];
  const current=()=>{try{return !own.canceled&&request.isCurrent();}catch{return false;}};
  try{
   for(const text of segments){
    if(!current()){speech.cancel();return 'interrupted';}
    let result:SpeechResult;try{result=await speech.speak(text,request.language,request.rate());}catch{speech.cancel();return 'uncertain';}
    if(!current()){speech.cancel();return 'interrupted';}
    if(result!=='finished')return result;
   }
   return 'finished';
  }finally{if(run===own)run=undefined;}
 }};
}
