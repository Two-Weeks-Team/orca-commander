import { fileURLToPath } from 'node:url';
import { vendorFiles } from './lib/vendor-tools.mjs';

// Copies original files byte for byte from an upstream checkout into the vendored tree and records their
// SHA-256 in the pin manifest. Refuses unless the checkout is exactly the pinned commit and tracked-clean.
// Usage: node scripts/vendor-upstream-files.mjs <upstream-checkout> <manifest-name> <path> [<path>...]
const [upstream, manifestName, ...paths] = process.argv.slice(2);
if (!upstream || !manifestName || paths.length === 0) {
  throw new Error('Usage: vendor-upstream-files.mjs <upstream-checkout> <manifest-name> <path>...');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const { added, total, commit } = vendorFiles({ root, upstream, manifestName, paths });
console.log(`vendored ${added} new file(s); manifest now lists ${total} (${commit})`);
