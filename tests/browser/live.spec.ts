import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { test, expect } from '@playwright/test';

test.skip(process.env.PIAGENT_BROWSER_LIVE !== '1', 'Set PIAGENT_BROWSER_LIVE=1 for one real, sequential Strata question');

test('live d1 read-only browser smoke', async ({ page }) => {
	test.skip(process.env.PIAGENT_BROWSER_LIVE !== '1', 'Set PIAGENT_BROWSER_LIVE=1 for one real, sequential Strata question');
	test.setTimeout(360_000);
	let health: any;
	try { health = await (await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(5000) })).json(); }
	catch { test.skip(true, 'Strata health unavailable'); }
	test.skip(health?.loaded === false || health?.model_loaded === false || !['ok', 'loaded', 'healthy'].includes(health?.status), 'Strata is unloaded or unhealthy; leave its configuration untouched');
	const reservation = createServer();
	await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
	const address = reservation.address();
	if (!address || typeof address === 'string') throw new Error('Missing live port');
	await new Promise<void>(resolve => reservation.close(() => resolve()));
	const dir = await mkdtemp(join(tmpdir(), 'piagent-browser-live-'));
	const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'web', '--port', String(address.port)], {
		env: { ...process.env, PIAGENT_AUDIT_FILE: join(dir, 'audit.jsonl') }, stdio: ['ignore', 'pipe', 'pipe'],
	});
	// Capture the credential URL in memory only; never include CLI output in reports.
	const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
	try {
		const url = await new Promise<string>((resolve, reject) => {
			let output = '';
			const timer = setTimeout(() => reject(new Error('Live web startup timed out')), 20_000);
			child.stdout.on('data', chunk => {
				output += chunk.toString();
				const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]+/);
				if (match) { clearTimeout(timer); resolve(match[0]); }
			});
			child.once('error', () => { clearTimeout(timer); reject(new Error('Live web could not start')); });
			child.once('exit', () => { clearTimeout(timer); reject(new Error('Live web exited before startup')); });
		});
		await page.goto(url);
		await expect(page.locator('#question')).toBeEnabled({ timeout: 60_000 });
		await expect(page.locator('#refresh')).toBeEnabled({ timeout: 60_000 });
		await page.locator('#target').selectOption('d1-19c-lab');
		await expect(page.locator('#question')).toBeEnabled({ timeout: 60_000 });
		await page.locator('#question').fill('Using list_targets only, what is the name and environment of the d1 target?');
		await page.locator('#send').click();
		await expect(page.locator('#status')).toHaveText('Answer complete.', { timeout: 300_000 });
		await expect(page.locator('.answer')).toContainText('d1-19c-lab');
	} finally {
		await page.close(); child.kill('SIGTERM');
		await Promise.race([exited, new Promise<void>(resolve => setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000))]);
		await rm(dir, { recursive: true, force: true });
	}
});
