import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('live read-only Security captures on both approved targets, light and dark', async ({ page }) => {
	test.skip(process.env.PIAGENT_SECURITY_LIVE !== '1', 'Set PIAGENT_SECURITY_LIVE=1 for Oracle-only screenshots; no LLM calls');
	test.setTimeout(120_000);
	const child = spawn(process.execPath, ['--import', 'tsx', 'tests/browser/security-live-server.ts'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
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
		await page.goto(url); await page.locator('#security-tab').click();
		await mkdir('docs/img', { recursive: true });
		for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
			await page.locator('#security-target').selectOption(target);
			await page.locator('#security-object').fill(target.startsWith('d1') ? 'HR.EMPLOYEES' : 'SHOPAPP.ORDERS');
			await page.locator('#security-run').click();
			await expect(page.locator('#security-status')).toContainText('Loaded.', { timeout: 60000 });
			await expect(page.locator('.security-paths')).toContainText(target.startsWith('d1') ? 'HR → HR.EMPLOYEES' : 'SHOPAPP → SHOPAPP.ORDERS');
			await expect(page.locator('.security-check[open]')).toHaveCount(0);
			for (const width of [1280, 390]) for (const colorScheme of ['light', 'dark'] as const) {
				await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
				await page.emulateMedia({ colorScheme });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				await page.screenshot({ path: `docs/img/security-${target}-${colorScheme}-${width}.png`, fullPage: true });
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
