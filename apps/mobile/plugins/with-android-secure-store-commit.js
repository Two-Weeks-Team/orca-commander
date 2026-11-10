'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const ORIGINAL_SHA256 = 'e462a084510cc5f9704e18a1509877defa60b9dece10e6658b3a696dc079543a';
const CALL = '      saveEncryptedItem(encryptedItem, prefs, keychainAwareKey, options.requireAuthentication, options.keychainService)';
const CHECKED = `      if (!saveEncryptedItem(encryptedItem, prefs, keychainAwareKey, options.requireAuthentication, options.keychainService)) {
        throw WriteException("Could not persist SecureStore value", key, options.keychainService)
      }`;
const NAME = '    Name("ExpoSecureStore")';
const MARKED = NAME + '\n    Constant("deckPersistentCommitV1") { true }';
const sha = value => createHash('sha256').update(value).digest('hex');

/** Patch exactly the pinned native implementation; changed dependencies fail the build. */
function transformSecureStore(source) {
  const original = source.replace(CHECKED, CALL).replace(MARKED, NAME);
  if (sha(original) !== ORIGINAL_SHA256) throw new Error('Deck SecureStore native source changed; verify persistence before building.');
  return original.replace(CALL, CHECKED).replace(NAME, MARKED);
}

function withAndroidSecureStoreCommit(config) {
  const { withDangerousMod } = require('expo/config-plugins');
  return withDangerousMod(config, ['android', mod => {
    const appPackage = JSON.parse(readFileSync(join(mod.modRequest.projectRoot, 'package.json'), 'utf8'));
    if (!appPackage.expo?.autolinking?.android?.buildFromSource?.includes('expo-secure-store')) {
      throw new Error('Deck SecureStore must build from source; the precompiled AAR lacks the commit guard.');
    }
    const pkg = require.resolve('expo-secure-store/package.json', { paths: [mod.modRequest.projectRoot] });
    if (JSON.parse(readFileSync(pkg, 'utf8')).version !== '55.0.18') throw new Error('Deck SecureStore native version changed.');
    const target = join(dirname(pkg), 'android/src/main/java/expo/modules/securestore/SecureStoreModule.kt');
    const source = readFileSync(target, 'utf8');
    const patched = transformSecureStore(source);
    if (patched !== source) writeFileSync(target, patched);
    return mod;
  }]);
}

module.exports = withAndroidSecureStoreCommit;
module.exports.transformSecureStore = transformSecureStore;
