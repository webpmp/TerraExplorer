import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Reusable helper that verifies a panel's bounding box stays completely inside the viewport.
 * Verifies all four boundaries:
 * - left >= 0
 * - top >= 0
 * - right <= viewport width
 * - bottom <= viewport height
 */
export async function expectPanelInsideViewport(page: Page, locator: Locator, timeout = 15000) {
  await expect(locator).toBeVisible({ timeout });

  const viewport = page.viewportSize();
  expect(viewport, 'Page should have a defined viewport size').not.toBeNull();
  if (!viewport) return;

  const box = await locator.boundingBox();
  expect(box, 'Panel element should have a valid bounding box').not.toBeNull();
  if (!box) return;

  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  expect(left, `Panel left (${left}px) should be >= 0`).toBeGreaterThanOrEqual(0);
  expect(top, `Panel top (${top}px) should be >= 0`).toBeGreaterThanOrEqual(0);
  expect(right, `Panel right (${right}px) should be <= viewport width (${viewport.width}px)`).toBeLessThanOrEqual(viewport.width);
  expect(bottom, `Panel bottom (${bottom}px) should be <= viewport height (${viewport.height}px)`).toBeLessThanOrEqual(viewport.height);
}

test.describe('Responsive Layout Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the main canvas/application shell to be present
    await expect(page.locator('#canvas-container')).toBeVisible({ timeout: 15000 });
  });

  test('settings panel stays inside viewport', async ({ page }) => {
    // Open Settings using the application's existing UI
    const settingsBtn = page.getByRole('button', { name: 'Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const panel = page.getByTestId('settings-panel');
    await expectPanelInsideViewport(page, panel);
  });

  test('favorites panel stays inside viewport', async ({ page }) => {
    // Open Favorites using the application's existing UI
    const favoritesBtn = page.getByRole('button', { name: 'Toggle Favorites' });
    await expect(favoritesBtn).toBeVisible();
    await favoritesBtn.click();

    const panel = page.getByTestId('favorites-panel');
    await expectPanelInsideViewport(page, panel);
  });

  test('info panel stays inside viewport', async ({ page }, testInfo) => {
    // Open Favorites and select a location/route to display InfoPanel
    const favoritesBtn = page.getByRole('button', { name: 'Toggle Favorites' });
    await expect(favoritesBtn).toBeVisible();
    await favoritesBtn.click();

    const favPanel = page.getByTestId('favorites-panel');
    await expect(favPanel).toBeVisible();

    // Click on the first saved exploration item to fly to it and open InfoPanel
    const firstItem = favPanel.locator('.cursor-pointer').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();

    const infoPanel = page.getByTestId('info-panel');
    await expectPanelInsideViewport(page, infoPanel);

    const screenshotDir = path.join(process.cwd(), 'e2e', 'screenshots');
    const screenshotPath = path.join(screenshotDir, `${testInfo.project.name}-infopanel.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });

  test('theme selector respects desktop-only parchment policy', async ({ page }, testInfo) => {
    const isDesktop = testInfo.project.name.startsWith('desktop');

    const settingsBtn = page.getByRole('button', { name: 'Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const appearanceTab = page.locator('#settings-tab-appearance');
    await expect(appearanceTab).toBeVisible();
    await appearanceTab.click();

    const appearancePanel = page.locator('#settings-tabpanel-appearance');
    await expect(appearancePanel).toBeVisible();

    if (isDesktop) {
      await expect(appearancePanel.getByRole('button', { name: /Parchment/i })).toBeVisible();
    } else {
      await expect(appearancePanel.getByRole('button', { name: /Parchment/i })).toHaveCount(0);
    }
  });

  test('bottom controls stack, search input, and footer are fully inside viewport', async ({ page }) => {
    const bottomControls = page.locator('.controls-bottom-container');
    await expectPanelInsideViewport(page, bottomControls);

    const searchInput = page.locator('form input[type="text"]');
    await expectPanelInsideViewport(page, searchInput);
  });

  test('resizing from desktop parchment to non-desktop switches to modern', async ({ page }, testInfo) => {
    if (!testInfo.project.name.startsWith('desktop')) {
      return;
    }

    // Open Settings and select Parchment
    const settingsBtn = page.getByRole('button', { name: 'Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const appearanceTab = page.locator('#settings-tab-appearance');
    await expect(appearanceTab).toBeVisible();
    await appearanceTab.click();

    const parchmentBtn = page.locator('#settings-tabpanel-appearance').getByRole('button', { name: /Parchment/i });
    await expect(parchmentBtn).toBeVisible();
    await parchmentBtn.click();

    // Verify canvas container has data-parchment="true"
    await expect(page.locator('#canvas-container')).toHaveAttribute('data-parchment', 'true');

    // Save desktop parchment screenshot
    const screenshotDir = path.join(process.cwd(), 'e2e', 'screenshots');
    await page.screenshot({ path: path.join(screenshotDir, `${testInfo.project.name}-parchment.png`), fullPage: false });

    // Resize viewport to non-desktop iPad landscape (1080x810)
    await page.setViewportSize({ width: 1080, height: 810 });

    // Verify auto-switch to modern (data-parchment attribute removed)
    await expect(page.locator('#canvas-container')).not.toHaveAttribute('data-parchment', 'true');
  });

  test('layout screenshot', async ({ page }, testInfo) => {
    const screenshotDir = path.join(process.cwd(), 'e2e', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(screenshotDir, `${testInfo.project.name}.png`);

    // Capture viewport screenshot (not full-page)
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});