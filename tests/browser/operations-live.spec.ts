import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('live read-only Backup Jobs Top captures on both approved targets', async ({ page }) => {
	test.skip(process.env.PIAGENT_OPERATIONS_LIVE !== '1', 'Set PIAGENT_OPERATIONS_LIVE=1 for Oracle-only screenshots; no LLM calls');
	test.setTimeout(240_000);
	const child = spawn(process.execPath, ['--import', 'tsx', 'tests/browser/operations-live-server.ts'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
	let port: string | undefined;
	try {
		const url = await new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Capture server startup timed out')), 20000);
			child.once('error', () => { clearTimeout(timer); reject(new Error('Capture server startup failed')); });
			child.once('exit', () => { clearTimeout(timer); reject(new Error('Capture server exited')); });
			child.stdout.on('data', data => {
				const text = String(data); const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)\/#token=[a-f0-9]+/);
				if (match) { port = match[1]; clearTimeout(timer); resolve(match[0]); }
			});
		});
		await page.goto(url);
		await mkdir('docs/img', { recursive: true });
		for (const id of ['backup', 'jobs', 'top']) {
			await page.locator(`#${id}-tab`).click();
			if (id === 'top') await page.locator('#top-seconds').fill('5');
			for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
				await page.locator(`#${id}-target`).selectOption(target);
				const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/${id}`);
				await page.locator(`#${id}-run`).click();
				await expect(page.locator(`#${id}-status`)).toContainText('Loaded.', { timeout: 60000 });
				const result = (await (await response).json()).result;
				const summary = id === 'backup' ? { status: result.status, estimate: result.restoreEstimate, files: result.files.length, gaps: result.gaps.length, evidence: Object.fromEntries(Object.entries(result.evidence).map(([key, value]) => { const e = value as { status: string; rows: unknown[] }; return [key, { status: e.status, rows: e.rows.length }]; })) }
					: id === 'jobs' ? { sections: Object.fromEntries(Object.entries(result.sections).map(([key, value]) => { const e = value as { status: string; rows: unknown[]; truncated: boolean }; return [key, { status: e.status, rows: e.rows.length, truncated: e.truncated }]; })), debt: Object.fromEntries(['invalidObjects', 'indexes', 'indexPartitions', 'indexSubpartitions', 'staleStatistics'].map(key => [key, result.sections[key].rows])) }
					: { status: result.status, requestedSeconds: result.requestedSeconds, intervalSeconds: result.sql.intervalSeconds, counterSummary: result.sql.counterSummary, cpuPercent: result.host.cpuPercent, load: result.load.rows };
				console.log(`${id} ${target}: ${JSON.stringify(summary)}`);
				for (const width of [1280, 390]) {
					await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
					await page.emulateMedia({ colorScheme: 'dark' });
					expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
					await page.locator(`#${id}-panel`).evaluate(node => node.scrollIntoView({ block: 'start' }));
					await page.screenshot({ path: `docs/img/${id}-${target}-dark-${width}.png`, fullPage: false });
				}
			}
		}

	} finally {
		await page.close();
		// Resolve and kill the actual listener, rather than a launcher or shell PID.
		if (port) {
			const listeners = execFileSync('ss', ['-ltnp', 'sport = :' + port], { encoding: 'utf8' });
			const pids = [...listeners.matchAll(/pid=(\d+)/g)].map(match => Number(match[1]));
			if (!pids.length) throw new Error('Capture listening PID could not be resolved');
			for (const pid of pids) process.kill(pid, 'SIGTERM');
		} else if (child.pid) process.kill(child.pid, 'SIGTERM');
	}
});
