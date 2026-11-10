import { createTranslator } from '../i18n/messages';

// External-advisor minimization uses stable English markers; owner UI does not use this redactor.
const t = createTranslator('en');
const OMITTED = t('redaction.sensitive');
const MAX_INPUT_UNITS = 32_768;
// Conservative external-advisor input minimization, not a general DLP guarantee or permission to send text to a model.
// A credential marker omits the entire value-bearing input, including nested/escaped/multiline values.
const credential = /[A-Za-z0-9+/_=-]{64,}|(?:^|[\s"'`([{,])(?:[a-z_-]{0,64}(?:token|password|passwd|secret|key|authorization|credential|pairing[_-]?code)[a-z_-]{0,64}|토큰|암호|비밀번호|키)\s*["'`]?\s*[:=]|\bBearer\s+|orca:\/\/pair|-----BEGIN[^\n]*KEY-----|\b(?:sk[_-]|gh[pousr]_|github_pat_)|\\u[0-9a-f]{4}|%[0-9a-f]{2}/iu;

export function redactSummary(text: string, maxCodePoints: number): { text: string; redactions: number; truncated: boolean } {
  if (typeof text !== 'string') throw new TypeError('Invalid summary');
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 0 || maxCodePoints > 2_000) throw new RangeError('Invalid text limit');
  let redactions = 0;
  const oversized = text.length > MAX_INPUT_UNITS;
  const normalized = oversized ? OMITTED : text.normalize('NFKC')
    // Remove terminal formatting before checking credential labels, with input work already bounded above.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g,'')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g,'');
  let safe = normalized.replace(/[\p{Cc}\p{Cf}]/gu, char => [9,10,11,12,13,133].includes(char.charCodeAt(0)) ? ' ' : '').replace(/\s+/gu,' ');
  // Check both joined labels (to<zero-width>ken) and preserved boundaries (intro<format>token=...).
  if (oversized || credential.test(safe) || credential.test(normalized.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/gu,' '))) { safe = OMITTED; redactions++; }
  else {
    const replace = () => { redactions++; return t('redaction.omitted'); };
    safe = safe.replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]{1,254}@[\p{L}\p{N}.-]{1,253}\.[\p{L}]{2,63}/gu, replace)
      .replace(/(?:[A-Za-z]:\\Users\\[^\s"'<>]+|\/(?:Users|home)\/[^\s"'<>]+)/giu, replace);
  }
  const points = Array.from(safe);
  return {text:points.slice(0,maxCodePoints).join(''),redactions,truncated:oversized || points.length > maxCodePoints};
}
