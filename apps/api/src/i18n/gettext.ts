/** Gettext-style lookup. English and most locales use the two-form plural (one / other). */

const ONE_FORM = new Set(['ja', 'zh', 'ko', 'vi', 'th', 'id']);

export interface GettextEntry {
  locale: string;
  domain: string;
  context: string;
  msgid: string;
  msgidPlural: string;
  msgstr: string;
  msgstrPlural: string;
}

export function pluralIndex(locale: string, count: number) {
  const language = locale.toLowerCase().split('-')[0];
  if (ONE_FORM.has(language)) return 0;
  return count === 1 ? 0 : 1;
}

export function translate(
  entries: readonly GettextEntry[],
  query: { locale: string; msgid: string; domain?: string; context?: string; count?: number },
) {
  const domain = query.domain || 'openpress';
  const context = query.context || '';
  const locale = query.locale.toLowerCase();
  const entry =
    entries.find((row) => row.locale === locale && row.domain === domain && row.context === context && row.msgid === query.msgid) ??
    entries.find((row) => row.locale === locale.split('-')[0] && row.domain === domain && row.context === context && row.msgid === query.msgid);
  if (!entry) {
    if (query.count != null && query.count !== 1) return query.msgid;
    return query.msgid;
  }
  if (query.count == null) return entry.msgstr || query.msgid;
  return pluralIndex(locale, query.count) === 0 ? entry.msgstr || query.msgid : entry.msgstrPlural || entry.msgstr || query.msgid;
}
