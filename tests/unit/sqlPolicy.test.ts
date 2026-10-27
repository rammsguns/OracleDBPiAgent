import { describe, it, expect } from 'vitest';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import { gate19c } from '../../src/oracle/index.js';
import { boundedResult } from '../../src/tools/index.js';
const allowed = [
'SELECT 1 FROM dual', 'select * from hr.employees;', 'WITH x AS (SELECT 1 n FROM dual) SELECT * FROM x',
"SELECT 'DELETE; @x' FROM dual", "SELECT 'it''s UPDATE' FROM dual", "SELECT q'[delete; @x]' FROM dual", "SELECT q'{begin end;}' FROM dual", "SELECT q'(update)' FROM dual", "SELECT q'<drop>' FROM dual", "SELECT q'!insert!' FROM dual", 'SELECT /* DELETE */ 1 FROM dual', '-- update\nSELECT 1 FROM dual', 'SELECT 1 -- ;\nFROM dual', 'SELECT count(*) FROM hr.employees', 'SELECT :value FROM dual', 'SELECT * FROM dual WHERE 1=1', 'SELECT * FROM dual ORDER BY 1', 'SELECT * FROM dual FETCH FIRST 1 ROWS ONLY', 'SELECT * FROM dual UNION ALL SELECT * FROM dual', 'SELECT CASE WHEN 1=1 THEN 2 END FROM dual', 'SELECT sys_context(\'USERENV\',\'SESSION_USER\') FROM dual', 'SELECT * FROM v$sqlstats', 'SELECT * FROM v$session', 'SELECT * FROM all_objects', 'SELECT * FROM dba_users', 'SELECT * FROM dual; -- comment', 'SELECT N\'hello\' FROM dual', 'SELECT "Name" FROM t', 'SELECT 1 FROM dual /* trailing */', 'WITH a AS (SELECT 1 FROM dual), b AS (SELECT * FROM a) SELECT * FROM b',
];
const rejected = [
'', '/* empty */', 'INSERT INTO t VALUES(1)', 'UPDATE t SET a=1', 'DELETE FROM t', 'MERGE INTO t USING x ON (1=1)', 'CREATE TABLE t(a int)', 'DROP TABLE t', 'TRUNCATE TABLE t', 'ALTER SESSION SET x=y', 'BEGIN NULL; END;', 'DECLARE a int; BEGIN NULL; END;', 'CALL p()', 'LOCK TABLE t IN EXCLUSIVE MODE', 'COMMIT', 'ROLLBACK', 'SELECT * FROM t FOR UPDATE', 'SELECT * FROM t FOR /*hi*/ UPDATE', 'SELECT 1 FROM dual; SELECT 2 FROM dual', 'SELECT 1 FROM dual;;', 'SELECT * FROM t@link', 'SELECT * FROM t @ link', 'WITH FUNCTION f RETURN NUMBER IS BEGIN RETURN 1; END; SELECT f FROM dual', 'WITH x AS (DELETE FROM t) SELECT * FROM x', "SELECT UTL_HTTP.REQUEST('x') FROM dual", "SELECT UTL_FILE.FOPEN('a','b','w') FROM dual", 'SELECT DBMS_SCHEDULER.RUN_JOB(1) FROM dual', 'SELECT DBMS_PIPE.RECEIVE_MESSAGE(1) FROM dual', 'SELECT DBMS_LOCK.SLEEP(1) FROM dual', 'SELECT DBMS_AQ.ENQUEUE(1) FROM dual', "SELECT DBMS_XMLGEN.GETXML('delete from t') FROM dual", 'SELECT * FROM v$active_session_history', 'SELECT * FROM dba_hist_snapshot', "SELECT 'unclosed FROM dual", 'SELECT /* unclosed', 'SELECT "unclosed', "SELECT q'[unclosed' FROM dual", 'SELECT "UTL_HTTP"."REQUEST"(1) FROM dual', 'SELECT DBMS_XPLAN.DISPLAY_CURSOR(null), UTL_HTTP.REQUEST(1) FROM dual', 'SELECT 1 INTO x FROM dual', 'SELECT seq.NEXTVAL FROM dual', 'SELECT DBMS_XPLAN.DISPLAY_CURSOR(null), DBMS_XPLAN.DISPLAY() FROM dual',
];
describe('SQL policy', () => {
	it.each(allowed)('allows %s', sql => expect(() => classifySql(sql)).not.toThrow());
	it.each(rejected)('rejects %s', sql => expect(() => classifySql(sql)).toThrow());
});
it('gates exact major version', () => { gate19c('x','19.9.1.0.0'); for (const v of ['23.0','26.0','119.0','unknown']) expect(() => gate19c('x',v)).toThrow(); });
it('caps content and details together', () => { const r = boundedResult({ columns:['x'], rows: Array.from({length:30},()=>['💡'.repeat(100)]), truncated:false, elapsedMs:1 }, 600); expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(600); expect(r.details.truncated).toBe(true); });

const safeFunctionQueries = [
	'SELECT SUM(x), AVG(x), MIN(x), MAX(x), COUNT(*) FROM t',
	'SELECT MEDIAN(x), STDDEV(x), STDDEV_POP(x), STDDEV_SAMP(x) FROM t',
	"SELECT LISTAGG(x, ',') WITHIN GROUP (ORDER BY x) FROM t",
	'SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x), PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY x) FROM t',
	'SELECT ROW_NUMBER() OVER (PARTITION BY y ORDER BY x), RANK() OVER (ORDER BY x), DENSE_RANK() OVER (ORDER BY x) FROM t',
	'SELECT LAG(x) OVER (ORDER BY x), LEAD(x) OVER (ORDER BY x), FIRST_VALUE(x) OVER (ORDER BY x), LAST_VALUE(x) OVER (ORDER BY x) FROM t',
	'SELECT NTILE(4) OVER (ORDER BY x), RATIO_TO_REPORT(x) OVER () FROM t',
	'WITH totals (category, revenue) AS (SELECT y, SUM(x) FROM t GROUP BY y) SELECT * FROM totals',
	'WITH a(x) AS (SELECT 1 FROM dual), "b" ("y") AS (SELECT x FROM a) SELECT * FROM "b"',
	'SELECT * FROM (SELECT x FROM t) a JOIN (SELECT x FROM u) b ON (a.x=b.x)',
	'SELECT CASE WHEN (x>0) THEN ROUND(x,2) ELSE ABS(x) END FROM t',
	'SELECT EXTRACT(YEAR FROM dt) FROM t',
	"SELECT TO_CHAR(dt, 'YYYY-MM-DD'), TO_NUMBER('12'), TO_DATE('2026','YYYY'), TO_TIMESTAMP('2026','YYYY') FROM t",
	'SELECT CAST(x AS NUMBER(10,2)), CAST(y AS VARCHAR2(30)) FROM t',
	'SELECT ROUND(x,2) FROM t FETCH FIRST 5 ROWS ONLY',
	'SELECT * FROM t WHERE x IN (1,2) AND EXISTS (SELECT 1 FROM u WHERE u.x=t.x)',
	'SELECT NVL(x,0), NVL2(x,1,0), COALESCE(x,y,0), NULLIF(x,y), DECODE(x,1,2,0), GREATEST(x,y), LEAST(x,y) FROM t',
	"SELECT REGEXP_SUBSTR(x,'a'), REGEXP_REPLACE(x,'a','b'), REGEXP_COUNT(x,'a'), REGEXP_INSTR(x,'a') FROM t WHERE REGEXP_LIKE(x,'a')",
	"SELECT JSON_VALUE(x,'$.a'), JSON_QUERY(x,'$.b') FROM t",
	"SELECT * FROM JSON_TABLE(:doc, '$[*]' COLUMNS (x NUMBER PATH '$.x'))",
	"SELECT SYS_CONTEXT('USERENV','SESSION_USER'), USERENV('SESSIONID') FROM dual",
	"SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL,NULL,'TYPICAL'))",
	"SELECT LOWER(TRIM(x)), SUBSTR(x,1,2), LENGTH(x), UPPER(x) FROM t",
	'SELECT MAX(x) KEEP (DENSE_RANK LAST ORDER BY y) FROM t',
	"SELECT 'evil()', q'[pkg.evil()]' FROM dual /* evil() */",
	'SELECT count/* gap */(*) FROM t',
];
const unsafeFunctionQueries = [
	['SELECT éSUM(x) FROM t', 'éSUM'],
	['SELECT ſUM(x) FROM t', 'ſUM'],
	['SELECT my_func(x) FROM t', 'my_func'],
	['SELECT SHOPAPP.LOG_AND_RETURN_ORDER_COUNT() FROM dual', 'SHOPAPP.LOG_AND_RETURN_ORDER_COUNT'],
	['SELECT pkg.f(x) FROM t', 'pkg.f'],
	['SELECT app.pkg.f(x) FROM t', 'app.pkg.f'],
	['SELECT "my_func"(x) FROM t', '"my_func"'],
	['SELECT "SHOPAPP" . "LOG_AND_RETURN_ORDER_COUNT" () FROM dual', '"SHOPAPP"."LOG_AND_RETURN_ORDER_COUNT"'],
	['SELECT "weird name"(x) FROM t', '"weird name"'],
	['SELECT "f""name"(x) FROM t', '"f""name"'],
	['SELECT x FROM t WHERE my_func(x)=1', 'my_func'],
	['SELECT x FROM t ORDER BY my_func(x)', 'my_func'],
	['WITH a AS (SELECT my_func(x) FROM t) SELECT * FROM a', 'my_func'],
	['SELECT SUM(my_func(x)) FROM t', 'my_func'],
	['SELECT my_func /* gap */ (x) FROM t', 'my_func'],
	['SELECT SYS.TO_CHAR(x) FROM t', 'SYS.TO_CHAR'],
	['SELECT DBMS_RANDOM.VALUE() FROM dual', 'DBMS_RANDOM.VALUE'],
	['SELECT * FROM TABLE(my_func())', 'TABLE'],
	['SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(my_func()))', 'my_func'],
	['SELECT XMLTYPE(x) FROM t', 'XMLTYPE'],
	['SELECT "IN"(x) FROM t', '"IN"'],
	['SELECT "sum"(x) FROM t', '"sum"'],
];
it.each(safeFunctionQueries)('allows SQL function/grammar: %s', sql => expect(() => classifySql(sql)).not.toThrow());
it.each(unsafeFunctionQueries)('names rejected function in %s', (sql, name) => expect(() => classifySql(sql!)).toThrow(`Function ${name} is not allowed`));
it.each(['SELECT s.NEXTVAL FROM dual', 'SELECT "s"."NEXTVAL" FROM dual'])('rejects sequence advancement: %s', sql => expect(() => classifySql(sql)).toThrow('Sequence advancement'));

it('accepts every MVP and hard-suite groundTruth.sql, including conversation turns', async () => {
	const { readdir, readFile } = await import('node:fs/promises');
	let checked = 0;
	function visit(value: unknown): void {
		if (!value || typeof value !== 'object') return;
		const object = value as Record<string, unknown>;
		if (object.groundTruth && typeof object.groundTruth === 'object') {
			const sql = (object.groundTruth as Record<string, unknown>).sql;
			if (typeof sql === 'string') { expect(() => classifySql(sql), sql).not.toThrow(); checked++; }
		}
		for (const child of Object.values(object)) visit(child);
	}
	for (const suite of ['cases', 'cases-hard']) {
		const dir = new URL(`../../evals/${suite}/`, import.meta.url);
		for (const file of await readdir(dir)) if (file.endsWith('.json')) visit(JSON.parse(await readFile(new URL(file, dir), 'utf8')));
	}
	expect(checked).toBeGreaterThan(0);
});
