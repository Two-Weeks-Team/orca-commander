import assert from 'node:assert/strict';
import {resolveScreenMode,screenLocaleSignature} from '../src/ui/deck/screen-mode';
import {DEFAULT_PREFERENCES,parsePreferences,encodePreferences,resolvePreferenceLocale,isLanguagePreference} from '../src/i18n/preferences';
let count=0;
const same=(actual:unknown,want:unknown)=>{count++;assert.deepEqual(actual,want);};
const base={preference:'auto' as const,screenReader:false,fontScale:1,needsList:false};
same(resolveScreenMode(base).mode,'deck');
// Text size and reader availability never choose a different surface.
for(const fontScale of [1.01,1.1,1.100000023841858,1.3,2,3,0,NaN,Infinity]){
 same(resolveScreenMode({...base,fontScale}).mode,'deck');
 same(resolveScreenMode({...base,preference:'deck',fontScale}).mode,'deck');
}
same(resolveScreenMode({...base,screenReader:null}).reason,'auto-deck');
same(resolveScreenMode({...base,screenReader:true}).reason,'auto-deck');
same(resolveScreenMode({...base,needsList:true}).reason,'layout-needs-list');
same(resolveScreenMode({...base,preference:'list'}).reason,'manual-list');
// The reviewed Task 7 retains a manual choice, including a reader-on opt-in.
same(resolveScreenMode({...base,preference:'deck',screenReader:true}).reason,'manual-deck');
same(resolveScreenMode({...base,preference:'deck',screenReader:null}).mode,'deck');
same(resolveScreenMode({...base,preference:'deck',needsList:true}).reason,'layout-needs-list');
same(resolveScreenMode({...base,fontScale:1.3,screenReader:true}).reason,'auto-deck');
same(resolveScreenMode({...base,fontScale:1.3,needsList:true}).reason,'layout-needs-list');
same(Reflect.apply(resolveScreenMode,undefined,[{...base,preference:'invalid'}]).mode,'deck');
const saved={format:1 as const,screenMode:'auto' as const,language:'ko' as const,clicks:false};
same(parsePreferences(null,[]),{ok:true,value:DEFAULT_PREFERENCES,source:'defaults'});
same(parsePreferences(encodePreferences(saved,[]),[]),{ok:true,value:saved,source:'stored'});
for(const raw of ['', '[]','null','1','{}','{"format":2,"screenMode":"auto","language":"en","clicks":true}', '{"format":1,"screenMode":"auto","language":"en","clicks":"false"}', '{"format":1,"screenMode":"auto","language":"en","clicks":true,"extra":0}', '{"format":1,"screenMode":"Auto","language":"en","clicks":true}'])same(parsePreferences(raw,[]).ok,false);
same(parsePreferences(' '.repeat(513),[]),{ok:false,reason:'size'});
same(parsePreferences('"'+'😀'.repeat(128)+'"',[]),{ok:false,reason:'size'});
same(parsePreferences('{"format":1,"screenMode":"auto","language":"en","clicks":false,"clicks":true}',[]),{ok:false,reason:'schema'});
same(parsePreferences('{ "format": 1, "screenMode": "list", "language": "en", "clicks": true }',[]).ok,true);
same(parsePreferences(42,[]),{ok:false,reason:'type'});
same(isLanguagePreference('ja',['ja']),true);same(isLanguagePreference('ja',[]),false);
same(isLanguagePreference('zh-Hant',['zh-Hans']),false);same(isLanguagePreference('zh-Hant',['zh-Hant']),true);
same(isLanguagePreference('ja\u202E',['ja\u202E']),false);same(isLanguagePreference('en-US',[]),false);
same(isLanguagePreference('ja',['ja','ja']),false);
same(isLanguagePreference('ja',['ja','de','fr','es','it','pl','pt','nl','ru']),false);
const packRaw='{"format":1,"screenMode":"deck","language":"ja","clicks":true}';
same(parsePreferences(packRaw,['ja']).ok,true);same(parsePreferences(packRaw,[]),{ok:false,reason:'language'});
assert.throws(()=>encodePreferences({...saved,clicks:'yes'} as never,[]),/invalid_preferences/);count++;
assert.throws(()=>encodePreferences({...saved,extra:1} as never,[]),/invalid_preferences/);count++;
const phone=[{languageTag:'ja-JP',languageCode:'ja',languageScriptCode:null,languageRegionCode:'JP'},{languageTag:'ko-KR',languageCode:'ko',languageScriptCode:null,languageRegionCode:'KR'}];
same(resolvePreferenceLocale('auto',phone,['ja']),'ja');same(resolvePreferenceLocale('auto',phone,[]),'ko');same(resolvePreferenceLocale('en',phone,['ja']),'en');
const pack=parsePreferences(packRaw,['ja']);if(!pack.ok)throw new Error('fixture invalid');same(resolvePreferenceLocale(pack.value.language,phone,['ja']),'ja');same(resolvePreferenceLocale(pack.value.language,phone,[]),'en');
same(screenLocaleSignature({mode:'deck',locale:'en'}),screenLocaleSignature({mode:'deck',locale:'en'}));
same(screenLocaleSignature({mode:'deck',locale:'en'})===screenLocaleSignature({mode:'list',locale:'en'}),false);
same(screenLocaleSignature({mode:'deck',locale:'en'})===screenLocaleSignature({mode:'deck',locale:'ko'}),false);
console.log(`PASS: ${count} screen mode and preference assertions (pure; native text/layout measurement is separate)`);
