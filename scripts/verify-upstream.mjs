import { fileURLToPath } from 'node:url';
import { verifyLock } from './lib/vendor-tools.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['upstream-lock.json', 'upstream-installed-lock.json']) {
  const { count, commit } = verifyLock(root, name);
  console.log(`PASS: ${count} upstream source hashes, no unlisted vendored files, and MIT notice (${commit})`);
}
