import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {setCleartext}=require('../plugins/with-android-cleartext-transport.js');
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
// Release Android must be able to open the paired host's ws:// endpoint (frames are end-to-end encrypted).
const manifest={manifest:{application:[{$:{'android:name':'.MainApplication','android:allowBackup':'false'}}]}};
const out=setCleartext(manifest);
same(out.manifest.application[0].$['android:usesCleartextTraffic'],'true');
same(out.manifest.application[0].$['android:allowBackup'],'false','other application attributes are preserved');
same(out.manifest.application[0].$['android:name'],'.MainApplication');
assert.throws(()=>setCleartext({manifest:{}}),/no <application>/);count++;
const app=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));
same(app.expo.plugins.includes('./plugins/with-android-cleartext-transport.js'),true,'plugin is registered for prebuild');
same(app.expo.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking,true,'iOS keeps its local-network-only exception');
console.log(`PASS: ${count} Android cleartext transport plugin assertions (manifest transform; no device)`);
