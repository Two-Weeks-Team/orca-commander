import { redactSummary } from '../src/core/redaction';

let count = 0;
function check(ok: unknown, why: string): asserts ok { count++; if (!ok) throw new Error(why); }
const normal = '실패 원인을 확인하고 변경 범위를 검토하세요.';
check(redactSummary(normal, 200).text === normal, 'ordinary Korean remains readable');
const contacts = redactSummary('담당: first@example.test, second@example.test', 200);
check(!contacts.text.includes('@') && contacts.redactions === 2, 'all email addresses are minimized');
for (const path of ['/Users/example/private/project.txt', '/home/example/.config/app', 'C:\\Users\\Example\\private.txt']) {
  const result = redactSummary(`오류 위치 ${path} 확인`, 200);
  check(!result.text.includes('example') && !result.text.includes('Example'), 'personal paths must not reveal usernames');
  check(result.redactions > 0, 'path removal must be disclosed');
}
// Omitting credential detection, or truncating before detection, must expose these synthetic fixtures and fail.
for (const text of [
  'token=fixture-value 다음 줄', 'PASSWORD: fixture-value', 'api_key: fixture-value',
  '{"accessToken":{"nested":["fixture-value"]}}', '{"to\\u006ben":"fixture-value"}',
  'to\u200bken: fixture-value', 'ｔｏｋｅｎ：fixture-value', '토큰: fixture-value',
  'Authorization: Bearer fixture-value', 'orca://pair?code=fixture-value',
  '-----BEGIN PRIVATE KEY-----\nfixture-value\n-----END PRIVATE KEY-----',
  'sk_test_fixture-value', '내용 token%3Dfixture-value', '`token` = fixture-value',
]) {
  const result = redactSummary(text, 200);
  check(!result.text.includes('fixture-value') && result.redactions > 0, 'credential-bearing text is omitted, including nested/obfuscated values');
}
check(!redactSummary('A'.repeat(128), 200).text.includes('A'), 'opaque long strings are not displayed as advice context');
const clean = redactSummary('줄\n바꿈\u202e 검사\u0000', 200);
check(!/[\p{Cc}\p{Cf}]/u.test(clean.text), 'control and bidi formatting cannot spoof a card');
check(redactSummary('가나다🙂마바사', 4).text === '가나다🙂', 'length limit counts code points without splitting emoji');
check(redactSummary('가나다🙂마바사', 4).truncated, 'truncation is disclosed');
check(redactSummary('앞 token=fixture-value', 2).redactions > 0, 'redaction precedes display truncation');
check(redactSummary('가', 0).text === '', 'zero-length display retains nothing');
const huge = redactSummary('x'.repeat(100_000) + 'fixture-value', 200);
check(huge.truncated && huge.redactions > 0 && !huge.text.includes('fixture-value'), 'oversized input fails closed with bounded work');
const started = performance.now();
redactSummary('token'.repeat(6000),200);
check(performance.now()-started < 250,'bounded credential-like text must not stall bounded request preparation on overlapping label patterns');
for (const limit of [-1, NaN, Infinity, 1.5, 5000]) {
  let message = '';
  try { redactSummary('fixture-value', limit); } catch (error) { message = error instanceof Error ? error.message : ''; }
  check(message.length > 0 && !message.includes('fixture-value'), 'invalid display bounds raise only a fixed safe error');
}
console.log(`PASS: ${count} redaction assertions (synthetic inputs; no network)`);
