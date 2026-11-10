import {en} from '../i18n/en';
import {ko} from '../i18n/ko';

export type VoiceConfirmationChoice='yes'|'no'|'unknown';
export type VoiceConfirmationLocale='en'|'ko'|'both';
type SpeechEnd='finished'|'interrupted'|'unavailable'|'uncertain';
type Heard={kind:'final';text:string}|{kind:'timeout'}|{kind:'canceled'};
interface Port<T extends object>{now():number;isCurrent(ticket:T):boolean;speak(ticket:T):Promise<SpeechEnd>;listen():Promise<Heard>;cancelAudio():void;confirm(ticket:T):Promise<void>}
const normalize=(text:string)=>text.normalize('NFC').trim().toLowerCase().replace(/ +/g,' ');
/** Only the scoped final-answer listener uses this table. UI language packs cannot add authority. */
export function classifyVoiceConfirmation(text:string,locale:VoiceConfirmationLocale):VoiceConfirmationChoice{
 if(typeof text!=='string'||text.length>256||/[\p{Cc}\p{Cf}]/u.test(text))return 'unknown';
 const utterance=normalize(text),candidates=[utterance];
 if(/[.。!]$/.test(utterance)&&!/[.。!]{2}$/.test(utterance))candidates.push(normalize(utterance.slice(0,-1)));
 const catalogs=locale==='both'?[en,ko]:locale==='en'?[en]:locale==='ko'?[ko]:[];
 const yes=['voiceConfirm.yes','voiceConfirm.send','voiceConfirm.sendIt','voiceConfirm.confirm','voiceConfirm.okay','voiceConfirm.ok'] as const;
 const no=['voiceConfirm.no','voiceConfirm.cancel','voiceConfirm.stop'] as const;
 const hit=(keys:readonly(keyof typeof en)[])=>catalogs.some(c=>keys.some(k=>candidates.includes(normalize(c[k]))));
 const positive=hit(yes),negative=hit(no);
 return positive===negative?'unknown':positive?'yes':'no';
}

/** Adapters own bounded capture and native cancellation. Only an exact prepared ticket
 * reaches the caller's existing confirm once, after final ASR; this creates no new send path. */
export function createVoiceConfirmation<T extends object>(port:Port<T>){
 type Run={ticket:T;canceled:boolean;phase:'speaking'|'listening'|'confirming'};
 let active:Run|undefined;
 const used=new WeakSet<T>();
 const valid=(run:Run)=>active===run&&!run.canceled&&port.isCurrent(run.ticket);
 return {
  getSnapshot:():'speaking'|'listening'|'confirming'|'idle'=>active?.phase??'idle',
  async start(ticket:T,locale:VoiceConfirmationLocale):Promise<'confirmed'|'canceled'|'ignored'|'uncertain'|'speech_unavailable'>{
   if(active||used.has(ticket))return 'ignored';
   used.add(ticket);
   const run:Run={ticket,canceled:false,phase:'speaking'};active=run;
   try{
    if(!valid(run))return 'canceled';
    const speech=await port.speak(ticket);
    if(!valid(run))return 'canceled';
    // Playback failure is not a missing/negative answer. Keep the exact manual review open.
    if(speech!=='finished')return 'speech_unavailable';
    const at=port.now();if(!Number.isFinite(at))return 'canceled';
    run.phase='listening';
    const heard=await port.listen(),now=port.now();
    if(!valid(run)||!Number.isFinite(now)||now<at||now-at>8000||heard.kind!=='final'||classifyVoiceConfirmation(heard.text,locale)!=='yes')return 'canceled';
    // Consume synchronously before the asynchronous owner confirm: duplicate starts cannot submit twice.
    run.phase='confirming';run.canceled=true;
    await port.confirm(ticket);
    return 'confirmed';
   }catch{return run.phase==='confirming'?'uncertain':run.phase==='speaking'&&valid(run)?'speech_unavailable':'canceled';}
   finally{
    if(active===run){active=undefined;run.canceled=true;port.cancelAudio();}
   }
  },
  cancel(){const run=active;if(!run)return;run.canceled=true;active=undefined;port.cancelAudio();},
 };
}
