import { randomUUID } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { compareTargets, parseScope, renderDriftMarkdown, type DriftOptions } from './index.js';
export async function runDrift(options: DriftOptions & { json?: boolean; out?: string }): Promise<void> {
	const config = loadConfig();
	parseScope(options.scope);
	if (![options.left, options.right].every(name => config.targets.some(t => t.name === name))) throw new Error('Unknown drift target');
	const sessions = createSessionProvider(config);
	try {
		const result = await compareTargets({ config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() }, { left: options.left, right: options.right, scope: options.scope });
		const markdown = renderDriftMarkdown(result);
		if (options.out) {
			const directory = resolve(options.out);
			await mkdir(directory, { recursive: true, mode: 0o700 });
			const stat = await lstat(directory);
			if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Drift output must be a real directory');
			const stem = join(directory, `drift-${randomUUID()}`);
			await writeFile(stem + '.md', markdown, { mode: 0o600, flag: 'wx' });
			await writeFile(stem + '.json', JSON.stringify(result) + '\n', { mode: 0o600, flag: 'wx' });
		}
		console.log(options.json ? JSON.stringify(result) : markdown);
		process.exitCode = result.hasDrift ? 3 : result.complete ? 0 : 1;
	} finally { await sessions.closeAll(); }
}
