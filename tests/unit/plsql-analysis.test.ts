import { it, expect } from 'vitest';
import { routines, matchRoutine } from '../../src/plsql/analysis.js';
import { tableUses, documentPlsql, renderPlsqlMarkdown } from '../../src/plsql/index.js';
import { buildGraph, renderMermaid } from '../../src/plsql/diagram.js';
import { loadConfig } from '../../src/config/index.js';
import type { SourceRow, ArgumentRow } from '../../src/plsql/dictionary.js';
import type { OracleSession } from '../../src/contracts.js';
const source = (text: string, type = 'PACKAGE BODY'): SourceRow[] => text.split('\n').map((text, i) => ({ type, line: i + 1, text: text + '\n' }));
const deps = ['A', 'B', 'C'].map(name => ({ owner: 'HR', name: 'PKG', type: 'PACKAGE BODY', referencedOwner: 'HR', referencedName: name, referencedType: 'TABLE' }));
const arg = (type: string): ArgumentRow[] => [{ name: 'X', type, subprogramId: 1, overload: '1', position: 1, sequence: 1, level: 0, mode: 'IN', defaulted: 'Y' }];
it('bounds named and unnamed ends, skips nested routines and forward declarations, and matches overload types', () => {
	const parsed = routines(source(`PACKAGE BODY PKG AS
 PROCEDURE P(X NUMBER);
 PROCEDURE P(X NUMBER) IS
  PROCEDURE LOCAL IS BEGIN DELETE FROM C; END LOCAL;
 BEGIN
  IF X > 0 THEN UPDATE A SET V=1; END IF;
  FOR I IN 1..2 LOOP BEGIN INSERT INTO B VALUES(1); END; END LOOP;
 END P;
 PROCEDURE P(X VARCHAR2) IS
 BEGIN
  DELETE FROM B;
 END;
END PKG;`));
	expect(parsed).toHaveLength(3);
	const body = matchRoutine(parsed.filter(r => r.range), 'P', arg('NUMBER'))!;
	expect(body.range).toEqual({ type: 'PACKAGE BODY', startLine: 3, endLine: 8, heuristic: true });
	expect(tableUses(body.rows, deps).filter(t => t.operations.length).map(t => [t.name, t.operations])).toEqual([['A', ['UPDATE']], ['B', ['INSERT']]]);
	expect(matchRoutine(parsed.filter(r => r.range), 'P', arg('VARCHAR2'))?.range?.startLine).toBe(9);
	expect(matchRoutine([body, body], 'P', arg('NUMBER'))).toBeUndefined();
	expect(matchRoutine([body], 'P', arg('VARCHAR2'))).toBeUndefined();
	expect(routines(source('PROCEDURE P IS BEGIN UPDATE A SET V=1;'))[0]?.range).toBeNull();
});
it('extracts DEFAULT and := expressions with nested commas and adjacent spec comments', () => {
	const parsed = routines(source(`PACKAGE PKG AS
-- number overload
PROCEDURE P(X NUMBER DEFAULT round(25, 0));
PROCEDURE P(X VARCHAR2 := '[REDACTED]');
END;`, 'PACKAGE'));
	expect(matchRoutine(parsed, 'P', arg('NUMBER'))?.parameters[0]?.default).toBe('round(25, 0)');
	expect(matchRoutine(parsed, 'P', arg('NUMBER'))?.comments).toBe('-- number overload');
	expect(matchRoutine(parsed, 'P', arg('VARCHAR2'))?.parameters[0]?.default).toBe("'[REDACTED]'");
	const comments = routines(source('/* first */\nPROCEDURE A;\n/* second */\nPROCEDURE B;', 'PACKAGE'));
	expect(comments[1]?.comments).toBe('/* second */');
});
it('emits operation labels only for observed subprogram tables and parses fully qualified job entry points', () => {
	const signatures = [{ name: 'P', subprogramId: 1, overload: null, bodyRange: { type: 'PACKAGE BODY', startLine: 1, endLine: 3, heuristic: true as const }, tables: [{ owner: 'HR', name: 'A', operations: ['UPDATE'], heuristic: true as const }] }];
	const jobs = ['BEGIN OTHER.PKG.P; END;', 'BEGIN HR . PKG . P; END;'].map((action, i) => ({ owner: 'HR', name: `J${i}`, type: 'PLSQL_BLOCK', action, state: 'SCHEDULED', enabled: 'TRUE' }));
	const graph = buildGraph('HR.PKG', signatures, deps, jobs, deps.map(d => ({ owner: 'HR', name: d.referencedName, operations: [], heuristic: true })));
	expect(graph.edges).toContainEqual({ from: 'subprogram:HR.PKG:1:', to: 'table:HR.A', kind: 'may-use', heuristic: true, label: 'UPDATE' });
	expect(graph.edges.some(e => e.from.startsWith('subprogram:') && e.to === 'table:HR.B')).toBe(false);
	expect(graph.edges.find(e => e.from === 'job:HR.J0')?.to).toBe('object:HR.PKG');
	expect(graph.edges.find(e => e.from === 'job:HR.J1')?.to).toBe('subprogram:HR.PKG:1:');
	expect(renderMermaid(graph)).toContain('|UPDATE|');
});
it('enriches defaults, excludes package self-callers, and renders tight lists with fenced declarations and summary', async () => {
	const config = loadConfig();
	const query: OracleSession['query'] = async sql => {
		let rows: unknown[][] = [];
		if (sql.includes('_PROCEDURES')) rows = [['P', 1, null]];
		if (sql.includes('_ARGUMENTS')) rows = [['X', 1, null, 1, 1, 0, 'IN', 'NUMBER', 'Y']];
		if (sql.includes('_SOURCE')) rows = [...source('PACKAGE PKG AS\nPROCEDURE P(X NUMBER DEFAULT 25);\nEND;', 'PACKAGE'), ...source('PACKAGE BODY PKG AS\nPROCEDURE P(X NUMBER) IS BEGIN UPDATE A SET V=1; END P;\nEND;')].map(r => [r.type, r.line, r.text]);
		if (sql.includes('_DEPENDENCIES')) rows = sql.includes('WHERE REFERENCED_OWNER') ? [['HR', 'PKG', 'PACKAGE BODY', 'HR', 'PKG', 'PACKAGE'], ['HR', 'CALLER', 'PROCEDURE', 'HR', 'PKG', 'PACKAGE']] : deps.map(d => [d.owner, d.name, d.type, d.referencedOwner, d.referencedName, d.referencedType]);
		return { rows, columns: [], truncated: false, elapsedMs: 0 };
	};
	const doc = await documentPlsql({ config, sessions: { get: async () => ({ query, close: async () => {} } as OracleSession), closeAll: async () => {} }, audit: { record: async () => {} }, runId: 'test' }, 'd1-19c-lab', 'HR.PKG');
	expect(doc.signatures[0]?.signature).toContain('DEFAULT 25');
	expect(doc.signatures[0]?.tables.map(t => t.name)).toEqual(['A']);
	expect(doc.callers.rows.map(c => c.name)).toEqual(['CALLER']);
	const md = renderPlsqlMarkdown(doc);
	expect(md).toContain('Summary: 1 subprograms, 1 tables written, 0 jobs');
	expect(md).toContain('```plsql\nPROCEDURE P(X NUMBER DEFAULT 25);\n```');
	expect(md).not.toMatch(/^- .*\n\n- /m);
	expect(md).not.toContain('dictionary default expression unavailable');
});
