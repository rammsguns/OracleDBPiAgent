import { test, expect } from '@playwright/test';
import { dbSessionsFixture } from './dbsessions-fixture.js';
test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
for (const cycle of [false, true]) for (const width of [1280, 390]) for (const colorScheme of ['light','dark'] as const) test(`Sessions ${cycle ? 'cycle' : 'chain'} ${width} ${colorScheme}`, async ({ page }) => {
	await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
	await page.route('**/api/db-sessions?*', route => route.fulfill({ json: { result: dbSessionsFixture(cycle), markdown: '# Sessions' } }));
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#dbsessions-tab').click(); await page.locator('#dbsessions-run').click();
	await expect(page.locator('#dbsessions-status')).toContainText('Loaded.');
	await expect(page.locator('#dbsessions-content')).toContainText('Captured at 2026-11-06T12:00:00.000Z (UTC)');
	await expect(page.locator('.dbsessions-tree')).toContainText('APP.ORDERS');
	if(cycle) await expect(page.locator('.dbsessions-tree')).toContainText('DEADLOCK CYCLE');
	await expect(page.locator('.dbsessions-graph svg rect')).toHaveCount(3);
	await expect(page.locator('#dbsessions-content img')).toHaveCount(0);
	await page.locator('#dbsessions-filter-status').selectOption('INACTIVE');
	await expect(page.getByRole('region', {name: 'Active sessions',exact:true}).locator('tbody tr')).toHaveCount(1);
	await page.locator('#dbsessions-filter-waitClass').selectOption('Application');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const download = page.waitForEvent('download'); await page.locator('#dbsessions-export').click(); expect((await download).suggestedFilename()).toBe('sessions.md');
	await page.locator('.dbsessions-tree a').first().click(); await expect(page.locator('#sql-panel')).toBeVisible(); await expect(page.locator('#sql-query')).toHaveValue('0123456789abc');
	await page.locator('#dbsessions-tab').click(); await page.locator('#dbsessions-target').selectOption('p1-19c-prod'); await expect(page.locator('#dbsessions-content')).toBeEmpty(); await expect(page.locator('#dbsessions-export')).toBeDisabled();
});
test('Sessions errors, incomplete evidence, empty snapshot and stale response', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#dbsessions-tab').click();
	for (const status of [500,413,429]) { await page.route('**/api/db-sessions?*', r => r.fulfill({status,json:{message:'Failed'}})); await page.locator('#dbsessions-run').click(); await expect(page.locator('#dbsessions-status')).toContainText(status===413?'size cap':status===429?'already running':'Request failed'); await expect(page.locator('#dbsessions-export')).toBeDisabled(); }
	const fixture=dbSessionsFixture(); fixture.sections.blocking.rows=[]; fixture.findings=[]; fixture.sections.active.status='unavailable' as any; fixture.sections.active.evidence.truncated=true;
	await page.route('**/api/db-sessions?*',r=>r.fulfill({json:{result:fixture,markdown:'empty'}})); await page.locator('#dbsessions-run').click(); await expect(page.locator('#dbsessions-content')).toContainText('No blocking'); await expect(page.locator('#dbsessions-content')).toContainText('Row cap reached'); await expect(page.locator('#dbsessions-content')).toContainText('unavailable');
	let release!:()=>void; const pending=new Promise<void>(r=>{release=r;}); await page.route('**/api/db-sessions?*',async r=>{await pending; await r.fulfill({json:{result:fixture,markdown:'stale'}});}); await page.locator('#dbsessions-run').click(); await page.locator('#dbsessions-target').selectOption('p1-19c-prod'); release(); await expect(page.locator('#dbsessions-run')).toBeEnabled(); await expect(page.locator('#dbsessions-content')).toBeEmpty();
});
