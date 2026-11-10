import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { verifyUpstreamProfile } from './upstream-profile.mjs';

const upstream=resolve(process.argv[2] ?? 'vendor/orca');
const profile=verifyUpstreamProfile(upstream);
assert.match(readFileSync(resolve(upstream,'LICENSE'),'utf8'), /Copyright \(c\) 2026 Lovecast Inc\./);
const root=fileURLToPath(new URL('../',import.meta.url));
const file=resolve(root,'scripts/current-requests.test.mts');
const requireMobile=createRequire(resolve(upstream,'mobile/package.json'));
const loader=requireMobile.resolve('tsx');
const scratch=mkdtempSync(resolve(tmpdir(),'orca-deck-current-requests-'));
const old=profile.id==='baseline';
const requests=`src/shared/${old?'agent-session/requests/':''}`;
const journal=`src/shared/${old?'agent-session/journal/':''}`;
const config=resolve(scratch,'tsconfig.json');
writeFileSync(config,JSON.stringify({compilerOptions:{
  target:'ES2024',module:'NodeNext',moduleResolution:'NodeNext',strict:true,
  noEmit:true,skipLibCheck:true,allowJs:true,types:['node'],
  typeRoots:[resolve(upstream,'node_modules/@types')],
  paths:{
    '@journal-types':[resolve(upstream,journal+'agent-session-journal-types.ts')],
    '@requests-wire':[resolve(upstream,requests+'agent-session-current-requests-wire.ts')],
  },
},files:[file]},null,2));

function run(command,args,options={}) {
  return spawnSync(command,args,{cwd:resolve(upstream,'mobile'),encoding:'utf8',
    env:{...process.env,ORCA_BACKGROUND_LAUNCH:'1'},...options});
}
const typed=run('pnpm',['exec','tsc','--noEmit','-p',config]);
process.stdout.write(typed.stdout ?? ''); process.stderr.write(typed.stderr ?? '');
assert.equal(typed.status,0,'new harness must pass strict TypeScript with original shared wire/journal types');
console.log(`PASS: harness strict typecheck (${profile.commit})`);

if(process.argv.includes('--negative-control')) {
  const handlerPath=resolve(upstream,'src/main/runtime/rpc/methods/structured-agent-session-current-requests.ts');
  const original=readFileSync(handlerPath,'utf8');
  const guard='if (!clientReadsCurrentRequests(ctx))';
  assert.ok(original.includes(guard),'negative control must target the actual pinned guard');
  // A disposable copy imports all unchanged dependencies from the original tree.
  // Never patch the checked-out original or alter permission configuration.
  const mutated=original.replace(guard,'if (false)').replace(/(from\s+['"])(\.[^'"]+)(['"])/g,(_all,prefix,spec,suffix)=>{
    const path=resolve(dirname(handlerPath),spec);
    const target=existsSync(path+'.ts')?path+'.ts':path;
    return prefix+pathToFileURL(target).href+suffix;
  });
  const copy=resolve(scratch,'handler-negative-control.mts');
  writeFileSync(copy,mutated);
  const red=run(process.execPath,['--test-reporter=tap','--import',loader,file,upstream,copy]);
  writeFileSync(resolve(scratch,'negative-control.log'),(red.stdout??'')+(red.stderr??''));
  assert.equal(red.status,1,'guard-removal negative control must fail the actual test run');
  assert.match(red.stdout,/not ok \d+ - actual handler refuses missing currentRequests capability before host read/);
  assert.match(red.stdout,/Missing expected rejection/);
  assert.match(red.stdout,/^# fail 1$/m,'only the guard-removal regression may fail');
  console.log('EXPECTED RED: deleting the pinned handler capability guard makes the missing-capability test fail');
  console.log(`Negative-control log: ${resolve(scratch,'negative-control.log')}`);
}

const green=run(process.execPath,['--test-reporter=tap','--import',loader,file,upstream]);
process.stdout.write(green.stdout??''); process.stderr.write(green.stderr??'');
assert.equal(green.status,0,'unchanged pinned handler and original state contracts must pass');
assert.match(green.stdout,/^# tests 12$/m,'empty or missing cases must not pass');
assert.match(green.stdout,/^# pass 12$/m);
assert.match(green.stdout,/actual currentRequests handler entries: 16;/);
verifyUpstreamProfile(upstream);
for(const path of [
  'src/main/runtime/rpc/methods/structured-agent-session-current-requests.ts',
  'src/main/runtime/rpc/methods/structured-agent-session-gate.ts',
  'src/main/native-chat/agent-session-wire/structured-agent-session-current-work.ts',
  'src/main/native-chat/agent-session-wire/agent-session-current-requests.ts',
  requests+'agent-session-current-requests.ts',
  requests+'agent-session-current-requests-reader.ts',
  requests+'agent-session-current-requests-capability.ts',
  `src/shared/${old?'agent-session/':''}structured-agent-session-reducer.ts`,
]) {
  console.log(`SOURCE sha256 ${createHash('sha256').update(readFileSync(resolve(upstream,path))).digest('hex')} ${path}`);
}
console.log('LIMIT: direct original handler/gate with synthetic host/journal; no dispatcher, real host store, coordinator/publisher integration, transport, pairing or live controls');
