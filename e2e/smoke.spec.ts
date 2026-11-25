import { expect, test } from '@playwright/test';

test('home page renders the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Palletter');
  await expect(page.getByRole('heading', { level: 1, name: 'Palletter' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your colors' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suggestions', exact: true })).toBeVisible();
});

test('the generator island hydrates', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true');
});
