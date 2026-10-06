import { test, expect } from '@playwright/test';

test.describe('Search Pipeline Diagnostics and Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Listen to all console messages and network requests
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on('requestfailed', request => {
      console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.url().includes('nominatim') || response.url().includes('wikipedia') || response.url().includes('wikidata') || response.url().includes('generativelanguage')) {
        console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await expect(page.locator('#canvas-container')).toBeVisible({ timeout: 15000 });
  });

  test('search Dallas resolves successfully without error', async ({ page }) => {
    const searchInput = page.locator('form input[type="text"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Dallas');
    await searchInput.press('Enter');

    // Wait for resolution or error
    // If error occurs:
    const errorDiv = page.locator('[role="status"]');

    // We expect the InfoPanel or marker to appear
    const infoPanel = page.getByTestId('info-panel');

    // Wait for either InfoPanel or error
    await Promise.race([
      expect(infoPanel).toBeVisible({ timeout: 15000 }),
      expect(errorDiv).toBeVisible({ timeout: 15000 })
    ]);

    // Ensure NO error
    await expect(errorDiv).toHaveCount(0);
    await expect(infoPanel).toBeVisible();
    await expect(infoPanel).toContainText(/Dallas/i);
  });

  test('search Cairo resolves successfully without error', async ({ page }) => {
    const searchInput = page.locator('form input[type="text"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Cairo');
    await searchInput.press('Enter');

    const errorDiv = page.locator('[role="status"]');
    const infoPanel = page.getByTestId('info-panel');

    await Promise.race([
      expect(infoPanel).toBeVisible({ timeout: 15000 }),
      expect(errorDiv).toBeVisible({ timeout: 15000 })
    ]);

    await expect(errorDiv).toHaveCount(0);
    await expect(infoPanel).toBeVisible();
    await expect(infoPanel).toContainText(/Cairo/i);
  });

  test('search Budapest resolves successfully without error', async ({ page }) => {
    const searchInput = page.locator('form input[type="text"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Budapest');
    await searchInput.press('Enter');

    const errorDiv = page.locator('[role="status"]');
    const infoPanel = page.getByTestId('info-panel');

    await Promise.race([
      expect(infoPanel).toBeVisible({ timeout: 15000 }),
      expect(errorDiv).toBeVisible({ timeout: 15000 })
    ]);

    await expect(errorDiv).toHaveCount(0);
    await expect(infoPanel).toBeVisible();
    await expect(infoPanel).toContainText(/Budapest/i);
  });

  test('search "Where was the HMS Victor found?" resolves successfully without error', async ({ page }) => {
    const searchInput = page.locator('form input[type="text"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Where was the HMS Victor found?');
    await searchInput.press('Enter');

    const errorDiv = page.locator('[role="status"]');
    const infoPanel = page.getByTestId('info-panel');

    await Promise.race([
      expect(infoPanel).toBeVisible({ timeout: 15000 }),
      expect(errorDiv).toBeVisible({ timeout: 15000 })
    ]);

    await expect(errorDiv).toHaveCount(0);
    await expect(infoPanel).toBeVisible();
    await expect(infoPanel).toContainText(/Victor/i);
  });
});
