import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#email').fill('admin@openpress.local');
  await page.locator('#password').fill('admin12345');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByText('Howdy, Admin')).toBeVisible();
}

async function headers(page: Page) {
  const csrf = await page.evaluate(() => sessionStorage.getItem('op_csrf'));
  return {
    'Content-Type': 'application/json',
    'X-OpenPress-Client': 'web',
    'X-OpenPress-CSRF': csrf ?? '',
  };
}

test('plugins and the Harbor child theme run through the admin and the public site', async ({ page }) => {
  await login(page);
  const csrf = await headers(page);

  const installed = await page.request.get(`${API}/api/plugins`, { headers: csrf });
  expect(installed.status()).toBe(200);
  const plugins = (await installed.json()) as { id: string; enabled: boolean; error?: string | null }[];
  for (const id of ['seo', 'contact-form', 'books']) {
    const row = plugins.find((plugin) => plugin.id === id);
    expect(row, `${id} is installed`).toBeTruthy();
    if (!row?.enabled) {
      const toggled = await page.request.patch(`${API}/api/plugins/${id}/toggle`, { headers: csrf });
      expect(toggled.status(), await toggled.text()).toBeLessThan(300);
    }
  }
  const reloaded = (await (await page.request.get(`${API}/api/plugins`, { headers: csrf })).json()) as {
    id: string;
    loaded: boolean;
    error?: string | null;
  }[];
  for (const id of ['seo', 'contact-form', 'books']) {
    const row = reloaded.find((plugin) => plugin.id === id);
    expect(row?.error ?? '', `${id} loaded`).toBeFalsy();
    expect(row?.loaded, id).toBe(true);
  }

  const sender = `Ada ${Date.now()}`;
  const submitted = await page.request.post(`${API}/api/plugins/contact-form/forms/contact`, {
    headers: csrf,
    data: { name: sender, email: 'ada@example.com', message: 'Hello from the harbor' },
  });
  expect(submitted.status()).toBeLessThan(300);

  await page.goto('/admin/plugin/contact-form/inbox');
  const frame = page.frameLocator('iframe[title="Inbox"]');
  const sandbox = await page.locator('iframe[title="Inbox"]').getAttribute('sandbox');
  expect(sandbox).toContain('allow-scripts');
  expect(sandbox).not.toContain('allow-same-origin');
  const cookie = await frame.locator('body').evaluate(() => {
    try {
      return document.cookie;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const message = error instanceof Error ? error.message : String(error);
      return `${name}: ${message}`;
    }
  });
  expect(cookie).not.toContain('op_access');
  expect(cookie).toMatch(/sandboxed|SecurityError|^$/i);
  const blocked = await frame.locator('body').evaluate(async () => {
    try {
      await fetch('/api/auth/me', { credentials: 'include' });
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  expect(blocked).toBe('blocked');
  await frame.getByRole('button', { name: 'Refresh entries' }).click();
  await expect(frame.getByText(`${sender} <ada@example.com>`)).toBeVisible();

  await page.goto('/admin/plugin/contact-form/entries');
  await expect(page.getByRole('cell', { name: sender })).toBeVisible();

  const book = await page.request.post(`${API}/api/plugins/books/content`, {
    headers: csrf,
    data: { title: 'The Harbor Atlas', postType: 'book' },
  });
  expect(book.status(), await book.text()).toBeLessThan(300);
  const bookRow = (await book.json()) as { id: string };
  await page.goto(`/admin/posts/${bookRow.id}`);
  await expect(page.getByText('ISBN')).toBeVisible();

  const counted = await page.request.post(`${API}/api/graphql`, {
    headers: csrf,
    data: { query: '{ bookCount { total } }' },
  });
  expect(counted.status()).toBeLessThan(300);
  const countBody = (await counted.json()) as { data?: { bookCount?: { total?: number } } };
  expect(countBody.data?.bookCount?.total).toBeGreaterThan(0);

  const themed = await page.request.put(`${API}/api/settings`, {
    headers: csrf,
    data: { activeTheme: 'harbor-child', themeMods: { tagline: 'From the child theme' } },
  });
  expect(themed.status(), await themed.text()).toBeLessThan(300);

  const note = await page.request.post(`${API}/api/content`, {
    headers: csrf,
    data: {
      title: 'Harbor note',
      type: 'POST',
      status: 'PUBLISHED',
      blocks: [{ id: 'note-1', type: 'seo/note', props: { text: 'First note' }, content: [], children: [] }],
    },
  });
  expect(note.status(), await note.text()).toBeLessThan(300);
  const noteRow = (await note.json()) as { id: string; slug: string };
  await page.goto(`/admin/posts/${noteRow.id}`);
  const editor = page.frameLocator('iframe[title="SEO note editor"]');
  await editor.getByLabel('SEO note text').fill('A custom note');
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await page.getByRole('button', { name: 'Lead' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('Updated.')).toBeVisible();

  const menu = await page.request.post(`${API}/api/menus`, { headers: csrf, data: { name: 'Harbor' } });
  expect(menu.status(), await menu.text()).toBeLessThan(300);
  const menuRow = (await menu.json()) as { id: string };
  const item = await page.request.post(`${API}/api/menus/${menuRow.id}/items`, {
    headers: csrf,
    data: { title: 'Atlas', url: `/${noteRow.slug}`, type: 'custom' },
  });
  expect(item.status()).toBeLessThan(300);
  const located = await page.request.put(`${API}/api/menus/locations`, {
    headers: csrf,
    data: { locations: { primary: menuRow.id } },
  });
  expect(located.status()).toBeLessThan(300);
  const widget = await page.request.post(`${API}/api/widgets`, {
    headers: csrf,
    data: { area: 'sidebar', type: 'text', title: 'Harbor tides', text: 'Calm water' },
  });
  expect(widget.status(), await widget.text()).toBeLessThan(300);

  await page.goto('/admin/posts/patterns');
  await expect(page.getByText('Intro')).toBeVisible();
  await page.goto('/admin/appearance/customize');
  await expect(page.getByText('Tagline')).toBeVisible();
  await page.goto('/admin/appearance/menus');
  await expect(page.getByText('Primary')).toBeVisible();
  await page.goto('/admin/appearance/widgets');
  await expect(page.getByRole('heading', { name: /Harbor tides/ }).first()).toBeVisible();

  await page.goto(`/${noteRow.slug}`);
  await expect(page.getByText('Child harbor')).toBeVisible();
  await expect(page.getByText('From the child theme')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Atlas' })).toBeVisible();
  await expect(page.locator('.harbor-widget', { hasText: 'Harbor tides' }).first()).toBeVisible();
  await expect(page.getByText('A custom note')).toBeVisible();
  await expect(page.locator('.is-style-harbor-lead')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('Child harbor')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest' })).toBeVisible();
});
