import { expect, test } from '@playwright/test';

test('home page renders the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Palletter');
  await expect(page.getByRole('heading', { level: 1, name: 'Palletter' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Describe your palette' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Palettes', exact: true })).toBeVisible();
});

test('the generator island hydrates', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.generator')).toHaveAttribute('data-hydrated', 'true');
});
