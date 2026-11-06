import { describe, it, expect } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { readWebOperations, validateWebOperations } from '../../src/web/operations.js';
describe('web operations adapter', () => {
	it('validates seconds and rejects extra parameters before connecting', () => {
		for (const seconds of ['4', '121', '5.5', 'abc', '']) expect(() => validateWebOperations('/api/top', { seconds })).toThrow();
		for (const seconds of ['5', '120', undefined]) expect(() => validateWebOperations('/api/top', { seconds })).not.toThrow();
		for (const path of ['/api/backup', '/api/jobs', '/api/top']) expect(() => validateWebOperations(path, { sql: 'SELECT 1' })).toThrow();
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
