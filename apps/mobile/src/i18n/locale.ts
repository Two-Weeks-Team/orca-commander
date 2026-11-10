interface ParsedLocale { language: string; script: string | null; region: string | null; tag: string }

function parseLocale(value: string): ParsedLocale | null {
  const parts = value.replace(/_/g, '-').split('-');
  if (!/^[A-Za-z]{2,3}$/.test(parts[0]) || parts.slice(1).some(part => !/^[A-Za-z0-9]{1,8}$/.test(part))) return null;
  const language = parts[0].toLowerCase();
  let script: string | null = null;
  let region: string | null = null;
  for (const part of parts.slice(1)) {
    if (part.length === 1) break; // Extensions do not change the UI language match.
    if (script === null && /^[A-Za-z]{4}$/.test(part)) script = part[0].toUpperCase() + part.slice(1).toLowerCase();
    else if (region === null && /^(?:[A-Za-z]{2}|[0-9]{3})$/.test(part)) region = part.toUpperCase();
  }
  if (language === 'zh' && script === null) {
    if (region !== null && ['TW', 'HK', 'MO'].includes(region)) script = 'Hant';
    else if (region !== null && ['CN', 'SG'].includes(region)) script = 'Hans';
  }
  return { language, script, region, tag: [language, script, region].filter(Boolean).join('-') };
}

/** First supported phone preference wins. No Intl.Locale/PluralRules or OS API is assumed here. */
export function resolveLocale(preferredLocales: readonly string[], installedPackLocales: readonly string[]): string {
  const packs = new Set(installedPackLocales.flatMap(value => {
    const parsed = parseLocale(value);
    return parsed ? [parsed.tag] : [];
  }));
  for (const value of preferredLocales) {
    const parsed = parseLocale(value);
    if (!parsed) continue;
    if (parsed.language === 'en' || parsed.language === 'ko') return parsed.language;
    // Unknown Chinese script is ambiguous; never silently substitute a Hans pack for Hant.
    if (parsed.language === 'zh' && parsed.script === null) continue;
    const candidates = [parsed.tag, [parsed.language, parsed.script].filter(Boolean).join('-')];
    if (parsed.language !== 'zh') candidates.push(parsed.language);
    for (const candidate of candidates) if (packs.has(candidate)) return candidate;
  }
  return 'en';
}

/** Minimal projection of the SDK 55 Locale contract; no currency or other device metadata is needed. */
export interface DeviceLocalePreference {
  languageTag: string;
  languageCode: string | null;
  languageScriptCode: string | null;
  languageRegionCode: string | null;
}

export function resolveDeviceLocale(locales: readonly DeviceLocalePreference[], installedPackLocales: readonly string[]): string {
  return resolveLocale(locales.map(locale => {
    const parsed = parseLocale(locale.languageTag);
    const language = locale.languageCode ?? parsed?.language;
    const script = locale.languageScriptCode ?? parsed?.script;
    const region = locale.languageRegionCode ?? parsed?.region;
    return [language, script, region].filter(Boolean).join('-');
  }), installedPackLocales);
}
