import { test, expect, type Page } from '@playwright/test';
import { hostile } from './fake-server.js';
const tokenUrl = () => process.env.PIAGENT_BROWSER_URL!;
const origin = () => new URL(tokenUrl()).origin;
const headers = () => ({ Authorization: `Bearer ${new URL(tokenUrl()).hash.slice(7)}` });
async function ready(page: Page) {
	await page.goto(tokenUrl());
	await expect(page.locator('#question')).toBeEnabled();
	await expect(page.locator('#health')).toContainText('Fake Strata: ok');
}
async function ask(page: Page, question = 'hello') {
	await page.locator('#question').fill(question);
	await page.locator('#send').click();
}
// Close sessions even after failures, keeping the shared server's four slots available.
test.afterEach(async ({ page, request }) => {
	await page.close();
	await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire');
});

test('consumes and removes hash token, authenticates requests and rejects missing tokens', async ({ page, request }) => {
	const targets = page.waitForRequest(r => r.url().endsWith('/api/targets'));
	await ready(page);
	expect((await targets).headers().authorization).toBe(headers().Authorization);
	expect(page.url()).toBe(origin() + '/');
	expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
	expect((await request.get(origin() + '/api/targets')).status()).toBe(401);
	await page.goto(origin());
	await expect(page.locator('#status')).toContainText('Open the token URL');
	await expect(page.locator('#question')).toBeDisabled();
});

test('populates targets from API and changing target replaces the session', async ({ page, request }) => {
	await ready(page);
	const targets = await (await request.get(origin() + '/api/targets', { headers: headers() })).json();
	await expect(page.locator('#target option')).toHaveCount(targets.length + 1);
	for (const target of targets) await expect(page.locator(`#target option[value="${target.name}"]`)).toContainText(target.description);
	const removed = page.waitForResponse(r => r.request().method() === 'DELETE');
	const created = page.waitForResponse(r => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
	await page.locator('#target').selectOption('p1-19c-prod');
	expect((await removed).status()).toBe(204);
	const response = await created;
	expect(response.request().postDataJSON()).toEqual({ target: 'p1-19c-prod' });
	expect((await response.json()).sessionId).not.toBe((await removed).url().split('/').at(-1));
	await expect(page.locator('#question')).toBeEnabled();
});

test('streams partial text, shows final answer and successful and failed tool traces', async ({ page }) => {
	await ready(page); await ask(page);
	await expect(page.locator('.answer')).toHaveText('Partial answer');
	await expect(page.locator('#status')).toHaveText('Working…');
	await expect(page.locator('#trace tr').first()).toContainText('running');
	await expect(page.locator('#status')).toHaveText('Answer complete.');
	await expect(page.locator('.answer')).toHaveText('Final answer ' + hostile);
	await expect(page.locator('#trace tr')).toHaveCount(2);
	await expect(page.locator('#trace tr').first()).toContainText('ok');
	await expect(page.locator('#trace tr').last()).toContainText('Tool execution failed');
	await expect(page.locator('#trace tr').last().locator('td').last()).toHaveText(/^\d+$/);
});

test('Stop aborts the server agent and retains partial output', async ({ page, request }) => {
	await ready(page);
	const before = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json();
	await ask(page, 'hold');
	await expect(page.locator('.answer')).toHaveText('Partial answer');
	await page.locator('#stop').click();
	await expect(page.locator('#status')).toHaveText('Stopped. Partial answer retained.');
	await expect(page.locator('.answer')).toHaveText('Partial answer');
	await expect(page.locator('#question')).toBeEnabled();
	await expect.poll(async () => (await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json()).aborted).toBeGreaterThan(before.aborted);
});

test('concurrent ask returns 409 and another page displays busy', async ({ page, context }) => {
	await ready(page);
	const other = await context.newPage(); await ready(other);
	try {
		await ask(page, 'hold'); await expect(page.locator('.answer')).toHaveText('Partial answer');
		const rejected = other.waitForResponse(r => r.url().endsWith('/ask'));
		await ask(other);
		expect((await rejected).status()).toBe(409);
		await expect(other.locator('#status')).toContainText('The server is busy');
		await page.locator('#stop').click();
		await expect(page.locator('#question')).toBeEnabled();
	} finally { await other.close(); }
});

test('expired session is replaced and the question is retried once', async ({ page, request }) => {
	await ready(page);
	await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire');
	const statuses: number[] = [];
	page.on('response', r => { if (r.url().endsWith('/ask')) statuses.push(r.status()); });
	await ask(page);
	await expect(page.locator('#status')).toHaveText('Answer complete.');
	expect(statuses).toEqual([404, 200]);
	await expect(page.locator('.answer')).toHaveCount(1);
});

test('audit records belong to current session and health shows named statuses', async ({ page }) => {
	await ready(page);
	await expect(page.locator('#health')).toHaveText('Health: Fake Strata: ok · Fake Oracle: fail');
	await page.locator('#refresh').click();
	await expect(page.locator('#refresh')).toBeEnabled();
	await page.locator('#audit-tab').click();
	await expect(page.locator('#audit tr')).toHaveCount(1);
	await expect(page.locator('#audit tr')).toContainText('fake-hash');
	await expect(page.locator('#audit tr')).toContainText('d1-19c-lab');
	await expect(page.locator('#audit-status')).toHaveText('1 records');
});

test('hostile answer, tool arguments and audit stay literal without dialogs, injected nodes or CSP violations', async ({ page }) => {
	const dialogs: string[] = [], errors: string[] = [];
	page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
	page.on('console', m => { if (/content security policy|violates|refused to execute/i.test(m.text())) errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	await page.addInitScript(() => {
		(window as any).cspViolations = [];
		addEventListener('securitypolicyviolation', e => (window as any).cspViolations.push(e.violatedDirective));
	});
	await ready(page); await ask(page);
	await expect(page.locator('#status')).toHaveText('Answer complete.');
	await expect(page.locator('.answer')).toContainText(hostile);
	await expect(page.locator('#trace tr').first()).toContainText(hostile);
	await page.locator('#audit-tab').click();
	await expect(page.locator('#audit')).toContainText(hostile);
	await expect(page.locator('#messages img, #messages script, #trace img, #trace script, #audit img, #audit script')).toHaveCount(0);
	expect(dialogs).toEqual([]); expect(errors).toEqual([]);
	expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);
});

test('390x844 viewport has no horizontal overflow and supports typing and Enter submission', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
	await page.locator('#question').fill('phone question');
	await page.locator('#question').press('Enter');
	await expect(page.locator('#status')).toHaveText('Answer complete.');
	await page.locator('#audit-tab').click(); await expect(page.locator('#audit tr')).toHaveCount(1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expect(page.locator('#question')).toBeEnabled();
	const box = await page.locator('#question').boundingBox();
	expect(box!.width).toBeGreaterThan(200); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
