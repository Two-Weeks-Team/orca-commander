import {sha256} from '@noble/hashes/sha256';
import {en,type MessageKey} from './en';
import {formatCatalogMessage} from './messages';
import {isCriticalMessage,isCriticalReviewCurrent,type CriticalReview} from './critical-review';

export const MAX_PACK_BYTES=64*1024,MAX_LANGUAGE_PACKS=8,MAX_PACK_CODE_POINTS=120;
export interface LanguagePack {readonly format:1;readonly lang:string;readonly script:string;readonly name:string;readonly sourceVersion:string;readonly strings:Readonly<Partial<Record<MessageKey,string>>>}
export interface PackEntryIssue {key:string;reason:'unknown_key'|'invalid_text'|'placeholders'|'source_too_long'}
export type PackParseResult={ok:true;pack:LanguagePack;issues:readonly PackEntryIssue[]}|{ok:false;reason:'too_large'|'malformed'|'invalid_metadata'};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export const packCodePoints=(text:string):number=>Array.from(text).length;
/** Imported pack values only: reject invisible glyphs/separators and require visible letter/number text.
 * Placeholder contents, built-in catalogs and owner data never pass through this filter.
 * Emoji/symbol-only imported labels conservatively fall back to complete English.
 */
export function isSafePackText(value:unknown):value is string {
 if(typeof value!=='string'||!value.trim()||packCodePoints(value)>MAX_PACK_CODE_POINTS||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u034f\u115f\u1160\u3164\uffa0\u2800]/u.test(value)||/\p{Zs}/u.test(value.replace(/ /g,'')))return false;
 const visible=value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g,'');
 if(!/[\p{L}\p{N}]/u.test(visible))return false;
 return !/[<>`]|[*_]\S(?:.*?\S)?[*_]|\*\*|__|~~|^\s*#{1,6}\s|\[[^\]]*\]\s*[\[(]|&(?:#[xX]?[\da-fA-F]+|[A-Za-z]+);|\b(?:[a-z][a-z\d+.-]*:\/\/|mailto:|tel:|data:|javascript:)|\bwww\.|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|\b(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63}\b/imu.test(visible);
}
const placeholders=(text:string)=>Array.from(text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g),match=>match[1]).sort();
export function validPackPlaceholders(source:string,translation:string):boolean {
 const expected=placeholders(source),actual=placeholders(translation);
 if(new Set(expected).size!==expected.length||expected.length!==actual.length||!expected.every((key,index)=>key===actual[index]))return false;
 return !/[{}]/.test(translation.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g,''));
}
export function englishSourceVersion():string {
 const source=JSON.stringify(Object.keys(en).sort().map(key=>[key,en[key as MessageKey]]));
 return Array.from(sha256(new TextEncoder().encode(source)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function validLocale(lang:string,script:string):boolean {
 const match=/^([a-z]{2,3})(?:-([A-Z][a-z]{3}))?(?:-([A-Z]{2}|[0-9]{3}))?$/.exec(lang);
 return !!match&&!['en','ko'].includes(match[1])&&/^[A-Z][a-z]{3}$/.test(script)&&(!match[2]||match[2]===script)&&(match[1]!=='zh'||['Hans','Hant'].includes(script));
}
export function languagePackLocale(pack:Pick<LanguagePack,'lang'|'script'>):string {
 if(!validLocale(pack.lang,pack.script))throw new Error('invalid_pack_locale');
 const parts=pack.lang.split('-');
 return parts[0]==='zh'&&!parts.includes(pack.script)?[parts[0],pack.script,...parts.slice(1)].join('-'):pack.lang;
}
/** JSON input only. Unknown metadata, including imported reviewed flags, never enters the returned pack. */
export function parseLanguagePack(raw:string):PackParseResult {
 if(typeof raw!=='string')return{ok:false,reason:'malformed'};
 if(raw.length>MAX_PACK_BYTES||new TextEncoder().encode(raw).length>MAX_PACK_BYTES)return{ok:false,reason:'too_large'};
 let value:unknown;try{value=JSON.parse(raw);}catch{return{ok:false,reason:'malformed'};}
 if(!record(value)||value.format!==1||!record(value.strings))return{ok:false,reason:'malformed'};
 if(typeof value.lang!=='string'||typeof value.script!=='string'||!validLocale(value.lang,value.script)||!isSafePackText(value.name)||typeof value.sourceVersion!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceVersion))return{ok:false,reason:'invalid_metadata'};
 const strings:Partial<Record<MessageKey,string>>=Object.create(null),issues:PackEntryIssue[]=[];
 for(const [key,text] of Object.entries(value.strings)){
  if(!Object.hasOwn(en,key)){issues.push({key,reason:'unknown_key'});continue;}
  const known=key as MessageKey;
  if(packCodePoints(en[known])>MAX_PACK_CODE_POINTS){issues.push({key,reason:'source_too_long'});continue;}
  if(!isSafePackText(text)){issues.push({key,reason:'invalid_text'});continue;}
  if(!validPackPlaceholders(en[known],text)){issues.push({key,reason:'placeholders'});continue;}
  strings[known]=text;
 }
 const pack=Object.freeze({format:1 as const,lang:value.lang,script:value.script,name:value.name,sourceVersion:value.sourceVersion,strings:Object.freeze(strings)});
 return{ok:true,pack,issues:Object.freeze(issues)};
}
/** Explicit same-locale replacement consumes no ninth slot; existing packs are never silently evicted. */
export function installLanguagePack(existing:readonly LanguagePack[],pack:LanguagePack):{ok:true;packs:LanguagePack[]}|{ok:false;reason:'pack_limit'} {
 const locale=languagePackLocale(pack),index=existing.findIndex(item=>languagePackLocale(item)===locale);
 if(existing.length>MAX_LANGUAGE_PACKS||index<0&&existing.length>=MAX_LANGUAGE_PACKS)return{ok:false,reason:'pack_limit'};
 return{ok:true,packs:index<0?[...existing,pack]:existing.map((item,at)=>at===index?pack:item)};
}
/** English fallback is complete and never clipped, including sources beyond the imported-entry limit. */
export function resolvePackMessage(pack:LanguagePack,key:MessageKey,reviews:readonly CriticalReview[],parameters:Readonly<Record<string,string|number>>={}):string {
 const candidate=pack.strings[key],text=isSafePackText(candidate)&&packCodePoints(en[key])<=MAX_PACK_CODE_POINTS&&validPackPlaceholders(en[key],candidate)?candidate:undefined,reviewed=!isCriticalMessage(key)||reviews.some(review=>isCriticalReviewCurrent(pack,key,review));
 return formatCatalogMessage(en[key],reviewed?text:undefined,parameters);
}
