import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ connect: vi.fn(), read: vi.fn() }));
vi.mock('oracledb',()=>({default:{thin:true,getConnection:mocks.connect,OUT_FORMAT_ARRAY:4001,STRING:"STRING",DB_TYPE_DATE:"DATE",DB_TYPE_TIMESTAMP:"TIMESTAMP"}}));
vi.mock('node:fs/promises',()=>({open:async()=>({stat:async()=>({isFile:()=>true,mode:0o600}),readFile:mocks.read,close:async()=>{}})}));
import { createSessionProvider, previewValue } from '../../src/oracle/index.js';
import type { AppConfig } from '../../src/contracts.js';
const config = {defaultTarget:'d1-19c-lab', secretDir:'/secrets',targets:[{name:'d1-19c-lab',host:'localhost',port:1522,serviceName:'ORCL',username:'HARNESS_LAB',passwordFile:'d1_lab.pw',defaultSchema:'HR',environment:'development',description:'Test'}],limits:{maxRows:2,statementTimeoutSeconds:3}} as AppConfig;
beforeEach(()=>{vi.resetAllMocks(); process.env.PIAGENT_SECRET_DIR='/secrets';mocks.read.mockResolvedValue('test-only');});
function connection(version='19.9.1.0.0') {
	const rs = {getRows:vi.fn().mockResolvedValue([[1],[2],[3]]),close:vi.fn()};
	const c = {callTimeout:0,getStatementInfo:vi.fn().mockRejectedValue(new Error('Unexpected metadata describe')),execute:vi.fn().mockResolvedValue({metaData:[{name:'N'}],resultSet:rs}),rollback:vi.fn(),close:vi.fn()};
	c.execute.mockResolvedValueOnce({rows:[[version]]}).mockResolvedValueOnce({rows:[['HARNESS_LAB','FALSE',null,'0','ORCL']]}).mockResolvedValueOnce({rows:[['CREATE SESSION']]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({rows:[['ORCL','orcl','host','NO','HARNESS_LAB','HR','ORCL','+00:00']]});
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
it.each(['privilege','root','query'])('closes on account-check failure before setting schema: %s',async kind=>{
	const {c}=connection();c.execute.mockReset();
	c.execute.mockResolvedValueOnce({rows:[['19.9.1.0.0']]});
	if(kind==='query') c.execute.mockRejectedValueOnce(new Error('private details'));
	else {
		c.execute.mockResolvedValueOnce({rows:[['HARNESS_LAB','FALSE',null,kind==='root'?'1':'0',kind==='root'?'CDB$ROOT':'ORCL']]});
		c.execute.mockResolvedValueOnce({rows:[['CREATE TABLE']]}).mockResolvedValueOnce({rows:[]});
	}
	await expect(createSessionProvider(config).get()).rejects.toThrow();
	expect(c.close).toHaveBeenCalledOnce();expect(c.execute.mock.calls.some(call=>String(call[0]).startsWith('ALTER SESSION'))).toBe(false);
});

it.each(['C##SYS','c##system'])('denies common administrative user %s before reading secrets',async username=>{
	const changed={...config,targets:config.targets.map(t=>({...t,username}))};
	await expect(createSessionProvider(changed).get()).rejects.toThrow();
	expect(mocks.read).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();
});
it('sanitizes connection rejection before exposing it to any feature',async()=>{
	mocks.connect.mockRejectedValueOnce(new Error('ORA-01017: private-password private-host'));
	await expect(createSessionProvider(config).get()).rejects.toThrow('ORA-01017: invalid username/password');
	try{mocks.connect.mockRejectedValueOnce(new Error('private-password'));await createSessionProvider(config).get();}catch(error){expect(String(error)).not.toContain('private-password');expect(String(error)).toContain('Database connection failed');}
});

it('interprets UTC database DATE/TIMESTAMP wall fields with a Mexico City host', async () => {
	const previous = process.env.TZ;
	process.env.TZ = 'America/Mexico_City';
	try {
		const {c}=connection(), p=createSessionProvider(config), session=await p.get();
		await session.query('SELECT SYSDATE FROM dual');
		const options=c.execute.mock.calls.at(-1)![2] as any;
		const converter=options.fetchTypeHandler({dbType:'DATE'}).converter;
		expect(converter('2026-11-08T06:06:00').toISOString()).toBe('2026-11-08T06:06:00.000Z');
		expect(converter(null)).toBeNull();
		expect(options.fetchTypeHandler({dbType:'DATE'}).type).toBe('STRING');
		expect(c.execute.mock.calls.some(call=>String(call[0]).includes('NLS_TIMESTAMP_FORMAT'))).toBe(true);
		expect(options.fetchTypeHandler({dbType:'TIMESTAMP'}).converter('2026-11-08T06:06:00.123000000').toISOString()).toBe('2026-11-08T06:06:00.123Z');
		expect(options.fetchTypeHandler({dbType:'TIMESTAMP WITH TIME ZONE'})).toBeUndefined();
		await p.closeAll();
	} finally { if(previous===undefined) delete process.env.TZ; else process.env.TZ=previous; }
});


it('fetches spring-forward gap wall time as text before constructing an instant',async()=>{
	const previous=process.env.TZ;process.env.TZ='America/New_York';
	try {
		const {c}=connection(),p=createSessionProvider(config),s=await p.get();
		await s.query('SELECT SYSDATE FROM dual');
		const handler=(c.execute.mock.calls.at(-1)![2] as any).fetchTypeHandler;
		for(const dbType of ['DATE','TIMESTAMP']){
			const fetch=handler({dbType});expect(fetch.type).toBe('STRING');
			expect(fetch.converter('2026-03-08T02:30:00.000000000').toISOString()).toBe('2026-03-08T02:30:00.000Z');
		}
		await p.closeAll();
	} finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

it('formats date columns on Oracle and preserves metadata, duplicate names, CTEs, nulls and numeric values',async()=>{
	const {c,rs}=connection(),p=createSessionProvider(config),s=await p.get();
	const metadata=[{name:'D',dbType:'DATE',dbTypeName:'DATE'},{name:'D',dbType:'TIMESTAMP',dbTypeName:'TIMESTAMP'},{name:'N',dbType:'NUMBER',dbTypeName:'NUMBER'}];
	const raw={getRows:vi.fn().mockRejectedValue(new Error('Raw dates must never be fetched')),close:vi.fn()};
	rs.getRows.mockResolvedValue([['2026-03-08T02:30:00',null,42]]);
	c.execute.mockResolvedValueOnce({} as any).mockResolvedValueOnce({metaData:metadata,resultSet:raw} as any).mockResolvedValueOnce({metaData:metadata,resultSet:rs});
	const r=await s.query("WITH PIAGENT_WALL_QUERY AS (SELECT 'WITH SELECT' text FROM dual), t AS (SELECT 1 FROM dual) SELECT SYSDATE D, LOCALTIMESTAMP D, 42 N FROM t");
	expect(r.columns).toEqual(['D','D','N']);
	expect(r.columnTypes).toEqual(['DATE','TIMESTAMP','NUMBER']);
	expect(r.rows).toEqual([[new Date('2026-03-08T02:30:00Z'),null,42]]);
	const sql=String(c.execute.mock.calls.at(-1)![0]);
	expect(sql).toContain('PIAGENT_WALL_QUERY_ (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2)');
	expect(sql).toContain(`TO_CHAR(PIAGENT_COL_0, 'YYYY-MM-DD"T"HH24:MI:SS')`);
	expect(sql).toContain(`TO_CHAR(PIAGENT_COL_1, 'YYYY-MM-DD"T"HH24:MI:SS.FF9')`);
	expect(sql).toContain('PIAGENT_COL_2 AS "N"');
	expect(c.getStatementInfo).not.toHaveBeenCalled();
	expect(raw.getRows).not.toHaveBeenCalled();
	expect(raw.close).toHaveBeenCalledOnce();
	const reads=c.execute.mock.calls.filter(call=>(call[2] as any)?.resultSet);
	expect(reads.map(call=>(call[2] as any).prefetchRows)).toEqual([0,2]);
	await p.closeAll();
});

it('uses one execute per non-date query and never calls getStatementInfo',async()=>{
	const {c}=connection(),p=createSessionProvider(config),s=await p.get();
	const before=c.execute.mock.calls.length;
	await s.query('SELECT 1 FROM dual');
	await s.query('SELECT 2 FROM dual');
	expect(c.getStatementInfo).not.toHaveBeenCalled();
	const calls=c.execute.mock.calls.slice(before);
	expect(calls.filter(call=>call[0]==='SET TRANSACTION READ ONLY')).toHaveLength(2);
	expect(calls.filter(call=>(call[2] as any)?.resultSet)).toHaveLength(2);
	await p.closeAll();
});

it('uses unchanged TCP, one-way TCPS and wallet connection options', async () => {
	const tcp = connection();
	const provider = createSessionProvider(config);
	await provider.get();
	expect(mocks.connect).toHaveBeenLastCalledWith({ user: 'HARNESS_LAB', password: 'test-only', connectString: 'localhost:1522/ORCL' });
	await provider.closeAll();

	const secure = connection();
	const tcpsTarget = { ...config, targets: [{ ...config.targets[0]!, protocol: 'tcps' as const }] };
	await createSessionProvider(tcpsTarget).get();
	expect(mocks.connect).toHaveBeenLastCalledWith({ user: 'HARNESS_LAB', password: 'test-only', connectString: 'tcps://localhost:1522/ORCL' });
	await createSessionProvider(tcpsTarget).closeAll();
	void secure;
});
