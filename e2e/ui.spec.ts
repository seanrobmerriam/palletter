import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true');
}

const hue = (page: Page, n = 1) => page.getByLabel(`Hue ${n}: color value or name`);
/** The Accordion trigger for a collapsed step, e.g. "2 Token format CSS custom properties, …". */
const section = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^\\d+ ${name}`) });
/** Choose an option in an SV5UI Select. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const create = (page: Page) => page.getByRole('button', { name: 'Create' });

test.describe('generator form', () => {
  test('compares a balanced palette with the agent\'s original', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('From my colors').uncheck();
    await page.getByLabel('Triadic').check();
    await create(page).click();
    await expect(page.getByText(/^Balanced\./)).toBeVisible();
    await expect(page.getByText('Softened color 2 and color 3 so color 1 leads.')).toBeVisible();

    const swatch = page.locator('.swatch').nth(16); // color 2, step 500
    const background = () => swatch.evaluate((el) => (el as HTMLElement).style.background);
    const balanced = await background();
    const toggle = page.getByRole('button', { name: "Show the agent's original" });
    await toggle.click();
    await expect(page.getByText("Showing the agent's original palette")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show balanced' })).toHaveAttribute('aria-pressed', 'true');
    expect(await background()).not.toBe(balanced);
    await expect(page.locator('pre code')).toContainText('--color-color-2-500: oklch(63% 0.05');
  });

  test('suggests From my colors for several hues with Monochromatic', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('From my colors').uncheck();
    await page.getByLabel('Monochromatic').check();
    const hint = page.getByRole('note').filter({ hasText: 'Monochromatic uses only one hue' });
    await expect(hint).toHaveCount(0);

    await page.getByRole('button', { name: 'Add a hue' }).click();
    await hue(page, 2).fill('#bf8645');
    await expect(hint).toBeVisible();
    await page.getByRole('button', { name: 'Use From my colors' }).click();
    await expect(hint).toHaveCount(0);
    await expect(section(page, 'Schemes')).toContainText('From my colors');
    await expect(page.getByLabel('Monochromatic')).not.toBeChecked();
  });

  test('can turn balancing off', async ({ page }) => {
    await open(page);
    await section(page, 'Saturation').click();
    await page.getByRole('switch', { name: 'Balance the palette' }).click();
    await expect(section(page, 'Saturation')).toContainText('not balanced');
    const requestPromise = page.waitForRequest('/api/palettes');
    await create(page).click();
    expect((await requestPromise).postDataJSON()).toMatchObject({ balance: false });
    await expect(page.getByRole('status').filter({ hasText: 'Created 1 palette with Fake Large.' })).toBeVisible();
    await expect(page.getByRole('button', { name: "Show the agent's original" })).toHaveCount(0);
  });

  test('picks a model from the ones the agent offers', async ({ page }) => {
    await open(page);
    const model = page.getByLabel('Model', { exact: true });
    await expect(model).toContainText('Default (recommended)');

    // The default isn't sent, so the agent keeps its own default.
    let requestPromise = page.waitForRequest('/api/palettes');
    await create(page).click();
    expect((await requestPromise).postDataJSON()).not.toHaveProperty('model');
    await expect(page.getByRole('status').filter({ hasText: 'Created 1 palette with Fake Large.' })).toBeVisible();

    await page.getByLabel('Model', { exact: true }).click();
    // Each option's name includes its description, e.g. "Fake Small Quick".
    await page.getByRole('option', { name: /^Fake Small/ }).click();
    requestPromise = page.waitForRequest('/api/palettes');
    await create(page).click();
    expect((await requestPromise).postDataJSON()).toMatchObject({ model: 'fake-small' });
    await expect(page.getByRole('status').filter({ hasText: 'Created 1 palette with Fake Small.' })).toBeVisible();
    await expect(page.getByText('A fake palette from fake-small.')).toBeVisible();
  });

  test('shows that the agent is ready', async ({ page }) => {
    await open(page);
    await expect(page.locator('.agent-status')).toHaveText(/Ready/);
    await expect(page.getByLabel('Agent')).toContainText('Custom (bun)');
  });

  test('creates a palette from only the hue', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'Created 1 palette with Fake Large.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From my colors', exact: true })).toBeVisible();
    // The hue plus at least one more color (the fake agent adds one).
    await expect(page.locator('.swatch')).toHaveCount(22);
    await expect(page.locator('pre code')).toContainText('--color-color-1-50: oklch(97% 0.012 255);');
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
    await expect(section(page, 'Schemes')).toContainText('From my colors, Triadic');

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
      schemes: ['from-my-colors', 'triadic'],
      agent: 'custom',
    });

    await expect(page.getByText('Created 2 palettes with Fake Large.')).toBeVisible();
    await expect(page.locator('pre code').first()).toContainText('@theme {');
    await expect(page.locator('pre code').first()).toContainText('--color-primary-color-50: #');
    await expect(page.getByText('primary', { exact: true }).first()).toBeVisible();
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
    await section(page, 'Schemes').click();
    await page.getByLabel('From my colors').uncheck();
    await section(page, 'Schemes').click();
    await section(page, 'Token format').click();
    await page.getByLabel('Naming pattern', { exact: true }).fill('color-[name]');
    await section(page, 'Token format').click();

    await create(page).click();
    await expect(page.getByText('Choose at least one scheme')).toBeVisible();
    await expect(page.getByText('Use a custom property name such as --color-[name]-[step]')).toBeVisible();
    await expect(page.getByLabel('Naming pattern', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Naming pattern', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });

  test('marks the schemes invalid and focuses them when none are chosen', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('From my colors').uncheck();
    await create(page).click();
    const first = page.getByRole('checkbox', { name: 'From my colors' });
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await first.getAttribute('aria-describedby')) ?? '';
    const ids = describedBy.split(/\s+/).filter(Boolean);
    const texts = await Promise.all(ids.map((i) => page.locator(`[id="${i}"]`).textContent()));
    expect(texts.join(' ')).toContain('Choose at least one scheme');
    // Choosing a scheme clears the error.
    await page.getByLabel('Triadic').check();
    await create(page).click();
    await expect(page.getByRole('checkbox', { name: 'Triadic' })).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('can be used with only the keyboard', async ({ page }) => {
    await open(page);
    await hue(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();
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
    await page.getByRole('button', { name: 'Copy color 1 500 value' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('oklch(63% 0.05 260)');
    await expect(page.getByRole('button', { name: 'Copied color 1 500' })).toBeVisible();
  });

  test('shows only the step on each swatch, with details in a popover', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.locator('.swatch').nth(5)).toHaveText('500');
    await page.getByRole('button', { name: 'Details for color 1 500' }).click();
    const details = page.getByRole('group', { name: 'color 1 500 details' });
    await expect(details).toContainText('oklch(63% 0.05 260)');
    await expect(details).toContainText('--color-color-1-500');
    await expect(details).toContainText(/White text\s*\d+\.\d\d:1 (AAA|AA|AA large|fails)/);
    await expect(details).toContainText(/Black text\s*\d+\.\d\d:1 (AAA|AA|AA large|fails)/);
  });

  test('opens and closes swatch details with the keyboard', async ({ page }) => {
    await open(page);
    await create(page).click();
    const trigger = page.getByRole('button', { name: 'Details for color 1 500' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: 'color 1 500 details' })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'color 1 500 details' })).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('copies a token name from the swatch details', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await create(page).click();
    await page.getByRole('button', { name: 'Details for color 1 50' , exact: true }).click();
    await page.getByRole('button', { name: 'Copy token name' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('--color-color-1-50');
  });

  test('switches format and color system without asking the agent again', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests++;
    });
    await choose(page, 'Show tokens as', 'Tailwind CSS v4');
    await choose(page, 'in', 'hex');
    await expect(page.locator('pre code')).toContainText('@theme {');
    await expect(page.locator('pre code')).toContainText(/--color-color-1-500: #[0-9a-f]{6};/);
    await page.getByRole('button', { name: 'Details for color 1 500' }).click();
    const details = page.getByRole('group', { name: 'color 1 500 details' });
    await expect(details).toContainText(/hex\s*#[0-9a-f]{6}/);
    await expect(details).toContainText('--color-color-1-500');
    expect(requests).toBe(0);
  });

  test('downloads the tokens', async ({ page }) => {
    await open(page);
    await create(page).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .css' }).click();
    expect((await download).suggestedFilename()).toBe('palette-from-my-colors.css');
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
    // The caption is for screen readers only.
    await expect(page.locator('caption')).toHaveCSS('position', 'absolute');
    await expect(page.locator('caption')).toHaveCSS('width', '1px');
    await expect(page.locator('td').first()).toHaveAttribute('title', /color 1 50 on color 1 50: 1\.00:1, Fails/);
  });

  test('refines one palette with a note', async ({ page }) => {
    await open(page);
    await section(page, 'Schemes').click();
    await page.getByLabel('Triadic').check();
    await create(page).click();
    await expect(page.getByText('Created 2 palettes with Fake Large.')).toBeVisible();

    const triadic = page.locator('article', { has: page.getByRole('heading', { name: 'Triadic', exact: true }) });
    await triadic.getByRole('button', { name: 'Refine…' }).click();
    await triadic.getByLabel('What should change?').fill('warmer please');
    await triadic.getByRole('button', { name: 'Refine', exact: true }).click();
    await expect(triadic.getByText('Refined: warmer please')).toBeVisible();
    await expect(page.locator('article', { has: page.getByRole('heading', { name: 'From my colors', exact: true }) })).toContainText('A fake palette.');
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
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();

    await page.route('**/api/palettes/refine', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'session_expired', error: 'Closed.' }) }),
    );
    const retry = page.waitForRequest((r) => r.url().endsWith('/api/palettes') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Refine…' }).click();
    await page.getByLabel('What should change?').fill('brighter');
    await page.getByRole('button', { name: 'Refine', exact: true }).click();
    expect((await retry).postDataJSON()).toMatchObject({ schemes: ['from-my-colors'], mood: 'calm', note: 'brighter' });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('ignores a refinement that finishes after a new generation started', async ({ page }) => {
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();

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
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();
    release();
    await page.waitForTimeout(300);
    await expect(page.getByText('A different take.')).toHaveCount(0);
    await expect(page.getByText('A fake palette.')).toBeVisible();
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await create(page).click();
    await expect(page.getByText('Created 1 palette with Fake Large.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
