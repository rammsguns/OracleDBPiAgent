import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { SQL } from '../../src/security/sql.js';
import { forbiddenSecuritySql, scanSecuritySource, securitySourceStrings } from './security-sql-scan.js';

it.each([
	'SELECT PASSWORD FROM DBA_USERS',
	'SELECT SPARE4 FROM DBA_USERS',
	'SELECT AUTHENTICATION_TYPE FROM DBA_USERS',
	'SELECT PASSWORD_VERSIONS FROM DBA_USERS',
	'SELECT PASS_HASH FROM DBA_USERS',
	'SELECT HASH FROM DBA_USERS',
	'SELECT "myHashColumn" FROM DBA_USERS',
	'SELECT * FROM UNIFIED_AUDIT_TRAIL',
	'SELECT * FROM SYS."UNIFIED_AUDIT_TRAIL"',
	'SELECT * FROM V$SQL_BIND_CAPTURE',
	'SELECT * FROM SYS."V$SQL_BIND_CAPTURE"',
	'SELECT * FROM SYS.V_$SQL_BIND_CAPTURE',
	'SELECT VALUE_STRING FROM other_metadata',
	'SELECT "value_string" FROM other_metadata',
	'SELECT * FROM SYS.USER$',
	'SELECT * FROM SYS."USER$"',
	'SELECT * FROM "SYS" . "USER$"',
	'SELECT *\nFROM\t"SYS" \n . \t "USER$"',
	'SELECT * FROM SYS /* quoted identifier */ . "USER$"',
])('rejects forbidden SQL after quote/whitespace normalization: %s', sql => {
	expect(forbiddenSecuritySql(sql)).toBe(true);
	expect(scanSecuritySource(`const query = ${JSON.stringify(sql)};`)).not.toEqual([]);
});

it.each([
	`const view = 'UNIFIED_AUDIT_TRAIL';`,
	`const view = 'V$SQL_BIND_CAPTURE';`,
	`const column = 'VALUE_STRING';`,
	`const column = 'PASSWORD_VERSIONS';`,
	`const column = 'PASS_HASH';`,
	`const columns = 'PASS_HASH AS secret';`,
	`const columns = 'VALUE_STRING, POSITION';`,
	`const columns = 'PASSWORD AS secret';`,
	`const columns = 'PASSWORD, USERNAME';`,
	`const table = 'USER' + '$';`,
	`const table = ('US' + /* split */ 'ER') + '$';`,
	`const table = 'UNI' + 'FIED_AUDIT_TRAIL';`,
	`const query = 'SELECT ' + 'PASS' + 'WORD FROM DBA_USERS';`,
	`const query = 'SELECT * FROM SYS.' + '"USER' + '$"';`,
	'const query = `SELECT * FROM SYS.${"USER"}${"$"}`;',
	'const query = `SELECT * FROM SYS.${"US" + "ER" + "$"}`;',
	'const query = `SELECT ${"VALUE" + "_STRING"} FROM other_metadata`;',
	'const query = `SELECT * FROM ${`V$SQL_${"BIND"}_CAPTURE`}`;',
	'const query = `SELECT * FROM SYS.US${unknown}ER$`;',
	'const first = "US"; const last = "ER$"; const query = `SELECT * FROM SYS.${first}${last}`;',
	'const view = "UNIFIED_" + "AUDIT_TRAIL"; const query = `SELECT * FROM ${view}`;',
	'const query = `SELECT * FROM SYS.${table}`; const table = "USER" + "$";',
	String.raw`const query = 'SELECT * FROM SYS.\u0055SER\u0024';`,
	'const query = `SELECT * FROM SYS.\\u0055SER\\u0024`;',
])('rejects standalone fragments, concatenations, escapes and nested templates: %s', source => {
	expect(scanSecuritySource(source)).not.toEqual([]);
});

it('scans every literal, including function arguments, object fields and tagged templates', () => {
	for (const source of ['send("UNIFIED_AUDIT_TRAIL");', 'const x = { view: "V$SQL_BIND_CAPTURE" };', 'sql`SELECT * FROM SYS."USER$"`;']) {
		expect(scanSecuritySource(source)).not.toEqual([]);
	}
});
it('accepts profile resource literals, prose, comments and regular expressions without executing source', () => {
	expect(scanSecuritySource(`
		const sql = "SELECT PROFILE, LIMIT FROM DBA_PROFILES WHERE RESOURCE_TYPE = 'PASSWORD'";
		const advice = 'For a human DBA: review password verification.';
		// SELECT * FROM SYS.USER$
		const regexp = /SELECT PASSWORD FROM DBA_USERS/;
		throw new Error('This source must never be evaluated');
	`)).toEqual([]);
});
it('fails closed on source parse errors', () => {
	expect(() => scanSecuritySource('const x = `unfinished')).toThrow('Cannot scan');
});

it('discovers real SQL strings in the security sources rather than passing vacuously', () => {
	const strings = readdirSync('src/security', { recursive: true, encoding: 'utf8' })
		.filter(file => /\.[cm]?tsx?$/.test(file))
		.flatMap(file => securitySourceStrings(readFileSync('src/security/' + file, 'utf8'), file));
	const sql = strings.filter(text => /\bSELECT\b[\s\S]*\bFROM\b/i.test(text));
	expect(sql.length).toBeGreaterThan(0);
	// Verifies the parser visits all of today's SQL catalog, not just some literals.
	for (const statement of Object.values(SQL)) expect(sql).toContain(statement);
});
