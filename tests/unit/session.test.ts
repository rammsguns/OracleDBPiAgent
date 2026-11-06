import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ connect: vi.fn(), read: vi.fn() }));
vi.mock('oracledb',()=>({default:{thin:true,getConnection:mocks.connect,OUT_FORMAT_ARRAY:4001}}));
vi.mock('node:fs/promises',()=>({readFile:mocks.read}));
import { createSessionProvider, previewValue } from '../../src/oracle/index.js';
import type { AppConfig } from '../../src/contracts.js';
const config = {defaultTarget:'d1-19c-lab', secretDir:'/secrets',targets:[{name:'d1-19c-lab',host:'localhost',port:1522,serviceName:'ORCL',username:'HARNESS_LAB',passwordFile:'d1_lab.pw',defaultSchema:'HR',environment:'development',description:'Test'}],limits:{maxRows:2,statementTimeoutSeconds:3}} as AppConfig;
beforeEach(()=>{vi.resetAllMocks(); process.env.PIAGENT_SECRET_DIR='/secrets';mocks.read.mockResolvedValue('test-only');});
function connection(version='19.9.1.0.0') {
	const rs = {getRows:vi.fn().mockResolvedValue([[1],[2],[3]]),close:vi.fn()};
	const c = {callTimeout:0,execute:vi.fn().mockResolvedValue({metaData:[{name:'N'}],resultSet:rs}),rollback:vi.fn(),close:vi.fn()};
	c.execute.mockResolvedValueOnce({rows:[[version]]}).mockResolvedValueOnce({rows:[['HARNESS_LAB','FALSE',null,'0','ORCL']]}).mockResolvedValueOnce({rows:[['CREATE SESSION']]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[['ORCL','orcl','host','NO','HARNESS_LAB','HR']]});
	mocks.connect.mockResolvedValue(c); return {c,rs};
}
it('sets schema and timeout, fetches one extra row and rolls back',async()=>{
	const {c,rs}=connection(); const provider=createSessionProvider(config); const s=await provider.get(); const r=await s.query('SELECT 1 FROM dual');
	expect(c.callTimeout).toBe(3000); expect(c.execute.mock.calls[4]?.[0]).toContain('CURRENT_SCHEMA = "HR"');
	expect(c.execute.mock.calls.some(call=>call[0]==='SET TRANSACTION READ ONLY')).toBe(true);
	expect(rs.getRows).toHaveBeenCalledWith(3);expect(r.rows).toEqual([[1],[2]]);expect(r.truncated).toBe(true);expect(c.rollback).toHaveBeenCalledTimes(2);
	await provider.closeAll();expect(c.close).toHaveBeenCalledOnce();
});
it('refuses before DB execution and rolls back execution failures',async()=>{
	const {c}=connection();const p=createSessionProvider(config);const s=await p.get();const before=c.execute.mock.calls.length;
	await expect(s.query('DELETE FROM x')).rejects.toThrow();expect(c.execute).toHaveBeenCalledTimes(before);
	c.execute.mockRejectedValueOnce(new Error('timeout')); await expect(s.query('SELECT 1 FROM dual')).rejects.toThrow('timeout');expect(c.rollback).toHaveBeenCalledTimes(2);await p.closeAll();
});
it('closes a refused-version connection before setting schema',async()=>{
	const {c}=connection('26.0'); await expect(createSessionProvider(config).get()).rejects.toThrow('only Oracle');expect(c.execute).toHaveBeenCalledOnce();expect(c.close).toHaveBeenCalledOnce();
});
it('bounds LOB reads and destroys locators',async()=>{const lob={getData:vi.fn().mockResolvedValue('x'.repeat(6000)),destroy:vi.fn()};const result=await previewValue(lob);expect(Buffer.byteLength(String(result))).toBeLessThanOrEqual(4096);expect(lob.getData).toHaveBeenCalledWith(1,1024);expect(lob.destroy).toHaveBeenCalledOnce();});
it.each([{host:'remote'}, {port:1521}, {serviceName:'FREEPDB1'}, {username:'SYS'}, {name:'other'}])('rejects edited endpoint before reading a secret: %j', async changes => {
	const changed = {...config, targets: config.targets.map(t => ({...t, ...changes}))};
	await expect(createSessionProvider(changed, config.targets).get(changed.targets[0]!.name)).rejects.toThrow();
	expect(mocks.connect).not.toHaveBeenCalled();
	expect(mocks.read).not.toHaveBeenCalled();
});
it('preserves the explicit endpoint override for the gate integration test', async () => {
	const target = {...config.targets[0]!, name:'gate-only-non19c', port:1521, serviceName:'FREEPDB1', passwordFile:'d2_lab.pw'};
	const {c} = connection('26.0');
	await expect(createSessionProvider({...config, targets:[target]}, [target]).get(target.name)).rejects.toThrow('only Oracle');
	expect(c.close).toHaveBeenCalledOnce();
});

it('sets UTC once on each new session before any tool query', async () => {
	const provider = createSessionProvider(config);
	for (let i = 0; i < 2; i++) {
		const { c } = connection();
		const session = await provider.get();
		await session.query('SELECT 1 FROM dual');
		await session.query('SELECT 2 FROM dual');
		const statements = c.execute.mock.calls.map(call => call[0]);
		const utc = "ALTER SESSION SET TIME_ZONE = '+00:00'";
		expect(statements.filter(sql => sql === utc)).toHaveLength(1);
		expect(statements.indexOf(utc)).toBe(5);
		expect(statements.indexOf(utc)).toBeLessThan(statements.indexOf('SELECT 1 FROM dual'));
		expect(statements.indexOf(utc)).toBeLessThan(statements.indexOf('SET TRANSACTION READ ONLY'));
	}
	await provider.closeAll();
});

it('uses safe guidance for invalid config-derived query limits before executing SQL', async () => {
	const { c } = connection();
	const provider = createSessionProvider({ ...config, limits: { ...config.limits, maxRows: 0 } });
	const session = await provider.get();
	const before = c.execute.mock.calls.length;
	await expect(session.query('SELECT 1 FROM dual')).rejects.toMatchObject({ name: 'SafeConfigError', message: 'Invalid query limits' });
	expect(c.execute).toHaveBeenCalledTimes(before);
	await provider.closeAll();
});

it('uses safe guidance when the secret directory is unset before reading secrets', async () => {
	delete process.env.PIAGENT_SECRET_DIR;
	await expect(createSessionProvider(config).get()).rejects.toMatchObject({
		name: 'SafeConfigError',
		message: 'Set PIAGENT_SECRET_DIR to the same private secret directory configured for this process.',
	});
	expect(mocks.read).not.toHaveBeenCalled();
	expect(mocks.connect).not.toHaveBeenCalled();
});
