import { it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createHealthCheckTool, checkedHealth, healthText, boundedHealthResult } from '../../src/tools/healthCheck.js';
import type { ToolContext } from '../../src/contracts.js';
import type { CheckRun } from '../../src/check/index.js';
afterEach(() => vi.unstubAllEnvs());
function context() {
	vi.stubEnv('PIAGENT_HOME', '/nonexistent-piagent-test-home');
	return { config: loadConfig({}), runId: 'health-test', sessions: { get: vi.fn(async () => { throw new Error('ORA-00942'); }), closeAll: vi.fn() }, audit: { record: vi.fn(async () => {}) } } as ToolContext;
}
it('has only the existing optional target parameter and a short description', () => {
	const tool = createHealthCheckTool(context());
	expect(Object.keys(tool.parameters.properties)).toEqual(['target']);
	expect(tool.description.length).toBeLessThan(180);
});
it('missing grants produce UNKNOWN compact sourced text, no OK rows', async () => {
	const ctx = context(), tool = createHealthCheckTool(ctx);
	const result = await tool.execute('id', {}, new AbortController().signal);
	const text = result.content[0] as {text: string};
	expect(text.text).toContain('Health UNKNOWN:'); expect(text.text).toContain('13 UNKNOWN');
	expect(text.text).toContain('ORA-00942'); expect(text.text).toContain('point-in-time and windowed');
	expect(text.text.split('\n')).toHaveLength(14);
});
it('respects pinned targets and rejects unknown targets before database access', async () => {
	const ctx = context(); ctx.pinnedTarget = 'p1-19c-prod';
	await expect(createHealthCheckTool(ctx).execute('id', {target:'d1-19c-lab'})).rejects.toThrow('pinned');
	ctx.pinnedTarget = undefined;
	await expect(createHealthCheckTool(ctx).execute('id', {target:'unknown'})).rejects.toThrow('configured');
	expect(ctx.sessions.get).not.toHaveBeenCalled();
});
it('pre-aborted and mid-run signals throw rather than return UNKNOWN', async () => {
	const ctx = context(), abort = new AbortController(); abort.abort();
	await expect(checkedHealth(ctx, ['d1-19c-lab'], abort.signal)).rejects.toThrow();
	expect(ctx.sessions.get).not.toHaveBeenCalled();
	const mid = new AbortController();
	await expect(checkedHealth(ctx, ['d1-19c-lab'], mid.signal, async () => { mid.abort(); return {} as CheckRun; })).rejects.toThrow();
});
it('suppresses OK rows, preserves skipped and UNKNOWN policy notes, redacts credentials', () => {
	const base = { value: null, unit: '', threshold: null, display:'UNKNOWN', scope:'This PDB', command:'piagent space', note:'password=hidden' };
	const run: CheckRun = {version:1, capturedAt:'now', status:'UNKNOWN', targets:[{target:'lab',status:'UNKNOWN',checks:[{...base,id:'ok-row',status:'OK'},{...base,id:'missing',status:'UNKNOWN'},{...base,id:'disabled',status:'SKIPPED'},{...base,id:'mapped',status:'OK',observedStatus:'UNKNOWN',note:'Policy unknownAs=ok maps UNKNOWN to OK.'}]}]};
	const text = healthText(run); expect(text).not.toContain('ok-row'); expect(text).toContain('SKIPPED'); expect(text).not.toContain('hidden'); expect(text).toContain('2 OK'); expect(text).toContain('mapped: OK UNKNOWN'); expect(text).toContain('Policy unknownAs=ok');
});
it('caps UTF-8 output and does not put uncapped rows in details', async () => {
	const ctx = context(); ctx.config.limits.maxToolResultBytes = 400;
	const result = await createHealthCheckTool(ctx).execute('id', {});
	expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(400);
	expect(result.details).toEqual({status:'UNKNOWN',truncated:true});
});
it('mid-query abort prevents every subsequent native query without closing the shared provider', async () => {
	const ctx = context(), abort = new AbortController(); let calls = 0;
	ctx.sessions.get = async () => ({target:ctx.config.targets[0]!,identity:{isCdb:false},close:async()=>{},query:async()=>{calls++;abort.abort();return {columns:[],rows:[],truncated:false,elapsedMs:0};}}) as never;
	await expect(checkedHealth(ctx,['d1-19c-lab'],abort.signal)).rejects.toThrow();
	expect(calls).toBe(1); expect(ctx.sessions.closeAll).not.toHaveBeenCalled();
});
it('checks all selected targets sequentially with one shared provider', async () => {
	const ctx = context(), targets=ctx.config.targets.map(t=>t.name);
	const run = await checkedHealth(ctx,targets);
	expect(run.targets.map(t=>t.target)).toEqual(targets); expect(run.status).toBe('UNKNOWN'); expect(ctx.sessions.closeAll).not.toHaveBeenCalled();
});

it('caps escaped and multibyte text including the result envelope at the minimum budget', () => {
	const run: CheckRun = { version:1, capturedAt:'now', status:'OK', targets:[{ target:'中文"'.repeat(50), status:'OK', checks:[] }] };
	for (const cap of [128, 200, 400, 1000]) {
		const output=boundedHealthResult(run,cap);
		expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(cap);
		expect(output.content[0]!.text).not.toContain('\uFFFD');
	}
});
