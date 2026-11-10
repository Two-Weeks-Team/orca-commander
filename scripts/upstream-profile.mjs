import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
export const compatibility = JSON.parse(readFileSync(resolve(docs, 'upstream-compatibility.json'), 'utf8'));

export function verifyUpstreamProfile(upstream) {
  const git = (...args) => execFileSync('git', args, { cwd: upstream, encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  const profiles = compatibility.profiles.map(profile => ({
    ...profile, ...JSON.parse(readFileSync(resolve(docs, profile.lock), 'utf8')),
  }));
  const profile = profiles.find(candidate => candidate.commit === commit);
  assert.ok(profile, 'upstream HEAD must match an explicit compatibility pin');
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'upstream tracked source must remain unchanged');
  assert.equal(JSON.parse(readFileSync(resolve(upstream, 'package.json'), 'utf8')).version, profile.desktopVersion);
  return profile;
}
