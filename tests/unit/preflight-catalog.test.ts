import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { FEATURE_VIEWS, grantObject } from '../../src/preflight/views.js';
import { checkTarget } from '../../src/preflight/index.js';

// These views expose only objects/privileges already visible to the session.
// No additional object grant is needed. Keep names explicit so new views are reviewed.
const NO_GRANT_VIEWS = new Set(`
ALL_ARGUMENTS ALL_CONSTRAINTS ALL_CONS_COLUMNS ALL_DEPENDENCIES ALL_ERRORS
ALL_INDEXES ALL_IND_COLUMNS ALL_IND_EXPRESSIONS ALL_IND_PARTITIONS ALL_IND_STATISTICS
ALL_IND_SUBPARTITIONS ALL_OBJECTS ALL_PROCEDURES ALL_SCHEDULER_JOBS
ALL_SCHEDULER_JOB_RUN_DETAILS ALL_SOURCE ALL_SYNONYMS ALL_TABLES ALL_TAB_COLUMNS
ALL_TAB_STATISTICS ALL_USERS ALL_VIEWS USER_TAB_PRIVS USER_TAB_PRIVS_RECD
SESSION_PRIVS SESSION_ROLES DUAL
`.trim().split(/\s+/));
const root = fileURLToPath(new URL('../../src/', import.meta.url)).replace(/\/$/, '');
function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
		? sources(`${dir}/${entry.name}`) : /\.(?:ts|js)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
}
// Scan all source text conservatively (including fragments and examples).
// Imports are module paths, not SQL; comments/prose are classified per file.
function literals(source: string): string[] {
	return [source.replace(/^.*\b(?:import|export)\b[^\n]*\bfrom\s+['"][^'"\n]+['"];?$/gm, '')];
}
function references(source: string): string[] {
	return literals(source).flatMap(sql => [
		...Array.from(sql.matchAll(/\b(?:FROM|JOIN)\s+((?:[A-Z_][A-Z0-9_$#]*\.)?[A-Z_][A-Z0-9_$#]*)/gi), m => m[1]!.toUpperCase().replace(/^SYS\./, '')),
		...Array.from(sql.matchAll(/['"`]((?:V\$|DBA_|ALL_|USER_)[A-Z][A-Z0-9_#]*)['"`]/gi), m => m[1]!.toUpperCase()),
	]);
}
// Only file-scoped non-view names are permitted. Never add dictionary views here.
// Prose/comment tokens, regex fragments and TABLE(...) function syntax found
// by the deliberately conservative source scan. Scope them to their source file.
// V$DIAG is only the triage router's family prefix, not a queried relation.
const NON_VIEWS: Record<string, readonly string[]> = {
	'agent/grounding.ts': ['ON', 'WHERE'],
	'agent/index.ts': ['EXISTING'],
	'alertlog/index.ts': ['AND'],
	'cli/chatTriage.ts': ['OMITTED', 'PROOF'],
	'cli/index.ts': ['SAVED'],
	'oracle/sqlPolicy.ts': ['A', 'DBMS_XPLAN', 'JOIN', 'TABLE'],
	'plsql/index.ts': ['IN', 'IS'],
	'report/history.ts': ['ONE'],
	'report/queries.ts': ['TOOLS'],
	'sessions/index.ts': ['BLOCKER'],
	'space/index.ts': ['THIS'],
	'sqlperf/index.ts': ['TABLE'],
	'tools/index.ts': ['COMPLETE', 'INNER', 'LIST', 'LISTS', 'TABLE', 'WHERE'],
	'tools/overview.ts': ['CONNECTION'],
	'triage/alerts.ts': ['ALERT', 'BOUNDED', 'COMPLETING'],
	'triage/history.ts': ['THE'],
	'triage/index.ts': ['ALERT', 'BOUNDED', 'ITS', 'THE', 'V$DIAG'],
	'triage/names.ts': ['CANDIDATES', 'DELIBERATE'],
	'triage/predicates.ts': ['PARENT'],
	'triage/words.ts': ['HAD', 'TABLE'],
	'web/static/alertlog.js': ['THE'],
};
// Application tables are permitted only when explicitly configured in packaged
// targets. Dynamic ${log.table} reads are validated by config, not fixed SQL.
const configuredTables = new Set<string>((JSON.parse(readFileSync(new URL('../../config/targets.json', import.meta.url), 'utf8'))
	.targets as { logTables?: { table: string }[] }[]).flatMap(target => target.logTables?.map(log => log.table.toUpperCase()) ?? []));
const MODULE_FEATURE: Record<string, string> = {
	report: 'report', sessions: 'sessions', space: 'space', security: 'security',
	sqlperf: 'sql', alertlog: 'alertlog', plsql: 'plsql', triage: 'triage',
	tools: 'ask', oracle: 'connection', drift: 'drift', top: 'top',
};
const files = sources(root).filter(path => !path.startsWith(`${root}/preflight/`));
function composedReferences(path: string, source: string): string[] {
	const views: string[] = [];
	if (path === 'plsql/dictionary.ts') for (const m of source.matchAll(/this\.read(?:<[^>]+>)?\('([A-Z_]+)'/g)) views.push(`DBA_${m[1]}`, `ALL_${m[1]}`);
	if (path.startsWith('triage/')) for (const m of source.matchAll(/reader\.read\([^,]+,\s*'([A-Z_]+)'/g)) views.push(`DBA_${m[1]}`, `ALL_${m[1]}`);
	if (path === 'tools/index.ts') {
		for (const m of source.matchAll(/\b(?:FROM|JOIN)\s+ALL_([A-Z_]+)\b/gi)) views.push(`DBA_${m[1]!.toUpperCase()}`);
		const hints = /const emptyHintViews = new Set\(`([^`]+)`/.exec(source)![1]!;
		views.push(...hints.trim().split(/\s+/).map(suffix => `DBA_${suffix}`));
	}
	if (path === 'sqlperf/index.ts') for (const prefix of ['TAB', 'IND']) views.push(`DBA_${prefix}_STATISTICS`, `ALL_${prefix}_STATISTICS`);
	return views;
}
function missingReferences(perFeature: boolean): string[] {
	const union = new Set(Object.values(FEATURE_VIEWS).flat());
	const missing: string[] = [];
	for (const file of files) {
		const path = file.slice(root.length + 1), source = readFileSync(file, 'utf8');
		const feature = MODULE_FEATURE[path.split('/')[0]!];
		const catalog = perFeature && feature ? new Set(FEATURE_VIEWS[feature] ?? []) : union;
		for (const view of [...references(source), ...composedReferences(path, source)]) {
			if (NO_GRANT_VIEWS.has(view) || NON_VIEWS[path]?.includes(view) || configuredTables.has(view)) continue;
			if (!catalog.has(view)) missing.push(`${path} (${feature ?? 'union'}): ${view}`);
		}
	}
	return [...new Set(missing)].sort();
}
it('classifies every fixed FROM/JOIN identifier across src', () => {
	expect(missingReferences(false)).toEqual([]);
});
it('each module has its grantable views in its own feature', () => {
	expect(missingReferences(true)).toEqual([]);
});
it('captures unfamiliar dictionary names and SYS qualification without a prefix filter', () => {
	expect(references("const sql = 'SELECT * FROM SYS.NEW_DICTIONARY_VIEW JOIN ANOTHER_VIEW ON 1=1'"))
		.toEqual(['NEW_DICTIONARY_VIEW', 'ANOTHER_VIEW']);
});
it('uses actual grant objects and deduplicates grants shared by features', async () => {
	const result = await checkTarget({ get: async () => ({
		target: { username: 'reader' }, identity: { isCdb: false },
		query: async () => { throw new Error('ORA-00942'); }, close: async () => {},
	}), closeAll: async () => {} } as any, 'lab');
	expect(grantObject('V$TEMPSEG_USAGE')).toBe('V_$SORT_USAGE');
	expect(grantObject('V$SQL')).toBe('V_$SQL');
	expect(grantObject('DBA_USERS')).toBe('DBA_USERS');
	expect(result.grantsSql.filter(sql => sql.includes('V_$SORT_USAGE'))).toEqual(['GRANT SELECT ON SYS.V_$SORT_USAGE TO "READER";']);
	expect(result.grantsSql.some(sql => sql.includes('V_$TEMPSEG_USAGE'))).toBe(false);
	for (const view of FEATURE_VIEWS.ask!) expect(result.views).toContainEqual({ feature: 'ask', view, status: 'missing' });
});

it('grant template covers every grantable catalog base object', () => {
	const template = readFileSync(new URL('../../docs/grants-template-pdb.sql', import.meta.url), 'utf8');
	const grants = new Set([...template.matchAll(/^GRANT SELECT ON SYS\.([A-Z0-9_$]+) TO /gm)].map(m => m[1]));
	const missing = [...new Set(Object.values(FEATURE_VIEWS).flat())]
		.filter(view => !NO_GRANT_VIEWS.has(view) && !grants.has(grantObject(view)));
	expect(missing).toEqual([]);
});
