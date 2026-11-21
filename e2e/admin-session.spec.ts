import { expect, request, test } from '@playwright/test';

const API = 'http://localhost:4000';

test('admin cookie session can publish, render, rotate, and log out', async ({ page }) => {
  const title = `Smoke ${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const anonymousLogin = await page.request.post(`${API}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json', 'X-OpenPress-Client': 'web' },
    data: { email: 'admin@openpress.local', password: 'admin12345' },
  });
  expect(anonymousLogin.status()).toBe(403);

  await page.goto('/admin/login');
  await page.locator('#email').fill('admin@openpress.local');
  await page.locator('#password').fill('admin12345');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByText('Howdy, Admin')).toBeVisible();

  const issued = (await page.context().cookies(API)).find((cookie) => cookie.name === 'op_refresh');
  expect(issued?.value).toBeTruthy();

  await page.goto('/admin/posts/new');
  await page.getByLabel('Add title').fill(title);
  await page.getByRole('banner').getByRole('button', { name: 'Publish' }).click();
  await page.waitForURL(/\/admin\/posts\/(?!new(?:\?|$))[^/?#]+/);
  await page.goto(`/${slug}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const rotated = await page.evaluate(async (api) => {
    const csrf = sessionStorage.getItem('op_csrf');
    const res = await fetch(`${api}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPress-Client': 'web',
        'X-OpenPress-CSRF': csrf ?? '',
      },
      body: '{}',
    });
    const data = (await res.json()) as { csrfToken?: string };
    if (data.csrfToken) sessionStorage.setItem('op_csrf', data.csrfToken);
    return res.status;
  }, API);
  expect(rotated).toBeLessThan(300);
  const csrf = await page.evaluate(() => sessionStorage.getItem('op_csrf'));
  expect(csrf).toBeTruthy();
  const current = (await page.context().cookies(API)).find((cookie) => cookie.name === 'op_refresh')?.value;
  expect(current).toBeTruthy();
  expect(current).not.toBe(issued?.value);

  const isolated = await request.newContext();
  const reused = await isolated.post(`${API}/api/auth/refresh`, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: `op_refresh=${issued?.value}; op_csrf=${csrf}`,
      'X-OpenPress-CSRF': csrf as string,
    },
    data: {},
  });
  expect(reused.status()).toBe(401);

  await page.goto('/admin');
  await page.getByText('Howdy, Admin').hover();
  await page.getByRole('menuitem', { name: 'Log Out' }).click();
  await page.waitForURL(/\/admin\/login/);

  const afterLogout = await page.request.get(`${API}/api/auth/me`);
  expect(afterLogout.status()).toBe(401);
  const revoked = await isolated.post(`${API}/api/auth/refresh`, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: `op_refresh=${current}; op_csrf=${csrf}`,
      'X-OpenPress-CSRF': csrf as string,
    },
    data: {},
  });
  expect(revoked.status()).toBe(401);
  await isolated.dispose();
});
