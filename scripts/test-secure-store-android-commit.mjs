import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {transformSecureStore}=require('../apps/mobile/plugins/with-android-secure-store-commit.js');
const source=readFileSync(new URL('../apps/mobile/node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/SecureStoreModule.kt',import.meta.url),'utf8');
const fixed=transformSecureStore(source).match(/^      if \(!saveEncryptedItem\(encryptedItem[^\n]+\n[^\n]+\n      }/m)?.[0];
assert(fixed);
// The strict transform accepts either the original or its exact patched form. Extract the
// original invocation from that checked form so this also runs after native prebuild.
const original='      '+fixed.match(/if \(!(.+)\) \{/)?.[1];
assert(original.includes('saveEncryptedItem('));
const dir=mkdtempSync(join(tmpdir(),'deck-native-commit-'));
for(const [label,statement] of [['original',original],['fixed',fixed]]){
 const kotlin=`
class WriteException(message:String,key:String,service:String):Exception(message)
class Options(val requireAuthentication:Boolean=false,val keychainService:String="synthetic")
class Prefs(var success:Boolean){var cached=false;var disk=false}
fun saveEncryptedItem(item:String,prefs:Prefs,key:String,auth:Boolean,service:String):Boolean {prefs.cached=true;if(prefs.success)prefs.disk=true;return prefs.success}
fun publish(prefs:Prefs){val encryptedItem="synthetic";val key="synthetic";val keychainAwareKey="synthetic";val options=Options()
${statement}
}
fun main(){val failed=Prefs(false);var rejected=false;try{publish(failed)}catch(e:WriteException){rejected=true};check(failed.cached&&!failed.disk);check(rejected){"failed persistent commit was not rejected"};val good=Prefs(true);publish(good);check(good.cached&&good.disk);println("native commit failure rejected and success retained")}
`;
 const input=join(dir,`${label}.kt`),jar=join(dir,`${label}.jar`);writeFileSync(input,kotlin);
 const compile=spawnSync('kotlinc',[input,'-include-runtime','-d',jar],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
 const run=spawnSync('java',['-jar',jar],{encoding:'utf8'});writeFileSync(join(dir,`${label}.log`),run.stdout+run.stderr);
 if(label==='original'){assert.notEqual(run.status,0);assert.match(run.stderr,/failed persistent commit was not rejected/);}
 else assert.equal(run.status,0,run.stderr);
}
console.log('PASS: original native call fails the false-commit regression; patched native call rejects failure and preserves success.');
console.log('LIMIT: extracted Kotlin call with synthetic preferences, not full Android module or hardware disk failure.');
console.log(`Evidence: ${dir}`);
