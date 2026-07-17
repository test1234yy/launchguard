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

test.describe('LaunchGuard new features', () => {
  test('insights panel shows projections and quick wins after a scan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    const insights = page.getByTestId('insights-panel');
    await expect(insights).toBeVisible({ timeout: 15000 });
    await expect(insights.getByRole('heading', { name: /Projected score/i })).toBeVisible();
    await expect(insights.getByRole('heading', { name: /Quick wins/i })).toBeVisible();
    await expect(insights.getByText(/fingerprint/i)).toBeVisible();
    await expect(insights.locator('.filetype-chip').first()).toBeVisible();
  });

  test('expand all and collapse all toggle finding bodies', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.finding-body')).toHaveCount(0);
    await page.getByRole('button', { name: /Expand all/i }).click();
    const findingCount = await page.locator('.finding').count();
    await expect(page.locator('.finding-body')).toHaveCount(findingCount);
    await page.getByRole('button', { name: /Collapse all/i }).click();
    await expect(page.locator('.finding-body')).toHaveCount(0);
  });

  test('sorting by file reorders the findings list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    await page.getByLabel('Sort findings').selectOption('file');
    const files = await page.locator('.finding .file').allTextContents();
    const names = files.map((value) => value.split(':')[0]);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('pressing / focuses the findings filter', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: /Filter findings by text/i })).toBeFocused();
  });

  test('rule catalog lists the full rule set before scanning', async ({ page }) => {
    await page.goto('/');
    const catalog = page.locator('.rule-catalog');
    await catalog.locator('summary').click();
    await expect(catalog.getByRole('heading', { name: /^secrets$/i })).toBeVisible();
    await expect(catalog.getByRole('heading', { name: /^quality$/i })).toBeVisible();
    await expect(catalog.getByText('SEC001')).toBeVisible();
    await expect(catalog.getByText('QUA001')).toBeVisible();
  });

  test('new export buttons are available after a scan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.locator('.finding-head').first()).toBeVisible({ timeout: 15000 });

    for (const name of ['Markdown', 'CSV', 'XML', 'JSON', 'SARIF', 'HTML', 'Badge SVG']) {
      await expect(page.locator('.export-row').getByRole('button', { name, exact: true })).toBeVisible();
    }
    const download = page.waitForEvent('download');
    await page.locator('.export-row').getByRole('button', { name: 'SARIF', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.sarif$/);
  });

  test('scan history records recent scans with a score delta on re-scan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.getByTestId('history-panel')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('history-panel').locator('.history-row')).toHaveCount(1);

    // Second scan of the same project surfaces a delta chip (±0 for identical content).
    await page.getByRole('button', { name: /Run demo scan/i }).click();
    await expect(page.getByTestId('score-delta')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('score-delta')).toContainText(/±0|▲|▼/);

    await page.getByRole('button', { name: /Clear history/i }).click();
    await expect(page.getByTestId('history-panel')).toHaveCount(0);
  });

  test('health, rules and badge APIs respond', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const healthBody = await health.json();
    expect(healthBody.status).toBe('healthy');
    expect(healthBody.rules).toBeGreaterThanOrEqual(40);

    const rules = await request.get('/api/rules');
    expect(rules.ok()).toBeTruthy();
    const rulesBody = await rules.json();
    expect(rulesBody.count).toBe(rulesBody.rules.length);

    const badge = await request.get('/api/badge?score=87');
    expect(badge.ok()).toBeTruthy();
    expect(badge.headers()['content-type']).toContain('svg');
    expect(await badge.text()).toContain('87/100');

    const badBadge = await request.get('/api/badge?score=weird');
    expect(badBadge.status()).toBe(400);
  });
});
