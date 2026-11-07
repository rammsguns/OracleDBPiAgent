import { sampleTop } from '../../src/top/index.js';
import { describe, it, expect } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { readWebOperations, validateWebOperations, compactWebTop } from '../../src/web/operations.js';
describe('web operations adapter', () => {
	it('validates seconds and rejects extra parameters before connecting', () => {
		for (const seconds of ['4', '121', '5.5', 'abc', '']) expect(() => validateWebOperations('/api/top', { seconds })).toThrow();
		for (const seconds of ['5', '120', undefined]) expect(() => validateWebOperations('/api/top', { seconds })).not.toThrow();
		for (const path of ['/api/backup', '/api/jobs', '/api/top']) expect(() => validateWebOperations(path, { sql: 'SELECT 1' })).toThrow();
	});
	for (const unavailable of [false, true]) it(`aborted jobs request stops after its current query (unavailable=${unavailable})`, async () => {
		let queries = 0, closed = 0;
		const controller = new AbortController();
		const ctx = {
			config: { targets: [{ name: 'd1-19c-lab' }], limits: { maxRows: 200, statementTimeoutSeconds: 15 } },
			runId: 'test', audit: { record: async () => {} },
			sessions: { get: async () => ({
				target: { name: 'd1-19c-lab' }, identity: { isCdb: false }, close: async () => { closed++; },
				query: async () => {
					queries++; controller.abort();
					if (unavailable) throw new Error('ORA-00942');
					return { rows: [], columns: [], truncated: false, elapsedMs: 1 };
				},
			}) },
		} as unknown as ToolContext;
		await expect(readWebOperations(ctx, 'd1-19c-lab', '/api/jobs', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(queries).toBe(1); expect(closed).toBe(1);
	});
	it('does not acquire a jobs session for an already-aborted request', async () => {
		let acquired = 0;
		const controller = new AbortController(); controller.abort();
		const ctx = {
			config: { targets: [{ name: 'd1-19c-lab' }] },
			sessions: { get: async () => { acquired++; throw new Error('Unexpected acquisition'); } },
		} as unknown as ToolContext;
		await expect(readWebOperations(ctx, 'd1-19c-lab', '/api/jobs', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(acquired).toBe(0);
	});
	it('cancellation interrupts the Node wait and prevents second snapshot reads', async () => {
		let queries = 0; const events: unknown[] = []; const controller = new AbortController();
		const ctx = { runId: 'test', audit: { record: async (event: unknown) => { events.push(event); } }, sessions: { get: async () => ({ target: { name: 'd1-19c-lab' }, identity: { isCdb: false }, query: async () => {
			queries++; if (queries === 3) controller.abort(); return { rows: [], columns: [], truncated: false, elapsedMs: 1 };
		} }) } } as unknown as ToolContext;
		await expect(readWebOperations(ctx, 'd1-19c-lab', '/api/top', { seconds: '5' }, controller.signal)).rejects.toThrow();
		expect(queries).toBe(3); expect(events).toHaveLength(3);
		expect(JSON.stringify(events)).toContain('sqlSha256'); expect(JSON.stringify(events)).not.toContain('SELECT');
	});
});

it('bounds a full SQL-cache payload while preserving rankings and exact counter state counts', async () => {
	let pass = 0, clock = 0;
	const result = await sampleTop({ target: { name: 'd1-19c-lab' }, identity: {}, query: async (sql: string) => {
		const sqlRows = sql.includes('FROM V$SQLSTATS'); if (sqlRows) pass++;
		return { rows: sqlRows ? Array.from({ length: 10000 }, (_, i) => [String(i), ...Array(5).fill(pass === 1 ? 10 : i === 0 ? 20 : 5)]) : [], truncated: false };
	} } as any, 5, { now: () => clock += 1000, sleep: async () => {} });
	const web = compactWebTop(result);
	expect(web.sql.rankings).toEqual(result.sql.rankings);
	expect(web.sql.counterSummary).toContainEqual({ metric: 'elapsedUs', state: 'reset', count: 9999 });
	expect(web.sql.counterSummary).toContainEqual({ metric: 'elapsedUs', state: 'measured', count: 1 });
	expect(web.sql.counters.elapsedUs).toHaveLength(100);
	expect(Buffer.byteLength(JSON.stringify(web))).toBeLessThan(1024 * 1024);
});
