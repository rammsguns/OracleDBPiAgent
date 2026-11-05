import { test, expect } from '@playwright/test';
test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
import { sqlFixture } from './sql-fixture.js';
for (const width of [1280, 390]) for (const colorScheme of ['light', 'dark'] as const) test(`SQL evidence ${width} ${colorScheme}`, async ({ page }) => {
	await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#sql-tab').click();
	await page.locator('#sql-mode').selectOption('text'); await page.locator('#sql-query').fill('SELECT'); await page.locator('#sql-run').click();
	await expect(page.locator('.sql-candidate')).toHaveCount(2); await expect(page.locator('.sql-evidence')).toHaveCount(0);
	await page.locator('.sql-candidate').first().click(); await expect(page.locator('#sql-status')).toContainText('Loaded.');
	await expect(page.locator('.sql-plan-tree > ul > li > ul > li > ul > li')).toContainText('9 · TABLE ACCESS FULL SH.SALES');
	for (const text of ['Best', 'Worst', 'Stale', 'Missing', 'Binds: unavailable · V$SQL_BIND_CAPTURE']) await expect(page.locator('.sql-chip').filter({ hasText: text }).first()).toBeVisible();
	await expect(page.locator('#sql-content script')).toHaveCount(0);
	await page.locator('#sql-content summary').click(); await expect(page.locator('#sql-content pre')).toContainText('Plan text');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const download = page.waitForEvent('download'); await page.locator('#sql-export').click(); expect((await download).suggestedFilename()).toBe('sql.md');
	await page.locator('#sql-target').selectOption('p1-19c-prod'); await expect(page.locator('.sql-evidence')).toHaveCount(0); await expect(page.locator('#sql-export')).toBeDisabled();
});
test('triage supports optional SQL evidence and old results', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click(); await page.locator('#triage-issue').fill('slow SQL');
	for (const present of [true, false]) {
		await page.route('**/api/triage', async route => { const response = await route.fetch(); const body = await response.json(); if (present) body.result.sql = sqlFixture; else delete body.result.sql; await route.fulfill({ json: body }); });
		await page.locator('#triage-run').click(); await expect(page.locator('#triage-status')).toContainText('Loaded.'); await expect(page.locator('#triage-content .sql-evidence')).toHaveCount(present ? 1 : 0);
	}
});
test('SQL empty search, unavailable sections, cache miss and failure clear stale exports', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#sql-tab').click(); await page.locator('#sql-query').fill('0123456789abc');
	await page.locator('#sql-run').click(); await expect(page.locator('#sql-export')).toBeEnabled();
	await page.route('**/api/sql?*', route => route.fulfill({ status: 500, json: { message: 'Request failed' } }));
	await page.locator('#sql-run').click(); await expect(page.locator('#sql-status')).toContainText('Request failed'); await expect(page.locator('#sql-export')).toBeDisabled();
	await expect(page.locator('#sql-run')).toBeEnabled(); await expect(page.locator('.sql-evidence')).toHaveCount(0);
	await page.route('**/api/sql?*', route => route.fulfill({ json: { result: { ...sqlFixture, text: '', children: [], plans: [], planChanges: [] }, markdown: 'empty' } }));
	await page.locator('#sql-run').click(); await expect(page.locator('#sql-content')).toContainText('SQL not in cursor cache.');
	await page.route('**/api/sql?*', route => route.fulfill({ json: { candidates: [], truncated: false } }));
	await page.locator('#sql-mode').selectOption('text'); await page.locator('#sql-query').fill('missing'); await page.locator('#sql-run').click(); await expect(page.locator('#sql-content')).toContainText('No cached SQL matched.'); await expect(page.locator('#sql-export')).toBeDisabled();
});
test('wide SQL evidence scrolls inside its table at desktop width', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.route('**/api/sql?*', route => route.fulfill({ json: { result: { ...sqlFixture, binds: [{ CHILD_NUMBER: 0, NAME: ':long_' + 'x'.repeat(200), POSITION: 1, DATATYPE_STRING: 'VARCHAR2', WAS_CAPTURED: 'NO' }] }, markdown: 'fixture' } }));
	await page.locator('#sql-tab').click(); await page.locator('#sql-query').fill('0123456789abc'); await page.locator('#sql-run').click();
	await expect(page.locator('#sql-status')).toContainText('Loaded.');
	const box = page.locator('.sql-table').last();
	expect(await box.evaluate(n => n.scrollWidth > n.clientWidth && getComputedStyle(n).overflowX === 'auto')).toBe(true);
	await box.evaluate(n => { n.scrollLeft = n.scrollWidth; });
	expect(await box.evaluate(n => n.scrollLeft)).toBeGreaterThan(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
