import { test, expect } from '@playwright/test';
import { securityFixture } from './security-fixture.js';
test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
for (const width of [1280, 390]) for (const colorScheme of ['light', 'dark'] as const) test(`Security findings and paths ${width} ${colorScheme}`, async ({ page }) => {
	await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#security-tab').click();
	await page.locator('#security-object').fill('SYS.OBJECT'); await page.locator('#security-run').click();
	await expect(page.locator('#security-status')).toContainText('Loaded.');
	await expect(page.locator('#security-content')).toContainText('<img src=x onerror=alert(1)>');
	await expect(page.locator('#security-content img, #security-content script')).toHaveCount(0);
	await expect(page.locator('.security-check')).toHaveCount(3);
	expect(await page.locator('.security-check').evaluateAll(nodes => nodes.map(n => (n as HTMLDetailsElement).open))).toEqual([false, true, false]);
	await expect(page.locator('.security-paths')).toContainText('APP → ROLE_A → ROLE_B → SYS.OBJECT');
	await expect(page.locator('#security-content .node-label').filter({ hasText: 'OBJECT' })).toHaveCount(2);
	await expect(page.locator('#security-content .node-label').filter({ hasText: 'Oracle-supplied' })).toHaveCount(0);
	const graph = page.locator('#security-content .graph-scroll');
	expect(await graph.evaluate(n => n.scrollWidth >= n.clientWidth && getComputedStyle(n).overflowX === 'auto')).toBe(true);
	const download = page.waitForEvent('download'); await page.locator('#security-export').click(); expect((await download).suggestedFilename()).toBe('security.md');
	await page.locator('#security-severity').selectOption('medium');
	await expect(page.locator('#security-content')).not.toContainText('SELECT ANY TABLE');
	await expect(page.locator('#security-content')).toContainText('Partial evidence.');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.locator('#security-target').selectOption('p1-19c-prod'); await expect(page.locator('#security-content')).toBeEmpty(); await expect(page.locator('#security-export')).toBeDisabled();
});
test('security failure, size cap, busy response, empty findings and stale responses', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#security-tab').click();
	await page.locator('#security-run').click(); await expect(page.locator('#security-export')).toBeEnabled();
	for (const status of [500, 413, 429]) {
		await page.route('**/api/security?*', route => route.fulfill({ status, json: { message: 'Failed' } }));
		await page.locator('#security-run').click(); await expect(page.locator('#security-status')).toContainText(status === 413 ? 'size cap' : status === 429 ? 'already running' : 'Request failed');
		await expect(page.locator('#security-export')).toBeDisabled(); await expect(page.locator('#security-content')).toBeEmpty(); await expect(page.locator('#security-run')).toBeEnabled();
	}
	await page.route('**/api/security?*', route => route.fulfill({ json: { result: { ...securityFixture, checks: [], whoCan: [] }, markdown: 'empty' } }));
	await page.locator('#security-run').click(); await expect(page.locator('#security-content')).toContainText('No findings for this severity'); await expect(page.locator('#security-content')).toContainText('No paths found');
	let release!: () => void;
	const pending = new Promise<void>(r => { release = r; });
	await page.route('**/api/security?*', async route => { await pending; await route.fulfill({ json: { result: securityFixture, markdown: 'stale' } }); });
	await page.locator('#security-run').click(); await page.locator('#security-target').selectOption('p1-19c-prod'); release();
	await expect(page.locator('#security-run')).toBeEnabled(); await expect(page.locator('#security-content')).toBeEmpty(); await expect(page.locator('#security-export')).toBeDisabled();
});
test('wide findings scroll locally and large graphs have a complete list fallback', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	const paths = Array.from({ length: 61 }, (_, i) => ({ ...securityFixture.whoCan![0]!, subject: 'APP' + i, path: ['APP' + i, 'ROLE', 'SYS.OBJECT'] }));
	await page.route('**/api/security?*', route => route.fulfill({ json: { result: { ...securityFixture, whoCan: paths }, markdown: 'fixture' } }));
	await page.locator('#security-tab').click(); await page.locator('#security-run').click();
	await expect(page.locator('#security-content')).toContainText('Graph shows 60 of 61 paths');
	await expect(page.locator('.security-paths > li')).toHaveCount(61);
	const box = page.locator('.security-table').first();
	expect(await box.evaluate(n => n.scrollWidth > n.clientWidth && getComputedStyle(n).overflowX === 'auto')).toBe(true);
	await box.evaluate(n => { n.scrollLeft = n.scrollWidth; }); expect(await box.evaluate(n => n.scrollLeft)).toBeGreaterThan(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
