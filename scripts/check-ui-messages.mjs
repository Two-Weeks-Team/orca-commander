import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '../apps/mobile/node_modules/typescript/lib/typescript.js';

const hangul = /\p{Script=Hangul}/u;
const normalize = name => name.replace(/\\/g, '/');

function jsxText(text) {
  return text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (original, value) => {
    const code = value[0].toLowerCase() === 'x' ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : original;
  });
}

export function inspectUiSource(fileName, text) {
  const file = normalize(fileName);
  if (file === 'apps/mobile/src/i18n/ko.ts' || file.startsWith('apps/mobile/src/upstream/')) return [];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  if (source.parseDiagnostics.length > 0) return [{ file, line: 1, code: 'parse_error' }];
  const findings = [];
  const visit = node => {
    const isText = ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node);
    if (isText && hangul.test(ts.isJsxText(node) ? jsxText(node.text) : node.text)) {
      findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, code: 'ui_literal_outside_catalog' });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function sources(root) {
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (normalize(relative(root, path)) !== 'apps/mobile/src/upstream') walk(path);
      } else if (['.ts', '.tsx'].includes(extname(path))) found.push(path);
    }
  };
  walk(resolve(root, 'apps/mobile/src'));
  walk(resolve(root, 'apps/mobile/app'));
  return [...found, resolve(root, 'apps/mobile/app.json')];
}

export function checkUiMessages(root) {
  const legacy = JSON.parse(readFileSync(resolve(root, 'apps/mobile/src/i18n/legacy-literals.json'), 'utf8'));
  if (!legacy || Array.isArray(legacy) || typeof legacy !== 'object' || Object.keys(legacy).length !== 0) {
    throw new Error('invalid_message_guard_baseline');
  }
  const files = sources(root);
  return { files: files.length, legacyFiles: 0, findings: files.flatMap(path => inspectUiSource(normalize(relative(root, path)), readFileSync(path, 'utf8'))) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkUiMessages(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (result.findings.length > 0) {
    for (const finding of result.findings) console.error(`${finding.file}:${finding.line}: ${finding.code}`);
    process.exitCode = 1;
  } else console.log(`PASS: UI-message guard (${result.files} app files; legacy baseline disabled)`);
}
