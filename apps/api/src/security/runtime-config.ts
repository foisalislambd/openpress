const WEAK_SECRETS = new Set([
  '',
  'secret',
  'change-me',
  'change-me-too',
  'change-me-in-production',
  'change-me-too-in-production',
  'openpress-dev-secret',
]);

export function assertRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const jwt = env.JWT_SECRET ?? '';
  const refresh = env.JWT_REFRESH_SECRET ?? '';
  if (jwt.length < 32 || WEAK_SECRETS.has(jwt)) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters in production');
  }
  if (refresh.length < 32 || WEAK_SECRETS.has(refresh) || refresh === jwt) {
    throw new Error('JWT_REFRESH_SECRET must be a different secret of at least 32 characters in production');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  const origin = env.WEB_ORIGIN ?? '';
  if (!origin || origin === 'true' || origin === '*') {
    throw new Error('WEB_ORIGIN must be the public site origin in production');
  }
}

export function corsOrigin(env: NodeJS.ProcessEnv = process.env): boolean | string[] {
  const raw = env.WEB_ORIGIN?.trim();
  if (!raw) return env.NODE_ENV === 'production' ? [] : true;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}
