import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('.generator')).toHaveAttribute('data-hydrated', 'true');
}

const hue = (page: Page, n = 1) => page.getByLabel(`Hue ${n}: color value or name`);
const section = (page: Page, name: string) => page.locator('summary', { hasText: name });
const create = (page: Page) => page.getByRole('button', { name: 'Create' });

test.describe('generator form', () => {
  test('shows that the agent is ready', async ({ page }) => {
    await open(page);
    await expect(page.locator('.agent-status')).toHaveText(/Ready/);
    await expect(page.getByLabel('Agent')).toHaveValue('custom');
  });

  test('creates a palette from only the hue', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'Created 1 palette.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monochromatic' })).toBeVisible();
    await expect(page.locator('.swatch')).toHaveCount(11);
    await expect(page.locator('pre code')).toContainText('--color-color-1-50: oklch(97% 0.012 260);');
  });

  test('sends every choice the form offers', async ({ page }) => {
    await open(page);
    await hue(page).fill('terracotta');
    await page.getByRole('button', { name: 'Add a hue' }).click();
    await expect(hue(page, 2)).toBeFocused();
    await hue(page, 2).fill('#336699');
    await page.getByLabel('Mood').fill('warm');

    await section(page, 'Token format').click();
    await page.getByLabel('Tailwind CSS v4').check();
    await section(page, 'Scale').click();
    await page.getByLabel('A number of steps').check();
    await page.getByLabel('Steps', { exact: true }).fill('3');
    await section(page, 'Color system').click();
    await page.getByLabel('hex', { exact: true }).check();
    await section(page, 'Roles').click();
    await page.getByRole('button', { name: 'Primary, secondary, tertiary' }).click();
    await section(page, 'Schemes').click();
    await page.getByLabel('Triadic').check();

    await expect(section(page, 'Scale')).toContainText('50, 500, 950');
    await expect(section(page, 'Roles')).toContainText('primary, secondary, tertiary');
    await expect(section(page, 'Schemes')).toContainText('Monochromatic, Triadic');

    const requestPromise = page.waitForRequest('/api/palettes');
    await create(page).click();
    const body = (await requestPromise).postDataJSON();
    expect(body).toMatchObject({
      hues: [{ name: 'terracotta' }, { value: '#336699' }],
      mood: 'warm',
      tokenFormat: 'tailwind',
      colorSystem: 'hex',
      scale: { kind: 'count', count: 3 },
      roles: [{ role: 'primary' }, { role: 'secondary' }, { role: 'tertiary' }],
      schemes: ['monochromatic', 'triadic'],
      agent: 'custom',
    });

    await expect(page.getByText('Created 2 palettes.')).toBeVisible();
    await expect(page.locator('pre code').first()).toContainText('@theme {');
    await expect(page.locator('pre code').first()).toContainText('--color-primary-color-50: #');
    await expect(page.getByText('primary', { exact: true }).first()).toBeVisible();
  });

  test('keeps the picker in step with the text', async ({ page }) => {
    await open(page);
    await hue(page).fill('rgb(255 0 0)');
    await expect(page.getByLabel('Hue 1 picker')).toHaveValue('#ff0000');
    await hue(page).fill('terracotta');
    await expect(page.getByLabel('Hue 1 picker')).toHaveClass(/named/);
  });

  test('shows errors next to the fields and opens their sections', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('Monochromatic').uncheck();
    await section(page, 'Schemes').click();
    await section(page, 'Token format').click();
    await page.getByLabel('Naming pattern').fill('color-[name]');
    await section(page, 'Token format').click();

    await create(page).click();
    await expect(page.getByText('Choose at least one scheme')).toBeVisible();
    await expect(page.getByText('Use a custom property name such as --color-[name]-[step]')).toBeVisible();
    await expect(page.getByLabel('Naming pattern')).toBeFocused();
    await expect(page.getByLabel('Naming pattern')).toHaveAttribute('aria-invalid', 'true');
  });

  test('can be used with only the keyboard', async ({ page }) => {
    await open(page);
    await hue(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Created 1 palette.')).toBeVisible();
  });

  test('can be cancelled', async ({ page }) => {
    await open(page);
    await page.getByLabel('Mood').fill('fake:slow');
    await create(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Cancelled.')).toBeVisible();
    await expect(create(page)).toBeVisible();
  });

  test('shows agent errors with details', async ({ page }) => {
    await open(page);
    await page.getByLabel('Mood').fill('fake:bad');
    await create(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('still had problems after one repair attempt');
    await alert.getByText('Details').click();
    await expect(alert.locator('pre')).toContainText('is missing steps 50');
  });

  test('copies the tokens', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await create(page).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(':root {');
  });

  test('copies one value by clicking its swatch', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await create(page).click();
    await page.getByRole('button', { name: /^color 1 500: oklch\(63% 0\.05 260\)\..*Copy value/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('oklch(63% 0.05 260)');
    await expect(page.locator('.swatch').nth(5)).toContainText('Copied');
  });

  test('shows contrast badges on swatches', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.locator('.swatch .badge').first()).toHaveText(/\d+\.\d (AAA|AA|AA large|low)/);
  });

  test('switches format and color system without asking the agent again', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette.')).toBeVisible();
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests++;
    });
    await page.getByLabel('Show tokens as').selectOption('tailwind');
    await page.getByLabel('in', { exact: true }).selectOption('hex');
    await expect(page.locator('pre code')).toContainText('@theme {');
    await expect(page.locator('pre code')).toContainText(/--color-color-1-500: #[0-9a-f]{6};/);
    await expect(page.locator('.swatch').nth(5)).toContainText(/#[0-9a-f]{6}/);
    expect(requests).toBe(0);
  });

  test('downloads the tokens', async ({ page }) => {
    await open(page);
    await create(page).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .css' }).click();
    expect((await download).suggestedFilename()).toBe('palette-monochromatic.css');
  });

  test('previews the palette in light and dark', async ({ page }) => {
    await open(page);
    await create(page).click();
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.getByRole('region', { name: 'Light preview' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dark preview' })).toBeVisible();
  });

  test('shows a contrast matrix, and the tabs work with arrow keys', async ({ page }) => {
    await open(page);
    await create(page).click();
    await page.getByRole('tab', { name: 'Tokens' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Contrast' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Contrast' })).toBeFocused();
    await expect(page.locator('td')).toHaveCount(121);
    await expect(page.locator('td').first()).toHaveAttribute('title', /color 1 50 on color 1 50: 1\.00:1, Fails/);
  });

  test('refines one palette with a note', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('Triadic').check();
    await create(page).click();
    await expect(page.getByText('Created 2 palettes.')).toBeVisible();

    const triadic = page.locator('article', { has: page.getByRole('heading', { name: 'Triadic' }) });
    await triadic.getByRole('button', { name: 'Refine…' }).click();
    await triadic.getByLabel('What should change?').fill('warmer please');
    await triadic.getByRole('button', { name: 'Refine', exact: true }).click();
    await expect(triadic.getByText('Refined: warmer please')).toBeVisible();
    await expect(page.locator('article', { has: page.getByRole('heading', { name: 'Monochromatic' }) })).toContainText('A fake palette.');
  });

  test('regenerates one palette', async ({ page }) => {
    await open(page);
    await create(page).click();
    await page.getByRole('button', { name: 'Regenerate' }).click();
    await expect(page.getByText('A different take.')).toBeVisible();
  });

  test('starts again when the refine session has closed', async ({ page }) => {
    await open(page);
    await page.getByLabel('Mood').fill('calm');
    await create(page).click();
    await expect(page.getByText('Created 1 palette.')).toBeVisible();

    await page.route('**/api/palettes/refine', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'session_expired', error: 'Closed.' }) }),
    );
    const retry = page.waitForRequest((r) => r.url().endsWith('/api/palettes') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Refine…' }).click();
    await page.getByLabel('What should change?').fill('brighter');
    await page.getByRole('button', { name: 'Refine', exact: true }).click();
    expect((await retry).postDataJSON()).toMatchObject({ schemes: ['monochromatic'], mood: 'calm', note: 'brighter' });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('ignores a refinement that finishes after a new generation started', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette.')).toBeVisible();

    // Hold the refinement's response until the new generation has finished.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/palettes/refine', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await held;
      await route.fulfill({ response, body }).catch(() => {});
    });
    await page.getByRole('button', { name: 'Regenerate' }).click();
    await create(page).click();
    await expect(page.getByText('Created 1 palette.')).toBeVisible();
    release();
    await page.waitForTimeout(300);
    await expect(page.getByText('A different take.')).toHaveCount(0);
    await expect(page.getByText('A fake palette.')).toBeVisible();
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
