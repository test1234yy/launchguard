import { test, expect } from '@playwright/test';

test.describe('LaunchGuard smoke', () => {
  test('landing page renders the scanner', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Ship with confidence/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Demo scan/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /GitHub repo/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Upload ZIP/i })).toBeVisible();
  });

  test('demo scan produces a score and findings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();

    // Score gauge appears.
    await expect(page.getByRole('img', { name: /Readiness score/i })).toBeVisible({ timeout: 15000 });

    // Findings section renders with at least one finding.
    await expect(page.getByRole('heading', { name: /^Findings/i })).toBeVisible();
    const findingButtons = page.locator('.finding-head');
    await expect(findingButtons.first()).toBeVisible();
    expect(await findingButtons.count()).toBeGreaterThan(0);
  });

  test('severity filter narrows the findings list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    const total = await page.locator('.finding').count();
    // Filter to Critical only.
    await page.getByRole('button', { name: /^Critical/ }).click();
    const critical = await page.locator('.finding').count();
    expect(critical).toBeLessThanOrEqual(total);
    // Every visible finding badge should now read "critical".
    const badges = page.locator('.finding .sev-badge');
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toHaveText(/critical/i);
    }
  });

  test('text filter matches evidence and titles', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('searchbox', { name: /Filter findings by text/i }).fill('Dockerfile');
    // At least one Docker-related finding should remain, and the list should not be empty.
    await expect(page.locator('.finding').first()).toBeVisible();
  });

  test('generating a fix plan renders a plan without an API key', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Generate fix plan/i }).click();
    await expect(page.locator('.fixplan-body')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.badge-source')).toContainText(/Deterministic|OpenAI/);
  });
});
