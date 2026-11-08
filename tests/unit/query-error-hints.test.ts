import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';
function setup(message: string, rows: unknown[][] = [['SQL_ID', 3], ['SQL_FULLTEXT', 3], ['PARSE_CALLS', 3]], identity?: object) {
	const error = new Error(message);
	const query = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ columns: ['COLUMN_NAME','TOTAL_COLUMNS'], rows, truncated: false, elapsedMs: 1 });
	const close = vi.fn();
	const record = vi.fn();
	const ctx = { config: { defaultTarget: 'lab', targets: [{name:'lab',defaultSchema:'SH'}], limits: {maxRows:100,statementTimeoutSeconds:15,maxToolResultBytes:16000} }, sessions: {get:vi.fn().mockResolvedValue({target:{name:'lab'},identity,query,close})}, audit:{record},runId:'test' } as unknown as ToolContext;
	const tool = createDbTools(ctx).find(t => t.name === 'run_query')!;
	return { query, close, record, error, run: (sql: string) => tool.execute('1', {sql}).catch(e => e as Error) };
}
it('preserves the original error and first line, prioritizes close names, binds V_$ metadata, and audits separate hashes', async () => {
	const s = setup('ORA-00904: "SQL_FULL_TEXT": invalid identifier\nHelp: original');
	const sql = 'SELECT sql_full_text FROM sys.v$sql';
	const e = await s.run(sql);
	expect(e).toBe(s.error); expect(e.message).toMatch(/^ORA-00904: "SQL_FULL_TEXT": invalid identifier\nHelp: original\nHint: V\$SQL close matches: SQL_FULLTEXT/);
	expect(s.query.mock.calls[1]![1]).toEqual({owner:'SYS',name:'V_$SQL'});
	expect(s.query.mock.calls[1]![2]).toEqual({maxRows:100,timeoutSeconds:2});
	expect(s.record.mock.calls.at(-1)![0]).toMatchObject({kind:'tool_error',sqlSha256:createHash('sha256').update(sql).digest('hex')});
	expect(s.record).toHaveBeenCalledTimes(2); expect(s.close).toHaveBeenCalledOnce();
});
it('hints VALIDATED for ORA-01747', async () => {
	const s=setup('ORA-01747: invalid user.table.column specification', [['VALIDATED',1]]);
	expect((await s.run('SELECT c.validate FROM all_constraints c')).message).toContain('close matches: VALIDATED');
});
for (const visible of [true,false]) it(`reports ALL visibility ${visible} on DBA ORA-00942`, async () => {
	const s=setup('ORA-00942: table or view does not exist',visible ? [['OWNER']] : []);
	expect((await s.run('SELECT * FROM dba_indexes')).message).toContain(visible ? 'ALL_INDEXES is available (shows only objects this login can see)' : 'ALL_INDEXES is not visible');
	expect(s.query.mock.calls[1]![1]).toEqual({owner:'SYS',name:'ALL_INDEXES'});
});
it('gives static nested aggregate advice without lookup', async () => {
	const s=setup('ORA-00935: group function is nested too deeply');
	expect((await s.run('SELECT MAX(SUM(x)) FROM sales')).message).toContain('aggregate in a subquery, then aggregate its result.'); expect(s.query).toHaveBeenCalledTimes(1);
});
for (const message of ['ORA-00904: invalid identifier','ORA-00942: table or view does not exist']) it(`does not hint user tables for ${message}`,async()=>{
	const s=setup(message); expect((await s.run('SELECT x FROM sales')).message).toBe(message); expect(s.query).toHaveBeenCalledTimes(1);
});
it('falls back to original on lookup failure or timeout',async()=>{
	for (const failure of ['lookup failed','DPI-1067: call timeout']) {
		const s=setup('ORA-00904: invalid identifier'); s.query.mockRejectedValueOnce(new Error(failure));
		expect((await s.run('SELECT x FROM v$sql')).message).toBe('ORA-00904: invalid identifier');
	}
});
it('caps hints, counts omitted columns, preserves column order',async()=>{
	const s=setup('ORA-00904: invalid identifier',Array.from({length:100},(_,i)=>[`COLUMN_${String(i).padStart(3,'0')}_${'X'.repeat(30)}`,150]));
	const message=(await s.run('SELECT x FROM v$sql')).message; const hint=message.split('\n')[1]!;
	expect(hint.length).toBeLessThanOrEqual(1200); expect(hint).toMatch(/\d+ columns omitted$/); expect(hint.indexOf('COLUMN_000')).toBeLessThan(hint.indexOf('COLUMN_001'));
});
it('recognizes nested FROM, JOIN, comma lists and GV$ but caps lookups at three',async()=>{
	const s=setup('ORA-00904: invalid identifier');
	await s.run('SELECT x FROM (SELECT x FROM sys.gv$sql) q JOIN all_constraints c ON 1=1, user_tables u, dba_objects d');
	expect(s.query.mock.calls.slice(1).map(call=>call[1].name)).toEqual(['GV_$SQL','ALL_CONSTRAINTS','USER_TABLES']);
});
for (const sql of ["SELECT 'FROM v$sql' FROM sales", 'SELECT x FROM "V$SQL"', 'SELECT x FROM other.v$sql', 'SELECT x FROM sales -- FROM v$sql', 'SELECT x FROM sales /* JOIN all_tables */']) it(`ignores nonplain or non-FROM names: ${sql}`,async()=>{
	const s=setup('ORA-00904: invalid identifier'); await s.run(sql); expect(s.query).toHaveBeenCalledTimes(1);
});
it('leaves success and unrelated errors unchanged',async()=>{
	const s=setup('ORA-01031: insufficient privileges'); expect((await s.run('SELECT x FROM v$sql')).message).toBe(s.error.message); expect(s.query).toHaveBeenCalledTimes(1);
});
it('does not let comment-like literal text expose fake FROM names',async()=>{
	const s=setup('ORA-00904: invalid identifier'); await s.run("SELECT '/*', 'FROM v$sql', '*/' FROM sales"); expect(s.query).toHaveBeenCalledTimes(1);
});
it('returns successful run_query results without metadata lookups',async()=>{
	const s=setup('unused'); s.query.mockReset().mockResolvedValue({columns:['N'],rows:[[1]],truncated:false,elapsedMs:1});
	const result=await s.run('SELECT 1 n FROM dual'); expect(result.details.rows).toEqual([[1]]); expect(s.query).toHaveBeenCalledTimes(1);
});
it('attributes multi-object ORA-00942 with bounded audited probes', async () => {
	const s=setup('ORA-00942: table or view does not exist');
	s.query.mockReset().mockRejectedValueOnce(s.error)
		.mockResolvedValueOnce({columns:[],rows:[],truncated:false,elapsedMs:1})
		.mockRejectedValueOnce(new Error('ORA-01031: insufficient privileges'));
	const e=await s.run('SELECT l.sequence# FROM v$log l JOIN v$logmember m ON m.group#=l.group#');
	expect(e.message).toContain('Readable: V$LOG. Not visible to this account: V$LOGMEMBER.');
	expect(s.query.mock.calls.map(call=>call[0])).toEqual(['SELECT l.sequence# FROM v$log l JOIN v$logmember m ON m.group#=l.group#','SELECT * FROM V$LOG WHERE 1=0','SELECT * FROM V$LOGMEMBER WHERE 1=0']);
	expect(s.query.mock.calls[1]![2]).toEqual({maxRows:100,timeoutSeconds:15});
	expect(s.record).toHaveBeenCalledTimes(3);
	expect(s.record.mock.calls[0]![0]).toMatchObject({sqlText:'SELECT * FROM V$LOG WHERE 1=0',sqlSha256:createHash('sha256').update('SELECT * FROM V$LOG WHERE 1=0').digest('hex')});
});
it('parses nested subqueries and comma joins, caps ORA-00942 probes at six', async () => {
	const s=setup('ORA-00942: table or view does not exist');
	s.query.mockReset().mockRejectedValueOnce(s.error).mockResolvedValue({columns:[],rows:[],truncated:false,elapsedMs:1});
	await s.run('SELECT * FROM (SELECT * FROM a.x JOIN b.y ON 1=1) q, c.z, d.w, e.v, f.u, g.t, h.s');
	expect(s.query).toHaveBeenCalledTimes(7);
});
it('skips single-object ORA-00942 and injection-shaped identifiers', async () => {
	const one=setup('ORA-00942: table or view does not exist'); await one.run('SELECT * FROM v$log'); expect(one.query).toHaveBeenCalledTimes(1);
	const bad=setup('ORA-00942: table or view does not exist'); await bad.run('SELECT * FROM v$log JOIN "bad.name" x ON 1=1'); expect(bad.query).toHaveBeenCalledTimes(1);
});
it.each([['PDB1',true],['CDB$ROOT',false],['ORCL',false]])('notes NULL apply lag only in PDB container %s', async (containerName, expectNote) => {
	const s=setup('unused', [['apply lag',null]], {isCdb:containerName !== 'ORCL',containerName}); s.query.mockReset().mockResolvedValue({columns:['NAME','VALUE'],rows:[['apply lag',null]],truncated:false,elapsedMs:1});
	const result=await s.run("SELECT NAME, VALUE FROM V$DATAGUARD_STATS WHERE NAME='apply lag'");
	if (expectNote) expect(result.details.sourceNote).toContain('This does not mean zero lag'); else expect(result.details.sourceNote).toBeUndefined();
});
it('matches PARSES to PARSE_CALLS using their common stem', async () => {
	const s = setup('ORA-00904: "PARSES": invalid identifier');
	expect((await s.run('SELECT parses FROM v$sql')).message).toContain('V$SQL close matches: PARSE_CALLS;');
});
for (const identifier of ['"s"."parses"', '"s.parses"', 'parses']) it(`uses only the reported identifier ${identifier}`, async () => {
	const s = setup(`ORA-00904: ${identifier}: invalid identifier`);
	expect((await s.run('SELECT sql_full_text, parses FROM v$sql s')).message).toContain('close matches: PARSE_CALLS;');
});
it('filters keywords, views, aliases, literals and comments from ORA-01747 candidates', async () => {
	const s = setup('ORA-01747: invalid specification', ['SELECTED', 'WHEREVER', 'ORDER_ID', 'SQL_TEXT', 'ALL_CONSTRAINT', 'LONGALIAS', 'COMMENTED', 'LITERAL'].map(c => [c, 8]));
	const message = (await s.run("SELECT 'literal' AS longalias FROM all_constraints longalias JOIN v$sql s ON 1=1 WHERE 1=1 ORDER BY 1 /* commented */")).message;
	expect(message).not.toContain('close matches:');
	expect(message).toContain('Hint: ALL_CONSTRAINTS columns:');
});
it('prefers alias-qualified column candidates over other SQL identifiers', async () => {
	const s = setup('ORA-01747: invalid specification', [['VALIDATED', 2], ['PARSE_CALLS', 2]]);
	expect((await s.run('SELECT c.validate, parses FROM all_constraints c')).message).toContain('close matches: VALIDATED;');
});
it('renders a view without any close match without the close matches segment', async () => {
	const s = setup('ORA-00904: "VERSION_COUNT": invalid identifier');
	expect((await s.run('SELECT version_count FROM v$sql')).message).toBe('ORA-00904: "VERSION_COUNT": invalid identifier\nHint: V$SQL columns: SQL_ID, SQL_FULLTEXT, PARSE_CALLS');
});
it('renders several view sections with their own matches and column lists', async () => {
	const s = setup('ORA-00904: "PARSES": invalid identifier');
	s.query.mockResolvedValueOnce({ rows: [['PARSE_CALLS', 1]], truncated: false, elapsedMs: 1 })
		.mockResolvedValueOnce({ rows: [['OWNER', 1]], truncated: false, elapsedMs: 1 });
	expect((await s.run('SELECT parses FROM v$sql s JOIN all_constraints c ON 1=1')).message).toBe('ORA-00904: "PARSES": invalid identifier\nHint: V$SQL close matches: PARSE_CALLS; columns: PARSE_CALLS\nALL_CONSTRAINTS columns: OWNER');
});
it('ranks normalized equality, prefix, edit distance and shared prefix and caps matches at three', async () => {
	const s = setup('ORA-00904: "ABCDE_FGH": invalid identifier', ['ABCDE_OTHER', 'ABXDEFGH', 'ABCDEFGH_LONG', 'ABCDEFGH', 'ABCDEFGH_MORE'].map(c => [c, 5]));
	expect((await s.run('SELECT abcde_fgh FROM v$sql')).message).toContain('close matches: ABCDEFGH, ABCDEFGH_LONG, ABCDEFGH_MORE;');
});
it('uses edit distance before shared prefix and rejects short fuzzy matches', async () => {
	const s = setup('ORA-00904: "PARSES": invalid identifier', [['PARSE_CALLS', 2], ['PARSEN', 2]]);
	expect((await s.run('SELECT parses FROM v$sql')).message).toContain('close matches: PARSEN, PARSE_CALLS;');
	const short = setup('ORA-00904: "SORT": invalid identifier', [['SORTS', 1]]);
	expect((await short.run('SELECT sort FROM v$sql')).message).not.toContain('close matches:');
});
