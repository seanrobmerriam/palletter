import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true');
}

const hue = (page: Page, n = 1) => page.getByLabel(`Hue ${n}: color value or name`);
/** Open Advanced options, then one of its sections, e.g. "Token format". */
async function advanced(page: Page, name: string) {
  const trigger = page.getByRole('button', { name: /^Advanced options/ });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
/** Choose an option in an SV5UI Select. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const suggest = (page: Page) => page.getByRole('button', { name: 'Suggest colors' });
const status = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });

/** Suggest colors and keep the first direction's background, so a palette is built. */
async function suggestAndKeep(page: Page) {
  await open(page);
  await suggest(page).click();
  await expect(status(page, '2 directions from Fake Large.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Keep sand 1' }).click();
  await expect(page.getByRole('heading', { name: 'Scales and tokens' })).toBeVisible();
}

test.describe('suggestions', () => {
  test('suggests directions of new colors that go with yours', async ({ page }) => {
    await open(page);
    const request = page.waitForRequest('/api/suggest');
    await suggest(page).click();
    expect((await request).postDataJSON()).toEqual({ hues: [{ value: '#2563eb' }], directions: 2, agent: 'custom' });

    await expect(status(page, '2 directions from Fake Large. Keep the colors you like.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direction 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direction 2' })).toBeVisible();
    const first = page.locator('article', { has: page.getByRole('heading', { name: 'Direction 1' }) });
    await expect(first.getByRole('group', { name: /Your colors/ })).toContainText('your color 1 (primary)');
    await expect(first.getByRole('list', { name: 'Suggested colors' }).getByRole('listitem')).toHaveCount(3);
    await expect(first).toContainText('A quiet background.');
    // Nothing is kept yet, so there's no palette.
    await expect(page.getByText('Keep the suggestions you like, from any direction')).toBeVisible();
  });

  test('builds the palette from your colors and the ones you keep, without asking the agent', async ({ page }) => {
    await open(page);
    await suggest(page).click();
    await expect(status(page, '2 directions')).toBeVisible();
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests++;
    });
    await page.getByRole('checkbox', { name: 'Keep sand 1' }).click();
    await page.getByRole('checkbox', { name: 'Keep accent 2' }).click();
    const palette = page.locator('article', { has: page.getByRole('heading', { name: 'Scales and tokens' }) });
    await expect(palette).toContainText('Your color, with 2 suggestions from "Direction 1" and "Direction 2".');
    await expect(palette.getByRole('region', { name: 'your color 1' })).toBeVisible();
    await expect(palette.getByRole('region', { name: 'sand 1' })).toBeVisible();
    await expect(palette.getByRole('region', { name: 'accent 2' })).toBeVisible();
    await expect(palette.locator('pre code')).toContainText('--color-accent-2-500');
    // Your exact color is in the palette, unchanged.
    await expect(palette.locator('pre code')).toContainText(/--color-your-color-1-\d+: oklch\(54\.\d% 0\.2\d* 26\d\.\d\);/);

    // Unkeeping removes it.
    await page.getByRole('checkbox', { name: 'Keep accent 2' }).click();
    await expect(palette.getByRole('region', { name: 'accent 2' })).toHaveCount(0);
    expect(requests).toBe(0);
  });

  test('keeps a whole direction at once', async ({ page }) => {
    await open(page);
    await suggest(page).click();
    const second = page.locator('article', { has: page.getByRole('heading', { name: 'Direction 2' }) });
    await second.getByRole('button', { name: 'Keep all' }).click();
    for (const name of ['sand 2', 'ink 2', 'accent 2']) await expect(page.getByRole('checkbox', { name: `Keep ${name}` })).toBeChecked();
    await expect(second.getByRole('button', { name: 'All kept' })).toBeDisabled();
  });

  test('suggests more like one color, right after it', async ({ page }) => {
    await open(page);
    await suggest(page).click();
    await page.getByRole('button', { name: 'More like accent 1' }).click();
    const first = page.locator('article', { has: page.getByRole('heading', { name: 'Direction 1' }) });
    const items = first.getByRole('list', { name: 'Suggested colors' }).getByRole('listitem');
    await expect(items).toHaveCount(6);
    await expect(items.nth(3)).toContainText('accent 1 1');
    await expect(items.nth(3)).toContainText('Like accent 1.');
    await page.getByRole('checkbox', { name: 'Keep accent 1 2' }).click();
    await expect(page.locator('pre code')).toContainText('--color-accent-1-2-500');
  });

  test('suggests more directions in the same session', async ({ page }) => {
    await open(page);
    await suggest(page).click();
    await expect(status(page, '2 directions')).toBeVisible();
    const more = page.waitForRequest('/api/suggest/more');
    await page.getByRole('button', { name: 'More directions' }).click();
    expect((await more).postDataJSON()).toMatchObject({ kind: 'directions', count: 2 });
    await expect(status(page, 'Added 2 more directions.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direction 4' })).toBeVisible();
  });

  test('starts a new session for more directions when the old one has closed', async ({ page }) => {
    await open(page);
    await page.getByLabel("What's it for?").fill('a bakery');
    await suggest(page).click();
    await expect(status(page, '2 directions')).toBeVisible();
    await page.route('**/api/suggest/more', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'session_expired', error: 'Closed.' }) }),
    );
    const retry = page.waitForRequest((r) => r.url().endsWith('/api/suggest') && r.method() === 'POST');
    await page.getByRole('button', { name: 'More directions' }).click();
    expect((await retry).postDataJSON()).toMatchObject({ purpose: 'a bakery', directions: 2 });
    await expect(page.getByRole('heading', { name: 'Direction 1' })).toHaveCount(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('asks for the number of directions set in Advanced options', async ({ page }) => {
    await open(page);
    await advanced(page, 'Directions');
    await page.getByLabel('Directions at a time').fill('3');
    await suggest(page).click();
    await expect(status(page, '3 directions')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direction 3' })).toBeVisible();
  });

  test('sends hints from Advanced options', async ({ page }) => {
    await open(page);
    await hue(page).fill('terracotta');
    await page.getByLabel("What's it for?").fill('warm and welcoming');
    await advanced(page, 'Saturation');
    await choose(page, 'Saturation', 'Muted: calm and sophisticated');
    await advanced(page, 'Roles');
    await page.getByRole('button', { name: 'Add a role' }).click();
    await page.getByLabel('Role 1', { exact: true }).fill('background');
    await advanced(page, 'Relationships');
    await page.getByLabel('Analogous').check();
    await expect(page.getByRole('button', { name: /^Relationships/ })).toContainText('Analogous');

    const request = page.waitForRequest('/api/suggest');
    await suggest(page).click();
    expect((await request).postDataJSON()).toEqual({
      hues: [{ name: 'terracotta' }],
      directions: 2,
      purpose: 'warm and welcoming',
      saturation: 'muted',
      roles: [{ role: 'background' }],
      schemes: ['analogous'],
      agent: 'custom',
    });
  });

  test('picks a model from the ones the agent offers', async ({ page }) => {
    await open(page);
    await expect(page.getByLabel('Model', { exact: true })).toContainText('Default (recommended)');

    // The default isn't sent, so the agent keeps its own default.
    let request = page.waitForRequest('/api/suggest');
    await suggest(page).click();
    expect((await request).postDataJSON()).not.toHaveProperty('model');
    await expect(status(page, '2 directions from Fake Large.')).toBeVisible();

    await page.getByLabel('Model', { exact: true }).click();
    // Each option's name includes its description, e.g. "Fake Small Quick".
    await page.getByRole('option', { name: /^Fake Small/ }).click();
    request = page.waitForRequest('/api/suggest');
    await suggest(page).click();
    expect((await request).postDataJSON()).toMatchObject({ model: 'fake-small' });
    await expect(status(page, '2 directions from Fake Small.')).toBeVisible();
    await expect(page.getByText('A fake direction from fake-small.').first()).toBeVisible();
  });

  test('can be cancelled', async ({ page }) => {
    await open(page);
    await page.getByLabel("What's it for?").fill('fake:slow');
    await suggest(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Cancelled.')).toBeVisible();
    await expect(suggest(page)).toBeVisible();
  });

  test('shows agent errors with details', async ({ page }) => {
    await open(page);
    await page.getByLabel("What's it for?").fill('fake:bad');
    await suggest(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('still had problems after one repair attempt');
    await alert.getByText('Details').click();
    await expect(alert.locator('pre')).toContainText('yours');
  });
});

test.describe('form', () => {
  test('shows that the agent is ready', async ({ page }) => {
    await open(page);
    await expect(page.locator('.agent-status')).toHaveText(/Ready/);
    await expect(page.getByLabel('Agent')).toContainText('Custom (bun)');
  });

  test('lets you click the color picker', async ({ page }) => {
    await open(page);
    const picker = page.getByLabel('Hue 1 picker');
    const box = (await picker.boundingBox())!;
    // The picker sits inside the input's leading slot; make sure nothing covers it.
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'), {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    expect(hit).toBe('Hue 1 picker');
  });

  test('copies a color chosen with the picker into the text', async ({ page }) => {
    await open(page);
    await page.getByLabel('Hue 1 picker').fill('#ff0000');
    await expect(hue(page)).toHaveValue('#ff0000');
    await page.getByLabel('Hue 1 picker').fill('#00ff00');
    await expect(hue(page)).toHaveValue('#00ff00');
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
    await advanced(page, 'Token format');
    await page.getByLabel('Naming pattern', { exact: true }).fill('color-[name]');
    // Close Advanced options; the error opens it again.
    await page.getByRole('button', { name: /^Advanced options/ }).click();

    await suggest(page).click();
    await expect(page.getByText('Use a custom property name such as --color-[name]-[step]')).toBeVisible();
    await expect(page.getByLabel('Naming pattern', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Naming pattern', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });

  test('can be used with only the keyboard', async ({ page }) => {
    await open(page);
    await hue(page).focus();
    await page.keyboard.press('Enter');
    await expect(status(page, '2 directions')).toBeVisible();
    const keep = page.getByRole('checkbox', { name: 'Keep sand 1' });
    await keep.focus();
    await page.keyboard.press('Space');
    await expect(keep).toBeChecked();
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await suggestAndKeep(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('palette', () => {
  test('compares the balanced palette with the one before balancing', async ({ page }) => {
    await suggestAndKeep(page);
    await expect(page.getByText(/^Balanced\./)).toBeVisible();
    const swatch = page.locator('.swatch').nth(3); // your color 1, step 300
    const background = () => swatch.evaluate((el) => (el as HTMLElement).style.background);
    const balanced = await background();
    await page.getByRole('button', { name: 'Show before balancing' }).click();
    await expect(page.getByText('Showing the palette before Palletter balanced it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show balanced' })).toHaveAttribute('aria-pressed', 'true');
    expect(await background()).not.toBe(balanced);
  });

  test('can turn balancing off', async ({ page }) => {
    await open(page);
    await advanced(page, 'Saturation');
    await page.getByRole('switch', { name: 'Balance the palette' }).click();
    await expect(page.getByRole('button', { name: /^Saturation/ })).toContainText('not balanced');
    await suggest(page).click();
    await page.getByRole('checkbox', { name: 'Keep sand 1' }).click();
    await expect(page.getByRole('heading', { name: 'Scales and tokens' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show before balancing' })).toHaveCount(0);
  });

  test('copies the tokens', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await suggestAndKeep(page);
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(':root {');
  });

  test('copies one value from its swatch', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await suggestAndKeep(page);
    await page.getByRole('button', { name: 'Copy sand 1 500 value' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^oklch\(/);
    await expect(page.getByRole('button', { name: 'Copied sand 1 500' })).toBeVisible();
  });

  test('shows only the step on each swatch, with details in a popover', async ({ page }) => {
    await suggestAndKeep(page);
    await expect(page.locator('.swatch').nth(5)).toHaveText('500');
    await page.getByRole('button', { name: 'Details for sand 1 500' }).click();
    const details = page.getByRole('group', { name: 'sand 1 500 details' });
    await expect(details).toContainText('--color-sand-1-500');
    await expect(details).toContainText(/White text\s*\d+\.\d\d:1 (AAA|AA|AA large|fails)/);
    await expect(details).toContainText(/Black text\s*\d+\.\d\d:1 (AAA|AA|AA large|fails)/);
  });

  test('opens and closes swatch details with the keyboard', async ({ page }) => {
    await suggestAndKeep(page);
    const trigger = page.getByRole('button', { name: 'Details for sand 1 500' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: 'sand 1 500 details' })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'sand 1 500 details' })).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('copies a token name from the swatch details', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await suggestAndKeep(page);
    await page.getByRole('button', { name: 'Details for sand 1 50', exact: true }).click();
    await page.getByRole('button', { name: 'Copy token name' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('--color-sand-1-50');
  });

  test('switches format and color system without asking the agent', async ({ page }) => {
    await suggestAndKeep(page);
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests++;
    });
    await choose(page, 'Show tokens as', 'Tailwind CSS v4');
    await choose(page, 'in', 'hex');
    await expect(page.locator('pre code')).toContainText('@theme {');
    await expect(page.locator('pre code')).toContainText(/--color-sand-1-500: #[0-9a-f]{6};/);
    expect(requests).toBe(0);
  });

  test('downloads the tokens', async ({ page }) => {
    await suggestAndKeep(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .css' }).click();
    expect((await download).suggestedFilename()).toBe('palette-suggested.css');
  });

  test('previews the palette in light and dark', async ({ page }) => {
    await suggestAndKeep(page);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.getByRole('region', { name: 'Light preview' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dark preview' })).toBeVisible();
  });

  test('shows a contrast matrix, and the tabs work with arrow keys', async ({ page }) => {
    await suggestAndKeep(page);
    await page.getByRole('tab', { name: 'Tokens' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Contrast' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Contrast' })).toBeFocused();
    // One pair of colors at a time: 11 steps by 11.
    await expect(page.locator('td')).toHaveCount(121);
    // The caption is for screen readers only.
    await expect(page.locator('caption')).toHaveCSS('position', 'absolute');
    await expect(page.locator('td').first()).toHaveAttribute('title', /your color 1 50 on your color 1 50: 1\.00:1, Fails/);
  });
});
