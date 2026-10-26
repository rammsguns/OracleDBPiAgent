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
