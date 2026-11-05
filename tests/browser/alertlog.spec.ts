import { mkdir } from 'node:fs/promises';
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
	await expect(page.locator('#triage-content .alert-evidence')).toContainText('Job run: Alert log within ±10 minutes of SHOPAPP.NIGHTLY_PURGE_JOB');
	await expect(page.locator('#triage-content .alert-evidence')).toContainText('Alert entries 1');
	if (process.env.PIAGENT_ALERTLOG_CAPTURE_FIXTURE === '1') {
		await mkdir('docs/img', { recursive: true });
		await page.setViewportSize({ width: 1280, height: 1000 });
		await page.locator('#triage-content .alert-evidence').screenshot({ path: 'docs/img/alertlog-triage-fixture.png' });
	}
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

for (const width of [1280, 390]) test(`message disclosure, compact traces, capped badges and dark shell at ${width}px`, async ({ page }) => {
	await page.setViewportSize({ width, height: 900 });
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#alertlog-tab').click();
	await page.locator('#alertlog-run').click();
	const content = page.locator('#alertlog-content');
	await expect(content.locator('.incident-badge')).toHaveCount(5);
	await expect(content.locator('.incident-more')).toHaveText('+2 more');
	const full = content.locator('.alert-full-message');
	await expect(full).not.toHaveAttribute('open', '');
	await expect(full.locator('.alert-message-text')).not.toBeVisible();
	await expect(content.locator('.alert-message-preview')).toBeVisible();
	const previewHeight = await content.locator('.alert-message-preview').evaluate(node => ({ height: node.getBoundingClientRect().height, line: parseFloat(getComputedStyle(node).lineHeight) }));
	expect(previewHeight.height).toBeLessThanOrEqual(previewHeight.line * 3 + 1);
	await full.locator('summary').click();
	await expect(full.locator('.alert-message-text')).toBeVisible();
	await expect(full.locator('.alert-message-text')).toContainText('Final diagnostic line');
	await expect(full.locator('.alert-message-text')).not.toContainText('/opt/oracle/diag/');
	await full.locator('summary').click();
	await expect(full.locator('.alert-message-text')).not.toBeVisible();
	const traces = content.locator('.alert-traces');
	await expect(traces.locator('summary')).toHaveText('Trace files (1)');
	await expect(traces.locator('li')).not.toBeVisible();
	await traces.locator('summary').click();
	await expect(traces.locator('li')).toHaveText('example.trc');
	await expect(traces.locator('li')).toHaveAttribute('title', '/opt/oracle/diag/example.trc');
	await expect(content.locator('th').last()).toHaveText('Status code');
	await expect(content.locator('td').first()).toHaveText('2026-11-04 11:00:00Z\n2026-11-04 12:00:00Z');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	for (const selector of ['html', 'body', '.evidence', '[role="tablist"]']) {
		expect(await page.locator(selector).evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(25, 40, 46)');
	}
	if (width === 1280) {
		const columns = await content.locator('.alert-entries tr').nth(1).locator('td').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
		expect(columns[3]).toBeGreaterThan(columns[0]! + columns[1]! + columns[2]!);
	}
});

test('trace basenames stay in messages and disclosure tracks actual overflow on resize', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.route('**/api/alertlog?*', async route => {
		const response = await route.fetch(); const body = await response.json();
		const base = body.entries.rows[0];
		body.entries.rows = [
			{ ...base, messageText: 'Errors in file /opt/oracle/diag/PRODCDB_j005_704.trc:', traceFiles: ['/opt/oracle/diag/PRODCDB_j005_704.trc'] },
			{ ...base, messageText: 'word '.repeat(40), traceFiles: [] },
		];
		await route.fulfill({ json: body });
	});
	await page.locator('#alertlog-tab').click(); await page.locator('#alertlog-run').click();
	const messages = page.locator('#alertlog-content .alert-message');
	await expect(messages.first().locator('.alert-message-preview')).toHaveText('Errors in file PRODCDB_j005_704.trc:');
	await expect(messages.first().locator('.alert-full-message')).toBeHidden();
	await expect(messages.nth(1).locator('.alert-full-message')).toBeHidden();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(messages.nth(1).locator('.alert-full-message')).toBeVisible();
	await expect(messages.first().locator('.alert-full-message')).toBeHidden();
	await page.locator('#plsql-tab').click(); await page.locator('#alertlog-tab').click();
	await expect(messages.nth(1).locator('.alert-full-message')).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(messages.nth(1).locator('.alert-full-message')).toBeHidden();
});

test('every evidence tab has the same dark shell, including PL/SQL', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	for (const tab of ['trace', 'audit', 'report', 'drift', 'plsql', 'triage', 'alertlog']) {
		await page.locator(`#${tab}-tab`).click();
		for (const selector of ['html', 'body', '.chat', '.evidence', '[role="tablist"]']) {
			expect(await page.locator(selector).evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(25, 40, 46)');
		}
	}
	await page.locator('#plsql-tab').click();
	await page.locator('#plsql-owner').fill('WORKLOAD_FIXTURE');
	await page.locator('#plsql-run').click();
	await expect(page.locator('#plsql-object option')).toHaveCount(1);
	await page.locator('#plsql-doc').click();
	await expect(page.locator('#plsql-content .graph-scroll > svg')).toBeVisible();
	if (process.env.PIAGENT_ALERTLOG_CAPTURE_FIXTURE === '1') {
		await mkdir('docs/img', { recursive: true });
		await page.screenshot({ path: 'docs/img/plsql-dark-shell.png', fullPage: true });
		await page.emulateMedia({ colorScheme: 'light' });
		await page.screenshot({ path: 'docs/img/plsql-light-shell.png', fullPage: true });
	}
});
