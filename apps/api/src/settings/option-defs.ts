export type OptionType = 'string' | 'number' | 'boolean' | 'json';

export interface OptionDefinition {
  key: string;
  group: string;
  type: OptionType;
  autoload: boolean;
  label: string;
  public: boolean;
  defaultValue: unknown;
  source: string;
}

export function validateOptionValue(def: OptionDefinition, value: unknown): string | null {
  if (def.type === 'string') {
    if (typeof value !== 'string') return `${def.key} must be a string`;
    if (def.key === 'siteTitle' && !value.trim()) return 'siteTitle must be a non-empty string';
    if (def.key === 'activeTheme' && !value.trim()) return 'activeTheme must be a non-empty string';
    if (value.length > 20_000) return `${def.key} is too long`;
    return null;
  }
  if (def.type === 'number') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return `${def.key} must be a number`;
    if (def.key === 'postsPerPage' && (!Number.isInteger(number) || number < 1 || number > 50)) {
      return 'postsPerPage must be between 1 and 50';
    }
    if (def.key === 'thumbnailSize' || def.key === 'mediumSize' || def.key === 'largeSize') {
      if (!Number.isInteger(number) || number < 1 || number > 4096) return `${def.key} is out of range`;
    }
    return null;
  }
  if (def.type === 'boolean') {
    if (typeof value !== 'boolean') return `${def.key} must be a boolean`;
    return null;
  }
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return null;
  if (typeof value === 'object') {
    const encoded = JSON.stringify(value);
    if (encoded.length > 100_000) return `${def.key} is too large`;
    return null;
  }
  return `${def.key} must be JSON`;
}

export function normalizeOptionValue(def: OptionDefinition, value: unknown) {
  if (def.type === 'number') return Number(value);
  return value;
}
