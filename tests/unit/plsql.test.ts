import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { Dictionary, objectName, redact } from '../../src/plsql/dictionary.js';
import { documentPlsql, renderPlsqlMarkdown, tableUses } from '../../src/plsql/index.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function context(query: OracleSession['query']): ToolContext {
	return { config: loadConfig(), runId: 'test', audit: { record: async () => {} }, sessions: { get: async () => ({ query, close: async () => {} } as OracleSession), closeAll: async () => {} } };
}
describe('PL/SQL dictionary and documents', () => {
	it('validates identifiers and conservatively redacts ordinary, escaped, q and multiline literals', () => {
		expect(() => objectName('HR.X;DELETE')).toThrow();
		for (const text of ["password := 'hidden';", "x := q'[hidden]';", "x := 'hi''dden';", "x := 'hi\ndden';", 'IDENTIFIED BY "hidden"']) expect(redact(text)).not.toContain('hidden');
		expect(redact("x := 'hi\ndden';")).not.toContain('dden');
	});
	it('uses bound values, read-only SQL, DBA fallback and explicit unavailable codes', async () => {
		const seen: string[] = [];
		const ctx = context(async (sql, binds) => {
			classifySql(sql); seen.push(sql); expect(binds).toEqual({ owner: 'HR', name: 'P' });
			if (sql.includes('DBA_')) throw new Error('ORA-00942: hidden');
			return { rows: [], columns: [], truncated: false, elapsedMs: 0 };
		});
		const result = await new Dictionary(ctx, 'd1-19c-lab').objects('HR', 'P');
		expect(result.view).toBe('ALL_OBJECTS'); expect(result.attempts[0]?.code).toBe('ORA-00942'); expect(seen).toHaveLength(2);
		const unavailable = await new Dictionary(context(async () => { throw new Error('ORA-01031: no'); }), 'd1-19c-lab').source('HR', 'P');
		expect(unavailable.status).toBe('unavailable'); expect(unavailable.attempts).toHaveLength(2);
	});
	it('preserves overload identity, return types, default flags, cap evidence and graph stability', async () => {
		const ctx = context(async (sql, _binds, options) => {
			classifySql(sql);
			let rows: unknown[][] = [], truncated = false;
			if (sql.includes('_PROCEDURES')) rows = [['P', 1, '1'], ['P', 2, '2']];
			if (sql.includes('_ARGUMENTS')) rows = [['A', 1, '1', 1, 1, 0, 'IN', 'NUMBER', 'Y'], [null, 2, '2', 0, 1, 0, 'OUT', 'VARCHAR2', 'N']];
			if (sql.includes('_SOURCE')) { expect(options?.maxRows).toBe(200); rows = [['PACKAGE', 1, '-- first\nPROCEDURE P(A NUMBER DEFAULT 1);\n-- second\nFUNCTION P RETURN VARCHAR2;']]; truncated = false; }
			return { rows, truncated, columns: [], elapsedMs: 0 };
		});
		const doc = await documentPlsql(ctx, 'd1-19c-lab', 'HR.PKG');
		expect(doc.signatures).toHaveLength(2); expect(doc.signatures[0]?.signature).toContain('DEFAULT'); expect(doc.signatures[1]?.signature).toContain('RETURN VARCHAR2');
		expect(doc.signatures[0]?.comments).toContain('first'); expect(doc.signatures[1]?.comments).toContain('second');
		expect(doc.complete).toBe(true); expect(renderPlsqlMarkdown(doc)).toContain('Subprograms');
		expect((await documentPlsql(ctx, 'd1-19c-lab', 'HR.PKG')).graph).toEqual(doc.graph);
	});
	it('pages within session limits and caps combined source at 2000 lines', async () => {
		let calls = 0;
		const ctx = context(async (_sql, binds, options) => {
			calls++; expect(options?.maxRows).toBeLessThanOrEqual(200);
			return { rows: Array.from({ length: 200 }, (_, i) => ['PACKAGE BODY', Number(binds?.afterLine) + i + 1, "x := 'secret';\n"]), truncated: true, columns: [], elapsedMs: 0 };
		});
		const source = await new Dictionary(ctx, 'd1-19c-lab').source('HR', 'P');
		expect(calls).toBe(10); expect(source.rows).toHaveLength(2000); expect(source.truncated).toBe(true); expect(JSON.stringify(source)).not.toContain('secret');
	});
	it('redacts multiline literals across pages and incomplete literals at the cap', async () => {
		let calls = 0;
		const ctx = context(async () => {
			calls++;
			return { rows: [['PROCEDURE', calls, calls === 1 ? "x := q'[private\n" : "credential]';\n"]], truncated: calls === 1, columns: [], elapsedMs: 0 };
		});
		const source = await new Dictionary(ctx, 'd1-19c-lab').source('HR', 'P');
		expect(source.rows.map(r => r.line)).toEqual([1, 2]);
		expect(JSON.stringify(source)).not.toMatch(/private|credential/);
		expect(redact("x := 'private\ncredential")).not.toMatch(/private|credential/);
		expect(redact("x := q'[private\ncredential")).not.toMatch(/private|credential/);
	});
	it('assigns operations per table and ignores comments and string SQL', () => {
		const dependencies = ['A', 'B'].map(name => ({ owner: 'HR', name: 'P', type: 'PROCEDURE', referencedOwner: 'HR', referencedName: name, referencedType: 'TABLE' }));
		expect(tableUses([{ type: 'PACKAGE BODY', line: 1, text: "SELECT * FROM HR.A; UPDATE B SET X=1; -- DELETE FROM A\nx := 'INSERT INTO A';" }], dependencies).map(t => t.operations)).toEqual([['SELECT'], ['UPDATE']]);
	});
});
