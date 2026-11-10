import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
for(const locale of ['ko','en'])for(let i=1;i<=17;i++){
 const result=spawnSync(process.execPath,[new URL('./deck-preview-parity.test.mjs',import.meta.url).pathname,String(i),locale],{encoding:'utf8'});
 assert.equal(result.status,0,`D30 approved-v3 difference ${i} (${locale})\n${result.stdout}${result.stderr}`);
}
console.log('PASS: D30 approved-v3 17 corrections in KO and EN; native viewport comparison remains required');
