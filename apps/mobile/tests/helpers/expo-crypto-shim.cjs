'use strict';
// TEST ONLY. The vendored original e2ee.ts imports `expo-crypto` for secure randomness, which needs the React
// Native runtime. In Node tests this preload answers that one import with node:crypto; the application never
// loads this file (it bundles the real expo-crypto).
const Module = require('node:module');
const crypto = require('node:crypto');
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'expo-crypto') return { getRandomBytes: (length) => new Uint8Array(crypto.randomBytes(length)) };
  return load.call(this, request, ...rest);
};
