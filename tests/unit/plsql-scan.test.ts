import { expect, it } from 'vitest';
import { tableUses } from '../../src/plsql/index.js';
import { routines, matchRoutine } from '../../src/plsql/analysis.js';
import type { ArgumentRow } from '../../src/plsql/dictionary.js';
const dependencies = ['A', 'B', 'C'].map(name => ({ owner: 'HR', name: 'P', type: 'PROCEDURE', referencedOwner: 'HR', referencedName: name, referencedType: 'TABLE' }));
function scan(text: string) { return tableUses([{ type: 'PROCEDURE', line: 1, text }], dependencies).map(t => t.operations); }
it.each([
	['DELETE FROM A;', [['DELETE'], [], []]],
	['DELETE /* target */\nFROM HR.A;', [['DELETE'], [], []]],
	['DELETE A;', [['DELETE'], [], []]],
	['UPDATE A SET V=1;', [['UPDATE'], [], []]],
	['UPDATE A SET V=(SELECT V FROM B);', [['UPDATE'], ['SELECT'], []]],
	['UPDATE A SET V=(SELECT MAX(V) FROM A);', [['SELECT', 'UPDATE'], [], []]],
	['INSERT INTO A SELECT * FROM B;', [['INSERT'], ['SELECT'], []]],
	['DELETE FROM A WHERE ID IN (SELECT ID FROM B);', [['DELETE'], ['SELECT'], []]],
	['DELETE FROM A WHERE ID IN (SELECT ID FROM A);', [['SELECT', 'DELETE'], [], []]],
	['DELETE FROM A WHERE EXISTS (SELECT 1 FROM B JOIN C ON B.ID=C.ID);', [['DELETE'], ['SELECT'], ['SELECT']]],
])('classifies writes and actual subquery reads: %s', (text, expected) => { expect(scan(text)).toEqual(expected); });
it.each([
	['MERGE INTO A USING B ON (A.ID=B.ID) WHEN MATCHED THEN UPDATE SET A.V=B.V;', [['MERGE'], ['SELECT'], []]],
	['MERGE INTO HR.A T USING HR.B S ON (T.ID=S.ID) WHEN MATCHED THEN UPDATE SET T.V=S.V;', [['MERGE'], ['SELECT'], []]],
	['MERGE INTO A USING (SELECT * FROM B JOIN C ON B.ID=C.ID) S ON (A.ID=S.ID) WHEN MATCHED THEN UPDATE SET A.V=S.V;', [['MERGE'], ['SELECT'], ['SELECT']]],
])('counts MERGE source tables as reads: %s', (text, expected) => { expect(scan(text)).toEqual(expected); });
it('ignores block/line comments and literals before operation classification', () => {
	expect(scan(`-- SELECT * FROM A; DELETE FROM B;
/* MERGE INTO A USING B ON (1=1); UPDATE C SET V=0; */
x := 'INSERT INTO C SELECT * FROM A';
x := 'escaped '' DELETE FROM B; MERGE INTO A USING C';
x := q'[can't SELECT * FROM C; DELETE FROM B;]';
DELETE /* SELECT * FROM A */ FROM A WHERE ID IN (SELECT ID FROM B);`)).toEqual([['DELETE'], ['SELECT'], []]);
});
it.each([
	"PROCEDURE P(X VARCHAR2 DEFAULT q'[can't; stop]');",
	"PROCEDURE P(X VARCHAR2 /* format; default csv */ DEFAULT 'a;b');",
	"PROCEDURE P(\n-- argument; comment\nX VARCHAR2 DEFAULT 'a;''b' -- default; comment\n);",
	"FUNCTION P(X VARCHAR2 DEFAULT 'a;b') RETURN VARCHAR2 /* return; type */\n;",
	"PROCEDURE P(X VARCHAR2) -- trailing; comment\n;",
])('keeps the complete declaration despite commented/literal semicolons: %s', declaration => {
	const parsed = routines([{ type: 'PACKAGE', line: 1, text: `PACKAGE PKG AS\n${declaration}\nPROCEDURE NEXT_ONE;\nEND;` }]);
	expect(parsed).toHaveLength(2); expect(parsed[0]?.declaration).toBe(declaration); expect(parsed[1]?.name).toBe('NEXT_ONE');
	const args = [{ name: 'X', type: 'VARCHAR2', position: 1, level: 0 } as ArgumentRow];
	expect(matchRoutine(parsed, 'P', args)).toBeDefined();
});
