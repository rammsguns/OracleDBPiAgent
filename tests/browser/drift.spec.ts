import { test, expect } from '@playwright/test';
import { hostile } from './fake-server.js';

test.afterEach(async ({ page, request }) => {
	await page.close();
	await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire');
});
test('drift pickers, literal object and column names, unavailable notes and phone layout', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	const dialogs: string[] = [];
	page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await expect(page.locator('#drift-left option')).toHaveCount(3);
	await page.locator('#drift-tab').click();
	await page.locator('#drift-scope').selectOption('schema');
	await page.locator('#drift-owner').fill('HR');
	const response = page.waitForResponse(r => r.url().endsWith('/api/drift'));
	await page.locator('#drift-run').click();
	expect((await response).request().postDataJSON()).toEqual({ left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'schema:HR' });
	await expect(page.locator('#drift-status')).toContainText('Incomplete comparison');
	await expect(page.locator('#drift-content details')).toHaveCount(3);
	await page.locator('#drift-content summary').first().click();
	await expect(page.locator('#drift-content pre').first()).toContainText(hostile);
	await expect(page.locator('#drift-content')).toContainText('needs SELECT on V$PARAMETER');
	await expect(page.locator('#drift-content img, #drift-content script')).toHaveCount(0);
	expect(dialogs).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('server rejects concurrent drift requests with 429', async ({ request }) => {
	const url = new URL(process.env.PIAGENT_BROWSER_URL!);
	const options = { headers: { Authorization: 'Bearer ' + url.hash.slice(7) }, data: { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'parameters' } };
	const responses = await Promise.all([request.post(url.origin + '/api/drift', options), request.post(url.origin + '/api/drift', options)]);
	expect(responses.map(r => r.status()).sort()).toEqual([200, 429]);
});
