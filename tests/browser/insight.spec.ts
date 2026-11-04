import { test, expect } from '@playwright/test';
import { evil } from './insight-fixture.js';
test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
test('PL/SQL tab, document, layered SVG, literal hostile labels at phone width', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 }); await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator('#plsql-tab').click(); await page.locator('#plsql-owner').fill('SHOPAPP'); await page.locator('#plsql-run').click();
	await expect(page.locator('#plsql-object option')).toHaveCount(1); await page.locator('#plsql-doc').click();
	await expect(page.locator('#plsql-content svg')).toHaveCount(1);
	await expect(page.locator('#plsql-content svg title').first()).toHaveText(evil);
	await expect(page.locator('#plsql-content svg text').first()).toContainText(evil);
	await expect(page.locator('#plsql-content')).toContainText('Incomplete dictionary');
	await expect(page.locator('#plsql-content script, #plsql-content img')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('triage hypotheses, fixes, SQL, evidence, trace and Markdown download', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await page.locator('#triage-issue').fill('ORA-02292'); await page.locator('#triage-run').click();
	await expect(page.locator('#triage-content')).toContainText('Foreign key child rows');
	await expect(page.locator('#triage-content')).toContainText('Review retention policy');
	await expect(page.locator('#triage-content pre')).toContainText('SELECT * FROM DBA_CONSTRAINTS');
	await expect(page.locator('#triage-content td')).toHaveText(evil);
	await expect(page.locator('#triage-content svg')).toHaveCount(1);
	const download = page.waitForEvent('download'); await page.locator('#triage-export').click(); const file = await download; expect(file.suggestedFilename()).toBe('triage.md');
	const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk); expect(Buffer.concat(chunks).toString()).toContain('Foreign key child rows');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expect(page.locator('#triage-content script')).toHaveCount(0);
});
test('insight errors are shown and buttons recover', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await page.locator('#triage-issue').fill('ORA-02292');
	for (const status of [429, 413, 500]) {
		await page.route('**/api/triage', route => route.fulfill({ status, contentType: 'application/json', body: '{"message":"Request failed"}' }));
		await page.locator('#triage-run').click(); await expect(page.locator('#triage-status')).toContainText(status === 429 ? 'already running' : status === 413 ? 'size cap' : 'Request failed');
		await expect(page.locator('#triage-run')).toBeEnabled(); await expect(page.locator('#triage-export')).toBeDisabled();
	}
});
test('web slash triage prepares evidence for one fake prompt; normal chat still works', async ({ page, request }) => {
	const before = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json();
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await expect(page.locator('#question')).toBeEnabled();
	await page.locator('#question').fill('/triage ORA-02292'); await page.locator('#send').click();
	await expect(page.locator('#messages')).toContainText('Final answer');
	const after = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json(); expect(after.prompts - before.prompts).toBe(1); expect(after.lastQuestion).toContain('Foreign key child rows'); expect(after.lastQuestion).toContain('Do not call tools');
});
