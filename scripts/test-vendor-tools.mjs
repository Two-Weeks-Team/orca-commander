import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { vendorFiles, verifyLock } from './lib/vendor-tools.mjs';

// Tests of the vendoring and verification tools against a throwaway git repository standing in for upstream.
// No network, no real upstream checkout, nothing outside the temp directory is touched.
const work = mkdtempSync(join(tmpdir(), 'deck-vendor-tools-'));
let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };
const throwsWith = (fn, pattern, message) => { checks++; assert.throws(fn, pattern, message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  const upstream = join(work, 'upstream');
  mkdirSync(upstream);
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: upstream, encoding: 'utf8' }).trim();
  const put = (path, text) => { mkdirSync(dirname(join(upstream, path)), { recursive: true }); writeFileSync(join(upstream, path), text); };
  git('init', '-q');
  put('mobile/src/a.ts', 'export const a = 1;\n');
  put('src/shared/b.ts', 'export const b = 2;\n');
  put('src/shared/c.ts', 'export const c = 3;\n');
  symlinkSync('a.ts', join(upstream, 'mobile/src/link.ts'));
  git('add', '-A');
  git('commit', '-q', '-m', 'upstream');
  const commit = git('rev-parse', 'HEAD');
  put('mobile/src/untracked.ts', 'export const u = 0;\n');

  /** A fresh Deck root: docs/<name>.json plus an (almost) empty vendor tree with only the license. */
  function deckRoot(name, files = [], head = commit) {
    const root = mkdtempSync(join(work, 'root-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    mkdirSync(join(root, 'vendor'), { recursive: true });
    writeFileSync(join(root, 'vendor/LICENSE'), 'MIT License\nCopyright (c) 2026 Lovecast Inc.\n');
    for (const [path, text] of files) {
      mkdirSync(dirname(join(root, 'vendor', path)), { recursive: true });
      writeFileSync(join(root, 'vendor', path), text);
    }
    writeFileSync(join(root, 'docs', name), JSON.stringify({ repository: 'x', commit: head, vendorRoot: 'vendor', files: files.map(([path, text]) => ({ path, sha256: sha(text) })) }, null, 2) + '\n');
    return root;
  }
  const manifestOf = (root, name) => JSON.parse(readFileSync(join(root, 'docs', name), 'utf8'));
  const vendor = (root, paths, extra = {}) => vendorFiles({ root, upstream, manifestName: 'lock.json', paths, ...extra });

  // Success: bytes are copied exactly, hashes recorded, a second run adds nothing.
  {
    const root = deckRoot('lock.json');
    const result = vendor(root, ['mobile/src/a.ts', 'src/shared/b.ts']);
    ok(result.added === 2 && result.total === 2 && result.commit === commit, 'two files are vendored');
    ok(readFileSync(join(root, 'vendor/mobile/src/a.ts'), 'utf8') === 'export const a = 1;\n', 'the bytes are copied exactly');
    ok(manifestOf(root, 'lock.json').files.every(f => f.sha256 === sha(readFileSync(join(root, 'vendor', f.path)))), 'the manifest records the hash of what was written');
    ok(vendor(root, ['mobile/src/a.ts', 'src/shared/b.ts']).added === 0, 'running it again adds nothing');
    ok(verifyLock(root, 'lock.json').count === 2, 'the result verifies');
  }

  // Refusals leave neither files nor manifest changes behind.
  const refuse = (paths, pattern, message, extra) => {
    const root = deckRoot('lock.json');
    const before = readFileSync(join(root, 'docs/lock.json'), 'utf8');
    throwsWith(() => vendor(root, paths, extra), pattern, message);
    ok(readFileSync(join(root, 'docs/lock.json'), 'utf8') === before, `${message}: the manifest is unchanged`);
    ok(!existsSync(join(root, 'vendor/mobile')) && !existsSync(join(root, 'vendor/src')), `${message}: nothing was written`);
  };
  for (const bad of ['../outside.ts', '/etc/hosts', 'mobile//src/a.ts', 'mobile/./src/a.ts', 'mobile\\src\\a.ts', '', 'mobile/src/../src/a.ts']) {
    refuse([bad], /unsafe path/, `path ${JSON.stringify(bad)}`);
  }
  refuse(['mobile/src/a.ts', 'mobile/src/a.ts'], /duplicate/, 'a duplicate path');
  refuse(['mobile/src/untracked.ts'], /not a regular tracked file/, 'an untracked file');
  refuse(['mobile/src/link.ts'], /not a regular tracked file/, 'a symlink');
  refuse(['mobile/src'], /not a regular tracked file/, 'a directory');
  refuse(['mobile/src/missing.ts'], /not a regular tracked file/, 'a path that does not exist');
  refuse(['mobile/src/a.ts', 'mobile/src/missing.ts'], /not a regular tracked file/, 'a bad path after a good one (nothing is half-vendored)');
  throwsWith(() => vendorFiles({ root: deckRoot('lock.json'), upstream, manifestName: '../lock.json', paths: ['mobile/src/a.ts'] }), /manifest name/, 'a manifest name with a directory');
  throwsWith(() => vendorFiles({ root: deckRoot('lock.json', [], 'f'.repeat(40)), upstream, manifestName: 'lock.json', paths: ['mobile/src/a.ts'] }), /pinned commit/, 'a checkout that is not the pinned commit');

  // A modified tracked file in the checkout is refused, and so is a file that already sits in the vendor tree unlisted.
  {
    put('src/shared/c.ts', 'export const c = 999;\n');
    const root = deckRoot('lock.json');
    throwsWith(() => vendor(root, ['src/shared/b.ts']), /unchanged/, 'a checkout with modified tracked files');
    git('checkout', '--', 'src/shared/c.ts');
  }
  {
    const root = deckRoot('lock.json', []);
    mkdirSync(join(root, 'vendor/mobile/src'), { recursive: true });
    writeFileSync(join(root, 'vendor/mobile/src/a.ts'), 'something else\n');
    throwsWith(() => vendor(root, ['mobile/src/a.ts']), /EEXIST|exists/, 'an unlisted file already in the vendor tree is not overwritten');
    ok(readFileSync(join(root, 'vendor/mobile/src/a.ts'), 'utf8') === 'something else\n', 'and it is left as it was');
    ok(manifestOf(root, 'lock.json').files.length === 0, 'and the manifest is unchanged');
  }

  // A failure halfway through the copy rolls back what this run wrote.
  {
    const root = deckRoot('lock.json', []);
    mkdirSync(join(root, 'vendor/src/shared'), { recursive: true });
    writeFileSync(join(root, 'vendor/src/shared/b.ts'), 'already here\n');
    const before = readFileSync(join(root, 'docs/lock.json'), 'utf8');
    throwsWith(() => vendor(root, ['mobile/src/a.ts', 'src/shared/b.ts']), /EEXIST|exists/, 'the second target already exists');
    ok(!existsSync(join(root, 'vendor/mobile/src/a.ts')), 'the file written before the failure is removed again');
    ok(readFileSync(join(root, 'docs/lock.json'), 'utf8') === before, 'and the manifest is unchanged');
  }

  // `git status` can be told to look away; the bytes must still equal the committed blob.
  {
    git('update-index', '--assume-unchanged', 'src/shared/c.ts');
    put('src/shared/c.ts', 'export const c = 4242;\n');
    ok(git('status', '--porcelain', '--untracked-files=no') === '', 'git status is fooled by assume-unchanged');
    const root = deckRoot('lock.json');
    throwsWith(() => vendor(root, ['src/shared/c.ts']), /differs from the pinned commit/, 'a file that differs from the committed blob although git status is clean');
    git('update-index', '--no-assume-unchanged', 'src/shared/c.ts');
    git('checkout', '--', 'src/shared/c.ts');
  }

  // verifyLock: tampering, unlisted files, a missing notice, and unsafe or duplicate manifest entries.
  {
    const files = [['mobile/src/a.ts', 'export const a = 1;\n']];
    const clean = deckRoot('lock.json', files);
    ok(verifyLock(clean, 'lock.json').count === 1, 'a clean tree verifies');

    const tampered = deckRoot('lock.json', files);
    writeFileSync(join(tampered, 'vendor/mobile/src/a.ts'), 'export const a = 2;\n');
    throwsWith(() => verifyLock(tampered, 'lock.json'), /changed/, 'a changed file is detected');

    const extra = deckRoot('lock.json', files);
    writeFileSync(join(extra, 'vendor/mobile/src/not-in-the-lock.ts'), 'export const sneaky = 1;\n');
    throwsWith(() => verifyLock(extra, 'lock.json'), /Unlisted file/, 'a file that is not in the lock is detected');

    const junk = deckRoot('lock.json', files);
    writeFileSync(join(junk, 'vendor/.DS_Store'), 'finder');
    ok(verifyLock(junk, 'lock.json').count === 1, 'a macOS .DS_Store is ignored');

    const noLicense = deckRoot('lock.json', files);
    rmSync(join(noLicense, 'vendor/LICENSE'));
    throwsWith(() => verifyLock(noLicense, 'lock.json'), /LICENSE|attribution/, 'a missing notice is detected');

    const duplicate = deckRoot('lock.json', files);
    const lock = manifestOf(duplicate, 'lock.json');
    lock.files.push({ ...lock.files[0] });
    writeFileSync(join(duplicate, 'docs/lock.json'), JSON.stringify(lock));
    throwsWith(() => verifyLock(duplicate, 'lock.json'), /duplicate/i, 'a duplicate manifest entry is detected');

    const traversal = deckRoot('lock.json', files);
    const outside = manifestOf(traversal, 'lock.json');
    outside.files.push({ path: '../docs/lock.json', sha256: sha(readFileSync(join(traversal, 'docs/lock.json'))) });
    writeFileSync(join(traversal, 'docs/lock.json'), JSON.stringify(outside));
    throwsWith(() => verifyLock(traversal, 'lock.json'), /unsafe path/, 'a manifest entry that leaves the vendor tree is refused');

    const badCommit = deckRoot('lock.json', files, 'not-a-sha');
    throwsWith(() => verifyLock(badCommit, 'lock.json'), /Invalid upstream pin/, 'a malformed pin is refused');
  }

  console.log(`PASS: ${checks} vendor tool assertions (temporary git repository; no network, no real upstream)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
