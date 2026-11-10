import {resolveDeviceLocale,type DeviceLocalePreference} from './locale';

export type ScreenModePreference='auto'|'deck'|'list';
export type InstalledLanguage=string&{readonly __installedLanguage:unique symbol};
export type LanguagePreference='auto'|'en'|'ko'|InstalledLanguage;
export interface AppPreferences {readonly format:1;readonly screenMode:ScreenModePreference;readonly language:LanguagePreference;readonly clicks:boolean}
export const DEFAULT_PREFERENCES:Readonly<AppPreferences>=Object.freeze({format:1,screenMode:'auto',language:'auto',clicks:true});
export const PREFERENCES_MAX_BYTES=512;
const localeTag=(value:unknown):value is string=>typeof value==='string'&&value.length<=35&&/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?(?:-[a-z0-9]{5,8})*$/.test(value);
const installed=(values:readonly string[])=>values.length<=8&&values.every(localeTag)&&new Set(values).size===values.length;
export function isLanguagePreference(value:unknown,installedLocales:readonly string[]):value is LanguagePreference {
 return value==='auto'||value==='en'||value==='ko'||localeTag(value)&&installed(installedLocales)&&installedLocales.includes(value);
}
const utf8Bytes=(value:string)=>{let bytes=0;for(const char of value){const cp=char.codePointAt(0)!;bytes+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;}return bytes;};
type PreferenceError='type'|'size'|'json'|'schema'|'language';
export type PreferenceParseResult={ok:true;value:Readonly<AppPreferences>;source:'defaults'|'stored'}|{ok:false;reason:PreferenceError};
function validate(value:unknown,installedLocales:readonly string[]):PreferenceError|null {
 if(value===null||typeof value!=='object'||Array.isArray(value))return 'schema';
 const data=value as Record<string,unknown>,keys=Object.keys(data);
 if(keys.length!==4||!keys.every(key=>['format','screenMode','language','clicks'].includes(key))||Object.getOwnPropertySymbols(data).length||data.format!==1||!['auto','deck','list'].includes(data.screenMode as string)||typeof data.clicks!=='boolean')return 'schema';
 return isLanguagePreference(data.language,installedLocales)?null:'language';
}
/** Bounded, strict local preference data only. This module performs no storage or device I/O. */
export function parsePreferences(raw:unknown,installedLocales:readonly string[]):PreferenceParseResult {
 if(raw===null)return {ok:true,value:DEFAULT_PREFERENCES,source:'defaults'};
 if(typeof raw!=='string')return {ok:false,reason:'type'};
 if(raw.length>PREFERENCES_MAX_BYTES||utf8Bytes(raw)>PREFERENCES_MAX_BYTES)return {ok:false,reason:'size'};
 let data:unknown;try{data=JSON.parse(raw);}catch{return {ok:false,reason:'json'};}
 const error=validate(data,installedLocales);if(error)return {ok:false,reason:error};
 // Valid values are scalar enum/boolean/number, so exactly four JSON key tokens must exist.
 // Reject duplicate keys rather than allowing JSON.parse's last-key-wins behavior.
 if(Array.from(raw.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)).length!==4)return {ok:false,reason:'schema'};
 const value=data as AppPreferences;
 return {ok:true,value:Object.freeze({format:1,screenMode:value.screenMode,language:value.language,clicks:value.clicks}),source:'stored'};
}
/** Recovery candidate only: the complete stored record must validate if its one missing locale were installed.
 * This does not install the locale or grant ordinary write authority. Only an explicit en/ko choice may replace it. */
export function missingLanguagePreferences(raw:unknown,installedLocales:readonly string[]):Readonly<AppPreferences>|null {
 const parsed=parsePreferences(raw,installedLocales);
 if(parsed.ok||parsed.reason!=='language'||typeof raw!=='string')return null;
 const language=(JSON.parse(raw) as Record<string,unknown>).language;
 if(!localeTag(language)||['auto','en','ko'].includes(language))return null;
 const checked=parsePreferences(raw,[language]);
 return checked.ok?checked.value:null;
}
export function encodePreferences(value:Readonly<AppPreferences>,installedLocales:readonly string[]):string {
 if(validate(value,installedLocales))throw new Error('invalid_preferences');
 const raw=JSON.stringify({format:1,screenMode:value.screenMode,language:value.language,clicks:value.clicks});
 if(utf8Bytes(raw)>PREFERENCES_MAX_BYTES)throw new Error('invalid_preferences');
 return raw;
}
/** UI language only. It never selects a host dictation model or navigation phrase pack. */
export function resolvePreferenceLocale(preference:LanguagePreference,phoneLocales:readonly DeviceLocalePreference[],installedLocales:readonly string[]):string {
 const packs=installed(installedLocales)?installedLocales:[];
 if(preference==='auto')return resolveDeviceLocale(phoneLocales,packs);
 return isLanguagePreference(preference,packs)?preference:'en';
}
