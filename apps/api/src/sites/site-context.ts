import { AsyncLocalStorage } from 'async_hooks';

/** The seeded site. Single-site installs never leave it. */
export const PRIMARY_SITE_ID = 'site_main';

const storage = new AsyncLocalStorage<string>();

export function currentSiteId() {
  return storage.getStore() ?? PRIMARY_SITE_ID;
}

export function runWithSite<T>(siteId: string, fn: () => T) {
  return storage.run(siteId, fn);
}
