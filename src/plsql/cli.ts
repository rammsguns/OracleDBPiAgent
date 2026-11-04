import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { documentPlsql, listPlsql, renderPlsqlMarkdown } from './index.js';
import { objectName, identifier } from './dictionary.js';
export async function runPlsql(kind: 'list' | 'doc', options: { target: string; owner?: string; object?: string; json?: boolean; out?: string }): Promise<void> {
	if (kind === 'doc') objectName(options.object ?? '');
	if (options.owner) identifier(options.owner);
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new Error('Unknown PL/SQL target');
	const sessions = createSessionProvider(config);
	try {
		const ctx = { config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() };
		if (kind === 'list') {
			const result = await listPlsql(ctx, options.target, options.owner);
			console.log(options.json ? JSON.stringify(result) : [`PL/SQL objects: ${result.status}; ${result.view}`, ...result.attempts.map(a => `${a.view}: ${a.code}`), ...result.rows.map(r => `${r.owner}.${r.name} ${r.type} ${r.status} lines=${r.lines}${r.sourceTruncated ? '+' : ''} source=${r.sourceStatus} ${r.sourceView} ${r.sourceAttempts.map(a => a.code).join(',')} DDL=${r.lastDdl}`), ...(result.truncated ? ['Object row cap reached; partial list.'] : [])].join('\n'));
			return;
		}
		const result = await documentPlsql(ctx, options.target, options.object!);
		const markdown = renderPlsqlMarkdown(result);
		if (options.out) {
			const directory = resolve(options.out);
			await mkdir(directory, { recursive: true, mode: 0o700 });
			const stat = await lstat(directory);
			if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('PL/SQL output must be a real directory');
			const stem = join(directory, `plsql-${randomUUID()}`);
			const files = [[stem + '.md', markdown], [stem + '.json', JSON.stringify(result) + '\n']] as const;
			const temps: string[] = [];
			let markdownPublished = false, committed = false;
			try {
				for (const [file, content] of files) {
					const temp = `${file}.${randomUUID()}.tmp`; temps.push(temp);
					await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
				}
				await rename(temps[0]!, files[0][0]); markdownPublished = true;
				// JSON is the commit marker: publish it only after Markdown is complete.
				await rename(temps[1]!, files[1][0]); committed = true;
			} finally {
				const cleanup = [...temps, ...(!committed && markdownPublished ? [files[0][0]] : [])];
				await Promise.all(cleanup.map(file => unlink(file).catch(error => {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
				})));
			}
		}
		console.log(options.json ? JSON.stringify(result) : markdown);
	} finally { await sessions.closeAll(); }
}
