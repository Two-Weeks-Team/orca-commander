import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const moduleUrl = new URL('../../../scripts/check-ui-messages.mjs', import.meta.url);
assert.ok(existsSync(moduleUrl), 'A real app-message guard is required before new copy is added');
const { inspectUiSource, checkUiMessages } = await import(moduleUrl.href);
let count = 0;
const same = (actual, expected) => { count++; assert.deepEqual(actual, expected); };
const file = 'apps/mobile/src/ui/sample.tsx';
same(inspectUiSource(file, 'const label = "English";').length, 0);
same(inspectUiSource(file, '// 한글 설명\nconst value = 1;').length, 0);
same(inspectUiSource(file, 'const label = "한국어";').length, 1);
same(inspectUiSource(file, 'const label = "\\uD55C\\uAE00";').length, 1);
same(inspectUiSource(file, 'const ui = <Text accessibilityLabel="상태">내용</Text>;').length, 2);
same(inspectUiSource(file, 'const ui = <Text>&#54620;&#44544;</Text>;').length, 1);
same(inspectUiSource(file, 'const label = `Hello ${name} 한국어`;').length, 1);
same(inspectUiSource('apps/mobile/src/i18n/ko.ts', 'export const ko = { label: "한국어" };').length, 0);
same(inspectUiSource('apps/mobile/src/ui/ko.ts', 'const label = "한국어";').length, 1);
same(inspectUiSource('apps/mobile/src/upstream/pinned.ts', 'const label = "한국어";').length, 0);
same(inspectUiSource('apps/mobile/app.json', '{"permission":"카메라"}').length, 1);

// An old hash supplied by a caller cannot exempt literals from the pure parser.
const legacy = 'const label = "기존 문구";';
const baseline = { [file]: createHash('sha256').update(legacy).digest('hex') };
same(inspectUiSource(file, legacy, baseline).length, 1);
same(inspectUiSource(file, legacy + '\nconst added = "새 문구";', baseline).length, 2);
same(inspectUiSource(file, legacy + '\nconst unrelated = 2;', baseline).length, 1);
same(inspectUiSource(file, 'const label = t("key");', baseline).length, 0);
same(inspectUiSource(file, 'const label = "한국어";', baseline)[0].code, 'ui_literal_outside_catalog');
same(inspectUiSource(file, 'const broken = <Text>;', baseline)[0].code, 'parse_error');
const fixture = mkdtempSync(join(tmpdir(), 'deck-message-guard-'));
try {
  mkdirSync(join(fixture, 'apps/mobile/src/i18n'), { recursive: true });
  mkdirSync(join(fixture, 'apps/mobile/app'), { recursive: true });
  writeFileSync(join(fixture, 'apps/mobile/src/i18n/legacy-literals.json'), '{}');
  writeFileSync(join(fixture, 'apps/mobile/app.json'), '{}');
  writeFileSync(join(fixture, 'apps/mobile/app/index.tsx'), 'export default () => <Text>한국어</Text>;');
  const checked = checkUiMessages(fixture);
  same(checked.findings.map(finding => finding.file), ['apps/mobile/app/index.tsx']);
  same(checked.legacyFiles, 0);
  const appPath = 'apps/mobile/app/index.tsx';
  const appSource = 'export default () => <Text>한국어</Text>;';
  const pinnedApp = { [appPath]: createHash('sha256').update(appSource).digest('hex') };
  writeFileSync(join(fixture, 'apps/mobile/src/i18n/legacy-literals.json'), JSON.stringify(pinnedApp));
  count++;
  assert.throws(() => checkUiMessages(fixture), { message: 'invalid_message_guard_baseline' },
    'A matching legacy hash must not exempt an app file from the real guard');
  // Nonempty baselines remain forbidden after the source has been migrated, too.
  writeFileSync(join(fixture, appPath), 'export default () => <Text>English</Text>;');
  count++;
  assert.throws(() => checkUiMessages(fixture), { message: 'invalid_message_guard_baseline' });
  for (const invalid of [null, [], 'baseline', { [appPath]: 'not-a-hash' }]) {
    writeFileSync(join(fixture, 'apps/mobile/src/i18n/legacy-literals.json'), JSON.stringify(invalid));
    count++;
    assert.throws(() => checkUiMessages(fixture), { message: 'invalid_message_guard_baseline' });
  }
  writeFileSync(join(fixture, 'apps/mobile/src/i18n/legacy-literals.json'), '{}');
  same(checkUiMessages(fixture).findings, []);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log(`PASS: ${count} UI-message guard assertions (real parser; no app/device execution)`);
