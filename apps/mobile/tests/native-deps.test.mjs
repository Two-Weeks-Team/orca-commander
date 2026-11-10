import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Native modules must not drift. An unlocked ^4.24.0 resolved to react-native-screens 4.30.1, whose
// Fabric codegen spec fails under React Native 0.83.10, so `pod install` could not even finish.
const read = name => JSON.parse(readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8'));
const pkg = read('package.json');
let count = 0;
const check = (value, message) => { count++; assert.ok(value, message); };

// The vendored original transport (docs/upstream-installed-lock.json) needs exactly these crypto and random sources:
// the versions of the original Mobile 1.4.245 that ran on a physical iPhone.
const transportDeps = { tweetnacl: '1.0.3', '@noble/hashes': '1.8.0', 'expo-crypto': '55.0.19' };
for (const [name, version] of Object.entries(transportDeps)) {
  check(pkg.dependencies[name] === version, `${name} is pinned exactly to ${version} for the vendored transport`);
}

// The device token and the pinned host key are stored with the platform secure store (Keychain/Keystore).
check(pkg.dependencies['expo-secure-store'] === '55.0.18', 'expo-secure-store is pinned exactly: it holds the device token');
// The camera reads the pairing QR, which carries the device token.
check(pkg.dependencies['expo-camera'] === '55.0.23', 'expo-camera is pinned exactly: it reads the pairing QR');

// Versions of the original Orca Mobile 1.4.245 build that ran on a physical iPhone (SUPPORT.md).
const proven = { 'react-native-screens': '4.24.0', 'react-native-safe-area-context': '5.7.0' };
for (const [name, version] of Object.entries(proven)) {
  check(pkg.dependencies[name] === version, `${name} is pinned exactly to ${version}, not a range`);
}

const lockPath = new URL('../package-lock.json', import.meta.url);
check(existsSync(fileURLToPath(lockPath)), 'package-lock.json is committed so installs are reproducible');
const lock = read('package-lock.json');
for (const [name, version] of Object.entries(proven)) {
  check(lock.packages?.[`node_modules/${name}`]?.version === version, `the lockfile resolves ${name} to ${version}`);
}
check(lock.packages?.['node_modules/expo-secure-store']?.version === '55.0.18', 'the lockfile resolves expo-secure-store to 55.0.18');
check(lock.packages?.['node_modules/expo-camera']?.version === '55.0.23', 'the lockfile resolves expo-camera to 55.0.23');
for (const [name, version] of Object.entries(transportDeps)) {
  check(lock.packages?.[`node_modules/${name}`]?.version === version, `the lockfile resolves ${name} to ${version}`);
}
for (const name of ['expo', 'react-native', 'expo-router', 'react', 'react-dom']) {
  check(lock.packages?.[`node_modules/${name}`]?.version, `the lockfile resolves ${name}`);
}

// Expo CLI 55 reads tsconfig through the JavaScript compiler API (ts.sys). TypeScript 7 is the native port and has no
// such API, so `expo export:embed` (the Xcode "Bundle React Native code and images" phase) crashed with
// "Cannot read properties of undefined (reading 'getCurrentDirectory')" and Metro could not start.
const typescript = lock.packages?.['node_modules/typescript']?.version ?? '';
check(typescript.startsWith('5.'), `the lockfile resolves TypeScript 5.x for Expo CLI (found ${typescript || 'none'})`);
check(/^~?5\./.test(pkg.devDependencies.typescript), 'package.json asks for TypeScript 5.x');

check(pkg.dependencies['@orca/expo-two-way-audio'] === 'file:src/upstream/orca-1.4.245/mobile/packages/expo-two-way-audio', 'voice capture uses the pinned original PCM module');
console.log(`PASS: ${count} native dependency pin assertions`);
