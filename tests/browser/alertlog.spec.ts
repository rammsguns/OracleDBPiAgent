import { test, expect } from '@playwright/test';

test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
for (const colorScheme of ['light', 'dark'] as const) test(`Alert Log filters, folded evidence and export in ${colorScheme}`, async ({ page }) => {
	await page.emulateMedia({ colorScheme });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator('#alertlog-tab').click();
	await page.locator('#alertlog-target').selectOption('p1-19c-prod');
	await page.locator('#alertlog-since').fill('7d');
	await page.locator('#alertlog-codes').fill('ORA-00600');
	await page.locator('#alertlog-text').fill('incident');
	const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/alertlog');
	await page.locator('#alertlog-run').click();
	const params = new URL((await response).url()).searchParams;
	expect(Object.fromEntries(params)).toMatchObject({ target: 'p1-19c-prod', since: '7d', codes: 'ORA-00600', text: 'incident' });
	await expect(page.locator('#alertlog-content')).toContainText('×3');
	await expect(page.locator('#alertlog-content')).toContainText('Critical (1)');
	await expect(page.locator('#alertlog-content')).toContainText('Incident 124');
	await expect(page.locator('#alertlog-content')).toContainText('[metadata capped]');
	await expect(page.locator('#alertlog-content')).toContainText('partial result');
	await expect(page.locator('#alertlog-content img, #alertlog-content script')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const download = page.waitForEvent('download'); await page.locator('#alertlog-export').click();
	const file = await download; expect(file.suggestedFilename()).toBe('alertlog.md');
	const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
	expect(Buffer.concat(chunks).toString()).toContain('ORA-00600');
});
test('optional triage alert shape and correlation', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await page.locator('#triage-issue').fill('ORA-00600'); await page.locator('#triage-run').click();
	await expect(page.locator('#triage-content .alert-evidence')).toContainText('Job run: NIGHTLY_PURGE_JOB');
	await expect(page.locator('#triage-content .alert-evidence')).toContainText('Alert entries 1');
});
test('unavailable, empty, skipped and failed requests recover without stale export', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#alertlog-tab').click();
	for (const status of ['unavailable', 'skipped', 'ok']) {
		await page.route('**/api/alertlog?*', route => route.fulfill({ json: { entries: { status, window: { from: 'start', to: 'end' }, rows: [], grants: status === 'unavailable' ? ['GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_RO;'] : [] }, incidents: { status, rows: [], grants: [] }, markdown: status } }));
		await page.locator('#alertlog-run').click();
		await expect(page.locator('#alertlog-content')).toContainText(status);
		await expect(page.locator('#alertlog-content')).toContainText('No rows returned');
	}
	await page.route('**/api/alertlog?*', route => route.fulfill({ status: 429, json: { message: 'Busy' } }));
	await page.locator('#alertlog-run').click();
	await expect(page.locator('#alertlog-status')).toContainText('already running');
	await expect(page.locator('#alertlog-export')).toBeDisabled();
	await expect(page.locator('#alertlog-run')).toBeEnabled();
});
test('triage remains usable without alert evidence, and renders unavailable grants once', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await page.locator('#triage-issue').fill('ORA-00600');
	for (const status of ['absent', 'unavailable', 'skipped']) {
		await page.route('**/api/triage', async route => {
			const response = await route.fetch(); const body = await response.json();
			if (status === 'absent') delete body.result.alertLog;
			else body.result.alertLog = { status, window: { from: 'start', to: 'end' }, entries: [], incidents: [], correlations: [], checks: [], grant: status === 'unavailable' ? 'GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_RO;' : undefined };
			await route.fulfill({ json: body });
		});
		await page.locator('#triage-run').click();
		await expect(page.locator('#triage-status')).toContainText('Loaded.');
		await expect(page.locator('#triage-content .alert-evidence')).toHaveCount(status === 'absent' ? 0 : 1);
		if (status === 'unavailable') await expect(page.locator('.alert-evidence pre')).toHaveText('GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_RO;');
	}
});
