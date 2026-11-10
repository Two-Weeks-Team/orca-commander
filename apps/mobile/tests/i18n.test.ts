import assert from 'node:assert/strict';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import { formatMessage, formatCatalogMessage, createTranslator } from '../src/i18n/messages';
import { resolveLocale, resolveDeviceLocale } from '../src/i18n/locale';
import { createMockAgents } from '../src/core/mock';

let count = 0;
const same = (actual: unknown, expected: unknown) => { count++; assert.deepEqual(actual, expected); };
const refuses = (call: () => unknown) => { count++; assert.throws(call, /invalid_message_parameters/); };

// A missing/extra translation must not silently erase a command or change its parameter contract.
same(Object.keys(ko).sort(), Object.keys(en).sort());
const parameterContract = (catalog: Readonly<Record<string,string>>) => Object.fromEntries(Object.entries(catalog).map(([key,value]) => [key,Array.from(value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g),match=>match[1]).sort()]));
const englishContract=parameterContract(en);
same(parameterContract(ko),englishContract);
same(Object.values(englishContract).every(names=>new Set(names).size===names.length),true);

same(formatMessage('count.chars.one', { n: 1 }, 'en'), '1 char');
same(formatMessage('count.chars.other', { n: 12 }, 'ko'), '12자');
same(formatMessage('req.confirmWindow', { s: 9 }, 'ko'), '전송 확인 9s');
same(formatMessage('count.chars.other', { n: 7 }, 'unavailable'), '7 chars');

// Translated templates are data: missing, duplicate or extra placeholders fall back to English.
same(formatCatalogMessage('Send to {name}', 'To {name}', { name: 'sample <owner> {n}' }), 'To sample <owner> {n}');
same(formatCatalogMessage('Send to {name}', undefined, { name: 'sample' }), 'Send to sample');
same(formatCatalogMessage('Send to {name}', 'Wrong {other}', { name: 'sample' }), 'Send to sample');
same(formatCatalogMessage('Send to {name}', '{name} {name}', { name: 'sample' }), 'Send to sample');
same(formatCatalogMessage('Send to {name}', 'Missing', { name: 'sample' }), 'Send to sample');
same(formatCatalogMessage('Literal', 'Translated {extra}', {}), 'Literal');
same(formatCatalogMessage('Allow', '', {}), 'Allow');
same(formatCatalogMessage('Allow', '   ', {}), 'Allow');
refuses(() => formatCatalogMessage('Send to {name}', 'To {name}', {}));
refuses(() => formatCatalogMessage('Send to {name}', 'To {name}', { name: 'sample', extra: 'ignored?' }));
// Replacement is one pass: literal dollars/braces in owner text stay intact.
same(formatCatalogMessage('{value}', '{value}', { value: '$& {value}' }), '$& {value}');
const english = createTranslator('en');
const korean = createTranslator('ko');
same(english('count.chars.other', { n: 12 }), '12 chars');
same(korean('count.chars.other', { n: 12 }), '12자');
same(english('count.chars.one', { n: 1 }), '1 char');

// Auto uses the first supported phone language, rather than choosing a later built-in over a pack.
same(resolveLocale(['fr-FR', 'ko-KR', 'en-US'], []), 'ko');
same(resolveLocale(['ja-JP', 'ko-KR'], ['ja']), 'ja');
same(resolveLocale(['fr-FR'], []), 'en');
same(resolveLocale([], ['ja']), 'en');
same(resolveLocale(['EN_us'], []), 'en');
same(resolveLocale(['zh-Hant-TW', 'en-US'], ['zh-Hans']), 'en');
same(resolveLocale(['zh-TW'], ['zh-Hans', 'zh-Hant']), 'zh-Hant');
same(resolveLocale(['zh-CN'], ['zh-Hant', 'zh-Hans']), 'zh-Hans');
same(resolveLocale(['zh'], ['zh-Hant', 'zh-Hans']), 'en');
same(resolveLocale(['zh-Hant-HK'], ['zh-Hant']), 'zh-Hant');
same(resolveLocale(['not a locale', 'ko'], ['ja']), 'ko');
// Navigation commands are not installed or produced by this locale resolver.
same(resolveLocale(['ja-JP'], ['ja', 'ja']), 'ja');
same(resolveDeviceLocale([{ languageTag: 'zh', languageCode: 'zh', languageScriptCode: 'Hant', languageRegionCode: null }], ['zh-Hans', 'zh-Hant']), 'zh-Hant');
same(resolveDeviceLocale([{ languageTag: 'ko-KR', languageCode: null, languageScriptCode: null, languageRegionCode: null }], []), 'ko');
same(resolveDeviceLocale([{ languageTag: 'fr-FR', languageCode: 'fr', languageScriptCode: 'Latn', languageRegionCode: 'FR' }, { languageTag: 'ko-KR', languageCode: 'ko', languageScriptCode: null, languageRegionCode: 'KR' }], []), 'ko');
const englishDemo = createMockAgents(english);
const koreanDemo = createMockAgents(korean);
const demoIdentity = (agents: typeof englishDemo) => agents.map(({ id, target, state, eventType, requestId, permissionEvidence }) => ({ id, target, state, eventType, requestId, permissionEvidence }));
same(demoIdentity(englishDemo), demoIdentity(koreanDemo));
same(englishDemo.some(agent => agent.state === 'permission'), true);
same(englishDemo.find(agent => agent.state === 'permission')?.title !== koreanDemo.find(agent => agent.state === 'permission')?.title, true);
same(englishDemo.every(agent => agent.permissionEvidence !== 'structured_verified'), true);

if (false) {
  // @ts-expect-error Parameters come from the English source key.
  formatMessage('count.chars.other', { missing: 1 }, 'en');
  // @ts-expect-error Unknown catalog keys cannot enter app UI code.
  formatMessage('unknown.command', {}, 'en');
  // @ts-expect-error Translator consumers cannot omit required placeholders.
  english('count.chars.other');
  // @ts-expect-error Parameterless keys do not accept arbitrary values.
  korean('cmd.allow', { n: 1 });
}
console.log(`PASS: ${count} message catalog and locale assertions (pure; no OS locale or device proof)`);
