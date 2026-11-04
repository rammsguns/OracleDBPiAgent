import { it, expect } from 'vitest';
import { redactCredentials } from '../../src/triage/redact.js';
import { aggregateSql, mutations, predicateRisk, type Mutation } from '../../src/triage/predicates.js';
import { diagnosePredicates } from '../../src/triage/diagnose.js';
import { TriageReader } from '../../src/triage/read.js';
import { Dictionary } from '../../src/plsql/dictionary.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { loadConfig } from '../../src/config/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';
it('redacts only credential-looking literals and connections, including multiline and named arguments', () => {
	for (const original of ["INTERVAL '7' DAY", "status = 'SHIPPED'", "status = 'NEW'", "raise_application_error(-20001, 'destination unavailable')", "x := 'ordinary';", "x := q'[ordinary]';", '"OWNER"."OBJECT"']) expect(redactCredentials(original)).toBe(original);
	for (const original of ["password := 'sensitive';", "pwd => 'sensitive'", "p_secret := q'[sensitive]';", "api_key => 'sensitive'", "token :=\n'sensitive';", "IDENTIFIED BY sensitive", 'IDENTIFIED BY "sensitive"', "x := 'user/sensitive@dsn';", "x := 'oracle://user:sensitive@host/db';", "x := 'password=sensitive;host=localhost';", "connect user/sensitive@dsn", 'connect user/"sensitive"@dsn', "-- don't log this\npassword := 'sensitive';", "password := 'sensi' || 'tive';", "password := q'!sensi!' || q'~tive~';", "password := 'sensi\ntive';", "password := q'[sensi\ntive]';"]) expect(redactCredentials(original)).not.toMatch(/sensitive|sensi|tive/);
	expect(redactCredentials("password := 'sensi\ntive';\nx := 'NEW';").split('\n')).toHaveLength(3);
});
const mutation = (predicate: string, operation: 'DELETE' | 'UPDATE' = 'DELETE'): Mutation => ({ table: 'PARENT', predicate, operation, line: 10, text: '', assigned: ['ID'] });
it('detects relative cutoffs and predicate differences, without flagging a shared cutoff or identical static selection', () => {
	for (const clock of ['SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP']) {
		const child = mutation(`P_ID IN (SELECT ID FROM PARENT WHERE CREATED < ${clock} - 7)`);
		expect(predicateRisk(child, mutation(`CREATED < ${clock} - 7`), 'APP.PARENT').risk).toBe(true);
	}
	for (const predicate of ['CREATED < V_CUTOFF', 'ID < 7']) expect(predicateRisk(mutation(`P_ID IN (SELECT ID FROM PARENT WHERE ${predicate})`), mutation(predicate), 'APP.PARENT').risk).toBe(false);
	for (const [left, right] of [['ID < 7', 'ID < 8'], ["STATUS = 'new'", "STATUS = 'NEW'"]]) expect(predicateRisk(mutation(`P_ID IN (SELECT ID FROM PARENT WHERE ${left})`), mutation(right!), 'APP.PARENT').risk).toBe(true);
});
it('generates only aggregate checks from a small safe predicate grammar and positional FK columns', () => {
	const sql = aggregateSql(mutation("CREATED < SYSTIMESTAMP - INTERVAL '7' DAY"), 'APP.CHILD', 'APP.PARENT', ['P_ID', 'P_REV'], ['ID', 'REV'])!;
	classifySql(sql); expect(sql).toContain('SELECT COUNT(*)'); expect(sql).toContain('c.P_REV = p.REV'); expect(sql).toContain("INTERVAL '7' DAY");
	for (const predicate of ['ID = APP.SIDE_EFFECT()', 'ID IN (SELECT ID FROM OTHER)', 'ID = :secret', "CREATED < SYSTIMESTAMP; DELETE FROM T", "X = '[REDACTED]'"]) expect(aggregateSql(mutation(predicate), 'APP.CHILD', 'APP.PARENT', ['P_ID'], ['ID'])).toBeUndefined();
	expect(aggregateSql(mutation('ID < 7'), 'APP.CHILD', 'APP.PARENT', [], [])).toBeUndefined();
});
it('finds DELETE and key UPDATE statements at their source lines, ignoring comment/literal decoys', () => {
	const rows = ['BEGIN', "x := 'DELETE FROM decoy WHERE ID=1;'; -- UPDATE decoy", 'DELETE FROM child WHERE p_id IN (SELECT ID FROM parent WHERE ID < 7);', 'UPDATE parent SET ID = ID + 1 WHERE ID < 8;', 'END;'].map((text, i) => ({ type: 'PROCEDURE', line: i + 1, text }));
	expect(mutations(rows).map(m => [m.operation, m.table, m.line, m.assigned])).toEqual([['DELETE', 'CHILD', 3, []], ['UPDATE', 'PARENT', 4, ['ID']]]);
});
function context(query: OracleSession['query']): ToolContext {
	return { config: loadConfig(), runId: 'triage-review', audit: { record: async () => {} }, sessions: { get: async () => ({ query, close: async () => {} } as OracleSession), closeAll: async () => {} } };
}
it('uses the selected subprogram only; ranks the boundary hypothesis, executes COUNT with timeout and reports unavailable tables', async () => {
	const rows = ['PACKAGE BODY pkg IS', 'PROCEDURE purge IS', 'BEGIN', "DELETE FROM child WHERE p_id IN (SELECT id FROM parent WHERE created < SYSDATE - 7);", "DELETE FROM parent WHERE created < SYSDATE - 7;", 'END;', 'END;'].map((text, i) => ({ type: 'PACKAGE BODY', line: i + 1, text }));
	const constraints = [{ rows: [['APP', 'FK_CHILD', 'R', 'CHILD']] }] as Parameters<typeof diagnosePredicates>[2];
	for (const unavailable of [false, true]) {
		let countCalls = 0;
		const ctx = context(async (sql, _binds, opts) => {
			classifySql(sql);
			if (sql.startsWith('SELECT COUNT')) { countCalls++; expect(opts?.maxRows).toBe(1); expect(opts?.timeoutSeconds).toBe(30); if (unavailable) throw new Error('ORA-00942'); return { rows: [[12]], columns: ['CHILD_ROWS'], truncated: false, elapsedMs: 0 }; }
			return { rows: [], columns: [], truncated: false, elapsedMs: 0 };
		});
		const reader = new TriageReader(ctx, 'p1-19c-prod');
		reader.checks.push(...[
			{ label: 'Parent/key table for APP.FK_CHILD', rows: [['APP', 'PK_PARENT', 'PARENT']] },
			{ label: 'Columns for APP.PK_PARENT', rows: [['APP', 'PK_PARENT', 'PARENT', 'ID', 1]] },
			{ label: 'Columns for APP.FK_CHILD', rows: [['APP', 'FK_CHILD', 'CHILD', 'P_ID', 1]] },
		] as typeof reader.checks);
		const source = new Map([['APP.PKG', { rows, view: 'DBA_SOURCE', status: 'ok' as const, attempts: [], truncated: false }]]);
		const excerpts = [{ object: 'APP.PKG', subprogram: 'PURGE', line: 5 }] as Parameters<typeof diagnosePredicates>[0];
		const result = await diagnosePredicates(excerpts, source, constraints, reader, new Dictionary(ctx, 'p1-19c-prod', redactCredentials));
		expect(result.hypotheses[0]?.title).toContain('Cutoff evaluated twice'); expect(result.hypotheses[0]?.evidence.join(' ')).toMatch(/line 4[\s\S]*line 5/);
		expect(countCalls).toBe(1); expect(reader.checks.find(c => c.label.startsWith('Current child'))?.status).toBe(unavailable ? 'unavailable' : 'ok');
		expect(result.suggestions.join(' ')).toContain('capture the cutoff once');
		const wrongProgram = await diagnosePredicates([{ ...excerpts[0]!, subprogram: 'OTHER' }], source, constraints, reader, new Dictionary(ctx, 'p1-19c-prod'));
		expect(wrongProgram.hypotheses).toEqual([]); expect(countCalls).toBe(1);
	}
});
it('preserves business literals and redacts credentials across dictionary source pages', async () => {
	let page = 0;
	const ctx = context(async sql => {
		let rows: unknown[][] = [], truncated = false;
		if (sql.includes('_SOURCE')) { page++; rows = page === 1 ? [['PROCEDURE', 1, "PROCEDURE P IS\npassword := 'sensi\n"]] : [['PROCEDURE', 2, "tive';\nBEGIN status := 'NEW'; END;"]]; truncated = page === 1; }
		return { rows, truncated, columns: [], elapsedMs: 0 };
	});
	const source = await new Dictionary(ctx, 'p1-19c-prod', redactCredentials).source('APP', 'P');
	expect(JSON.stringify(source)).not.toMatch(/sensi|tive/); expect(JSON.stringify(source)).toContain("'NEW'");
});
it('explains dropped job history and uses code spans for statements containing <', async () => {
	const ctx = context(async sql => ({ rows: sql.includes('_JOB_RUN_DETAILS') ? [['K7Q_OWNER', 'K7Q_FAILJOB', 'FAILED', 20001, '2026-10-26', 'ORA-20001: destination unavailable\nORA-06512: at line 1']] : [], columns: [], truncated: false, elapsedMs: 0 }));
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'K7Q_OWNER.K7Q_FAILJOB', since: '30d' });
	expect(result.issues[0]?.limitations.join(' ')).toContain('dropped or auto-dropped'); expect(result.issues[0]?.hypotheses[0]?.title).toContain('RAISE_APPLICATION_ERROR');
	const issue = result.issues[0]!; issue.excerpts[0]!.statement = 'DELETE FROM T WHERE ID < 7;';
	const markdown = renderTriageMarkdown(result); expect(markdown).toContain('`DELETE FROM T WHERE ID < 7;`'); expect(markdown).not.toContain('ID &lt;'); expect(markdown).not.toContain('Review the rows above');
});
