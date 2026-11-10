import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Vendoring and verification of the byte-for-byte upstream copies. Everything that decides what lands in the
// vendored tree lives here so it can be tested against a throwaway repository (scripts/test-vendor-tools.mjs).

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const SAFE_PATH = /^[A-Za-z0-9._@+-]+(\/[A-Za-z0-9._@+-]+)*$/;
const SAFE_MANIFEST_NAME = /^[A-Za-z0-9._-]+\.json$/;
const IGNORED_FILES = new Set(['.DS_Store']);

function assertSafePath(path) {
  if (typeof path !== 'string' || !SAFE_PATH.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error(`unsafe path: ${JSON.stringify(path)}`);
  }
}

function within(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function walk(directory, base = directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, base));
    else if (!IGNORED_FILES.has(entry.name)) found.push(relative(base, full).split('\\').join('/'));
  }
  return found;
}

/**
 * Copies original files from an upstream checkout into the vendored tree and records their SHA-256 in the pin
 * manifest. Refuses unless the checkout is exactly the pinned commit and tracked-clean, and unless every path is a
 * plain, safe, regular tracked file whose bytes equal the committed blob. Everything is validated before anything is
 * written; the copy is all-or-nothing, never overwrites a file, and the manifest is written last.
 */
export function vendorFiles({ root, upstream: upstreamArg, manifestName, paths }) {
  if (!SAFE_MANIFEST_NAME.test(manifestName ?? '')) throw new Error('manifest name must be a plain file name in docs/');
  const manifestPath = resolve(root, 'docs', manifestName);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const upstream = resolve(upstreamArg);
  const git = (...args) => execFileSync('git', args, { cwd: upstream, encoding: 'utf8' }).trim();
  const gitBytes = (...args) => execFileSync('git', args, { cwd: upstream, maxBuffer: 64 * 1024 * 1024 });
  if (git('rev-parse', 'HEAD') !== manifest.commit) throw new Error(`upstream HEAD is not the pinned commit ${manifest.commit}`);
  if (git('status', '--porcelain', '--untracked-files=no') !== '') throw new Error('upstream tracked source must remain unchanged');

  const vendorRoot = resolve(root, manifest.vendorRoot);
  const known = new Set(manifest.files.map(file => file.path));
  const seen = new Set();
  const plan = [];
  for (const path of paths) {
    assertSafePath(path);
    if (seen.has(path)) throw new Error(`duplicate path: ${path}`);
    seen.add(path);
    if (known.has(path)) continue;
    const source = resolve(upstream, path);
    const target = resolve(vendorRoot, path);
    if (!within(upstream, source) || !within(vendorRoot, target)) throw new Error(`unsafe path: ${JSON.stringify(path)}`);
    // `ls-tree` prints "<mode> <type> <sha>\t<path>": only regular blobs (100644/100755) of the pinned commit qualify.
    const entry = git('ls-tree', 'HEAD', '--', path);
    if (!/^100(644|755) blob [0-9a-f]{40}\t/.test(entry) || entry.split('\t')[1] !== path) {
      throw new Error(`not a regular tracked file at the pinned commit: ${path}`);
    }
    // One read: the bytes that are hashed are the bytes that are written, and they equal the committed blob.
    const bytes = readFileSync(source);
    if (!bytes.equals(gitBytes('show', `HEAD:${path}`))) throw new Error(`working tree differs from the pinned commit: ${path}`);
    plan.push({ path, target, bytes });
  }

  const written = [];
  try {
    for (const item of plan) {
      mkdirSync(dirname(item.target), { recursive: true });
      // 'wx': never overwrite a file that is already in the vendored tree, listed or not.
      writeFileSync(item.target, item.bytes, { flag: 'wx' });
      written.push(item.target);
    }
    manifest.files.push(...plan.map(item => ({ path: item.path, sha256: sha256(item.bytes) })));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch (error) {
    for (const file of written) rmSync(file, { force: true });
    throw error;
  }
  return { added: plan.length, total: manifest.files.length, commit: manifest.commit };
}

/** Checks one pin manifest: hashes of every listed file, no unlisted file in the tree, and the MIT notice. */
export function verifyLock(root, name) {
  const lock = JSON.parse(readFileSync(resolve(root, 'docs', name), 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(lock.commit) || !Array.isArray(lock.files) || !lock.files.length) throw new Error('Invalid upstream pin');
  const vendorRoot = resolve(root, lock.vendorRoot);
  const listed = new Set();
  for (const file of lock.files) {
    assertSafePath(file.path);
    if (listed.has(file.path)) throw new Error(`Duplicate manifest entry: ${file.path}`);
    listed.add(file.path);
    const full = resolve(vendorRoot, file.path);
    if (!within(vendorRoot, full)) throw new Error(`unsafe path: ${JSON.stringify(file.path)}`);
    if (!lstatSync(full).isFile()) throw new Error(`Vendored entry is not a regular file: ${file.path}`);
    if (sha256(readFileSync(full)) !== file.sha256) throw new Error(`Vendored source changed: ${file.path}`);
  }
  // The tree must contain exactly the listed files plus the notice: anything else could be bundled unhashed.
  for (const found of walk(vendorRoot)) {
    if (found !== 'LICENSE' && !listed.has(found)) throw new Error(`Unlisted file in the vendored tree: ${found}`);
  }
  const license = readFileSync(resolve(vendorRoot, 'LICENSE'), 'utf8');
  if (!license.includes('Copyright (c) 2026 Lovecast Inc.')) throw new Error('Missing upstream attribution');
  return { count: lock.files.length, commit: lock.commit };
}
