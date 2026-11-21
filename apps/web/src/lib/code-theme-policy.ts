/**
 * react-v1 themes are operator-installed code. They run in the Next.js server
 * only when explicitly enabled. In production that is off unless
 * OPENPRESS_CODE_THEMES=1, because a theme bundle can reach the host runtime
 * through React itself. Treat an enabled code theme as trusted admin code.
 */
export function codeThemesEnabled(env: NodeJS.ProcessEnv = process.env) {
  const flag = env.OPENPRESS_CODE_THEMES;
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return env.NODE_ENV !== 'production';
}

const DENIED = [
  /process\s*[.\[]/,
  /globalThis/,
  /child_process/,
  /node:(?:fs|http|https|net|child_process|vm)/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /constructor\s*\.\s*constructor/,
  /\bimport\s*\(/,
  /require\s*\(\s*['"](?!react(?:\/jsx-runtime)?['"])/,
];

export function themeSourceError(source: string) {
  for (const pattern of DENIED) {
    if (pattern.test(source)) return 'Theme bundle uses a blocked server API';
  }
  return null;
}
