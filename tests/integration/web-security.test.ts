import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readWebSecurity } from '../../src/web/security.js';
import { JsonlAuditSink } from '../../src/audit/index.js';
for (const [target, whoCan] of [['d1-19c-lab', 'HR.EMPLOYEES'], ['p1-19c-prod', 'SHOPAPP.ORDERS']] as const) it(`reads and audits web Security on ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved credentials unavailable'); return; }
	const dir = await mkdtemp(join(tmpdir(), 'web-security-')), sessions = createSessionProvider(loadConfig());
	try {
		const auditFile = join(dir, 'audit.jsonl');
		const output = await readWebSecurity({ config: loadConfig(), sessions, audit: new JsonlAuditSink(auditFile), runId: 'web-security-smoke', pinnedTarget: target }, target, { whoCan }, {});
		expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThan(1024 * 1024);
		expect(output.result.status).toBe('ok');
		expect(output.result.checks.every(c => c.status === 'ok')).toBe(true);
		expect(output.result.whoCan?.some(p => p.source === 'owner' && p.object === whoCan)).toBe(true);
		expect(output.markdown).toContain('# Security Posture: ' + target);
		const records = (await readFile(auditFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
		expect(records.length).toBeGreaterThan(7);
		for (const record of records) {
			expect(record).toMatchObject({ kind: 'tool_call', tool: 'web:security', target, sqlSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
			expect(record).not.toHaveProperty('binds'); expect(record).not.toHaveProperty('sql');
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved database ${target} unavailable`); return; }
		throw error;
	} finally { await sessions.closeAll(); await rm(dir, { recursive: true, force: true }); }
}, 60000);
