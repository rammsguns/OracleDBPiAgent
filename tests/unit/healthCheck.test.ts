import { it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createHealthCheckTool, checkedHealth, healthText, boundedHealthResult, healthChecksWithNames } from '../../src/tools/healthCheck.js';
import type { ToolContext } from '../../src/contracts.js';
import { collectors } from '../../src/check/index.js';
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

for (const [id, phrase, command] of [
	['tablespace:USERS', 'percent used of maximum tablespace allocation', 'space'],
	['tablespaces', 'percent used of maximum tablespace allocation', 'space'],
	['temp:TEMP', 'active temp percent used', 'space'],
	['undo:UNDO', 'active plus unexpired undo percent used', 'space'],
	['recovery', 'recovery area percent used after reclaimable space', 'space'],
	['blocking', 'longest blocked session wait in seconds', 'sessions'],
	['backupAge', 'hours since oldest latest full/level-0 backup', 'backup'],
	['archiveGaps', 'missing archived-log sequence ranges', 'backup'],
	['failedJobs', 'failed scheduler runs in the lookback window', 'jobs'],
	['alertErrors', 'ORA- error occurrences in the alert log lookback window', 'alertlog'],
	['incidents', 'diagnostic incidents in the lookback window', 'alertlog'],
	['maintenance', 'invalid objects plus unusable index/partition/subpartition units (non-Oracle-maintained owners)', 'jobs'],
	['expiry', 'days until nearest unlocked application-account password expiry', 'security'],
	['defaultPasswords', 'open accounts using default passwords', 'security'],
]) it(`${id} explains its measure and drill-down for every emitted status`, () => {
	for (const status of ['WARN', 'CRIT', 'UNKNOWN', 'SKIPPED', 'OK'] as const) {
		const run: CheckRun = {version:1,capturedAt:'now',status:'WARN',targets:[{target:'lab',status:'WARN',checks:[{
			id:id!,status,observedStatus:'UNKNOWN',value:null,display:'UNKNOWN',unit:'',threshold:null,
			scope:'This PDB',command:`piagent ${command} --target lab`,note:'Window: 1h; ORA-00942',
		}]}]};
		const text = healthText(run);
		expect(text).toContain(`measures: ${phrase}`);
		expect(text).toContain(`piagent ${command} --target lab`);
		expect(text).toContain('Window: 1h; ORA-00942');
	}
});

it('combines invalid objects with every index unit type and caps all name lists deterministically', async () => {
	const ctx = context(), query = vi.fn(async () => ({columns:['OWNER','OBJECT_NAME','OBJECT_TYPE'],rows:[['APP','INVALID_CUSTOMER_VIEW','VIEW']],truncated:false,elapsedMs:0}));
	ctx.sessions.get = async () => ({target:ctx.config.targets[0]!,identity:{isCdb:false},close:async()=>{},query}) as never;
	const section = (rows: Record<string, unknown>[]) => ({status:'ok',truncated:false,rows});
	const jobs = vi.fn(async () => ({sections:{
		runs:section(Array.from({length:8}, (_,i) => ({OWNER:'APP',JOB_NAME:`JOB${7-i}`,STATUS:'FAILED'})).concat([{OWNER:'APP',JOB_NAME:'password=hidden',STATUS:'FAILED'}])),
		invalidObjects:section([{OWNER:'APP',OBJECT_COUNT:1}]),
		indexes:section([{OWNER:'SYS',INDEX_NAME:'INTERNAL'}, {OWNER:'APP',INDEX_NAME:'IDX'}]),
		indexPartitions:section([{INDEX_OWNER:'APP',INDEX_NAME:'IDX',PARTITION_NAME:'P1'}]),
		indexSubpartitions:section([{INDEX_OWNER:'APP',INDEX_NAME:'IDX',PARTITION_NAME:'P1',SUBPARTITION_NAME:'S1'}]),
	}}));
	const security = vi.fn(async () => ({checks:[{id:'accounts',status:'ok',evidence:[{label:'users',status:'ok',rows:[['APP','N','OPEN',null,null],['SYS','Y','OPEN',null,null]]}],findings:[]},
		{id:'default-passwords',status:'ok',evidence:[],findings:Array.from({length:8}, (_,i) => ({subject:`USER${7-i}`}))}]}));
	const unavailable = async () => { throw new Error('ORA-00942'); };
	const readers = {...collectors,space:unavailable,sessions:unavailable,backup:unavailable,alerts:unavailable,incidents:unavailable,jobs,security} as unknown as typeof collectors;
	const run = await healthChecksWithNames(ctx, [ctx.config.targets[0]!.name], undefined, readers);
	const text = healthText(run);
	expect(text).toContain('APP.JOB0, APP.JOB1, APP.JOB2, APP.JOB3, APP.JOB4');
	expect(text).not.toContain('JOB5'); expect(text).not.toContain('hidden');
	expect(text).toContain('APP.IDX, APP.IDX.P1, APP.IDX.P1.S1, APP.INVALID_CUSTOMER_VIEW (VIEW)');
	expect(text).toContain('APP.JOB4 +3 more');
	expect(text).toContain('USER4 +3 more');
	expect(text).not.toContain('SYS.INTERNAL');
	expect(text).toContain('USER0, USER1, USER2, USER3, USER4'); expect(text).not.toContain('USER5');
	expect(jobs).toHaveBeenCalledTimes(1); expect(security).toHaveBeenCalledTimes(2);
	expect(query).toHaveBeenCalledTimes(1);
	expect(query).toHaveBeenCalledWith(expect.stringContaining("u.ORACLE_MAINTAINED = 'N'"), {}, expect.objectContaining({maxRows:ctx.config.limits.maxRows, timeoutSeconds:expect.any(Number)}));
});

function criticalDefaultPasswords(note = ''): CheckRun {
	return {version:1,capturedAt:'now',status:'CRIT',targets:[{target:'lab',status:'CRIT',checks:[{
		id:'defaultPasswords',status:'CRIT',value:5,display:'5 accounts',unit:'accounts',threshold:null,
		scope:'Database-wide (non-CDB)',command:'piagent security --target lab',note,
	}]}]};
}
it('keeps CRIT in the defaultPasswords check line after credential redaction', () => {
	const output = boundedHealthResult(criticalDefaultPasswords(), 4096);
	expect(output.content[0]!.text).toContain('lab defaultPasswords CRIT 5 accounts; measures: open accounts using default passwords');
	expect(output.content[0]!.text).toContain('piagent security --target lab');
	expect(output.details).toEqual({status:'CRIT',truncated:false});
});
it('still redacts credential-looking names and evidence while preserving defaultPasswords CRIT', () => {
	const run = criticalDefaultPasswords('Names (up to 5): APP.API_KEY=name_canary; password=evidence_canary');
	run.targets[0]!.target = 'token=target_canary';
	const text = healthText(run);
	expect(text).toContain('defaultPasswords CRIT 5 accounts');
	for (const secret of ['name_canary', 'evidence_canary', 'target_canary']) expect(text).not.toContain(secret);
	expect(text).toContain('[REDACTED]');
});

it.each(['complete', 'capped', 'unavailable', 'many'] as const)('names mixed maintenance units with %s invalid-object details', async mode => {
	const ctx = context();
	ctx.sessions.get = async () => ({target:ctx.config.targets[0]!,identity:{isCdb:false},close:async()=>{},query:async () => ({columns:['OWNER','OBJECT_NAME','OBJECT_TYPE'],rows:mode === 'many' ? Array.from({length:7}, (_,i) => ['SHOPAPP', `INVALID_VIEW_${i}`, 'VIEW']) : [['SHOPAPP','INVALID_CUSTOMER_VIEW','VIEW']],truncated:mode === 'capped',elapsedMs:0})}) as never;
	if (mode === 'unavailable') {
		const get = ctx.sessions.get;
		ctx.sessions.get = async target => ({...await get(target), query:async () => {throw new Error('ORA-00942');}});
	}
	const section = (rows: Record<string, unknown>[]) => ({status:'ok',truncated:false,rows});
	const unavailable = async () => { throw new Error('ORA-00942'); };
	const readers = {...collectors,space:unavailable,sessions:unavailable,backup:unavailable,alerts:unavailable,incidents:unavailable,
		jobs:async()=>({sections:{runs:section([]),invalidObjects:section([{OWNER:'SHOPAPP',OBJECT_COUNT:mode === 'many' ? 7 : mode === 'capped' ? 3 : 1}]),indexes:section([]),indexPartitions:section([{INDEX_OWNER:'SHOPAPP',INDEX_NAME:'HISTORY_ORDER_IX',PARTITION_NAME:'P_202601'}]),indexSubpartitions:section([])}}),
		security:async()=>({checks:[{id:'accounts',status:'ok',evidence:[{label:'users',status:'ok',rows:[['SHOPAPP','N','OPEN',null,null]]}],findings:[]},{id:'default-passwords',status:'ok',evidence:[],findings:[]}]}),
	} as unknown as typeof collectors;
	const run = await healthChecksWithNames(ctx, [ctx.config.targets[0]!.name], undefined, readers);
	const maintenance = run.targets[0]!.checks.find(c => c.id === 'maintenance')!;
	expect(maintenance.value).toBe(mode === 'many' ? 8 : mode === 'capped' ? 4 : 2);
	expect(maintenance.status).toBe('WARN');
	if (mode === 'complete') expect(maintenance.note).toContain('Names (up to 5): SHOPAPP.HISTORY_ORDER_IX.P_202601, SHOPAPP.INVALID_CUSTOMER_VIEW (VIEW).');
	if (mode === 'capped') {
		expect(maintenance.note).toContain('SHOPAPP.INVALID_CUSTOMER_VIEW (VIEW) +2 more');
		expect(maintenance.note).toContain('Invalid-object names incomplete/unavailable');
	}
	if (mode === 'unavailable') {
		expect(maintenance.note).toContain('SHOPAPP.HISTORY_ORDER_IX.P_202601 +1 more');
		expect(maintenance.note).toContain('Invalid-object names incomplete/unavailable');
		expect(maintenance.note).not.toContain('INVALID_CUSTOMER_VIEW');
	}
	if (mode === 'many') {
		expect(maintenance.note).toContain('SHOPAPP.INVALID_VIEW_3 (VIEW) +3 more');
		expect(maintenance.note).not.toContain('INVALID_VIEW_4');
	}
});
