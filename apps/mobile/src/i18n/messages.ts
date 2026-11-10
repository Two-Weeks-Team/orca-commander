import { en, type MessageKey } from './en';
import { ko } from './ko';

export type { MessageKey } from './en';
type Placeholder<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholder<Rest> : never;
export type MessageParameters<K extends MessageKey> = Readonly<Record<Placeholder<(typeof en)[K]>, string | number>>;
export type PlainMessageKey = { [K in MessageKey]: keyof MessageParameters<K> extends never ? K : never }[MessageKey];
export type Translator = <K extends MessageKey>(key: K, ...args: keyof MessageParameters<K> extends never ? [] : [MessageParameters<K>]) => string;

const placeholderPattern = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const placeholders = (text: string): string[] => Array.from(text.matchAll(placeholderPattern), match => match[1]).sort();
const sameNames = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index]);

/** Format once, preserving parameter contents verbatim. Invalid translations use the English source. */
export function formatCatalogMessage(source: string, translation: unknown, parameters: Readonly<Record<string, string | number>>): string {
  const expected = placeholders(source);
  if (!sameNames(expected, Object.keys(parameters).sort())) throw new Error('invalid_message_parameters');
  const translatedNames = typeof translation === 'string' && translation.trim().length > 0 ? placeholders(translation) : null;
  const template = translatedNames !== null && sameNames(expected, translatedNames) ? translation as string : source;
  return template.replace(placeholderPattern, (_match, name: string) => String(parameters[name]));
}

export function formatMessage<K extends MessageKey>(key: K, parameters: MessageParameters<K>, locale: string): string {
  return formatCatalogMessage(en[key], locale === 'ko' ? ko[key] : en[key], parameters);
}

/** An immutable per-render locale dependency, also usable by pure presentation models. */
export function createTranslator(locale: string): Translator {
  return ((key: MessageKey, parameters: Readonly<Record<string, string | number>> = {}) =>
    formatCatalogMessage(en[key], locale === 'ko' ? ko[key] : en[key], parameters)) as Translator;
}
