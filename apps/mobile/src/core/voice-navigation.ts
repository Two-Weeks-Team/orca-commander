import {en} from '../i18n/en';
import {ko} from '../i18n/ko';
import {createTranslator} from '../i18n/messages';

/** No variant can represent an approval, rejection, send, arm or confirmation. Packs never supply commands. */
export type NavigationIntent=
 |{kind:'focus.step';direction:'prev'|'next'}
 |{kind:'focus.attention';direction:'next'}
 |{kind:'focus.select';key:string}
 |{kind:'ambiguous';reason:'duplicate'|'unknown'}
 |{kind:'dictation'};
const normalize=(text:string)=>text.normalize('NFC').trim().replace(/ +/g,' ').toLowerCase();
const controls=/[\p{Cc}\p{Cf}]/u;
export function classifyNavigation(text:string,locale:'en'|'ko'|'both',labels:readonly{key:string;label:string}[]):NavigationIntent {
 if(typeof text!=='string'||text.length>32768||controls.test(text))return{kind:'dictation'};
 const utterance=normalize(text),candidates=[utterance],hits:NavigationIntent[]=[];
 // Dictation may add one sentence-final period. Preserve literal labels and the original transcript.
 if(/[.。]$/.test(utterance)&&!/[.。]{2}$/.test(utterance))candidates.push(normalize(utterance.slice(0,-1)));
 const matches=(command:string)=>candidates.some(candidate=>candidate===normalize(command));
 let namesTarget=false;
 const locales=locale==='both'?['en','ko'] as const:locale==='en'||locale==='ko'?[locale]:[];
 for(const language of locales){
  // Built-ins only, independent of the app's selected/installed translation pack.
  const t=createTranslator(language);
  if(matches(t('nav.next')))hits.push({kind:'focus.step',direction:'next'});
  if(matches(t('nav.previous')))hits.push({kind:'focus.step',direction:'prev'});
  if(matches(t('nav.attention')))hits.push({kind:'focus.attention',direction:'next'});
  const [prefix,suffix]=(language==='ko'?ko:en)['nav.select'].split('{name}');
  namesTarget ||= candidates.some(candidate=>candidate.startsWith(normalize(prefix)+(prefix.endsWith(' ')?' ':''))&&candidate.endsWith((suffix.startsWith(' ')?' ':'')+normalize(suffix)));
  for(const entry of labels){
   if(!entry.key||!entry.label.trim()||controls.test(entry.label))continue;
   if(matches(t('nav.select',{name:entry.label})))hits.push({kind:'focus.select',key:entry.key});
  }
 }
 if(hits.length>1)return{kind:'ambiguous',reason:'duplicate'};
 return hits[0]??(namesTarget?{kind:'ambiguous',reason:'unknown'}:{kind:'dictation'});
}
