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
// Keep JavaScript literal boundaries: neighboring fragments and English prose
// must never be stitched into a synthetic SQL FROM clause. Visit interpolations
// recursively so nested templates and quoted dictionary choices stay visible.
function literals(source: string): string[] {
	if (/^\s*(?:SELECT|WITH)\b/i.test(source)) return [source];
	const result: string[] = [];
	let i = 0;
	function code(interpolation = false): void {
		let depth = 0;
		while (i < source.length) {
			const c = source[i]!;
			if (source.startsWith('//', i)) { while (i < source.length && source[i] !== '\n') i++; }
			else if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; }
			else if (c === '/' && /(?:[=(,:!?\[{};>]|\breturn)\s*$/.test(source.slice(0, i))) {
				i++; let inClass = false;
				while (i < source.length) {
					const token = source[i++]!;
					if (token === '\\') i++;
					else if (token === '[') inClass = true;
					else if (token === ']') inClass = false;
					else if (token === '/' && !inClass) break;
				}
			}
			else if (c === "'" || c === '"' || c === '`') quoted(c);
			else if (c === '{') { depth++; i++; }
			else if (c === '}' && interpolation && depth === 0) { i++; return; }
			else { if (c === '}') depth--; i++; }
		}
	}
	function quoted(delimiter: string): void {
		i++;
		let text = '';
		while (i < source.length) {
			if (source[i] === '\\') { text += source[i + 1] ?? ''; i += 2; }
			else if (source[i] === delimiter) { i++; result.push(text); return; }
			else if (delimiter === '`' && source.startsWith('${', i)) {
				const start = i; i += 2; code(true); text += source.slice(start, i);
			} else text += source[i++]!;
		}
	}
	code();
	return result;
}
function references(source: string): string[] {
	// Resolve finite identifier fragments conservatively. Include every quoted
	// dictionary name below as well: runtime-selected views must be covered too.
	const values = new Map<string, string[]>();
	for (const m of source.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*(['"])([A-Z][A-Z0-9_$#]*)\2/gi)) values.set(m[1]!, [m[3]!]);
	for (const m of source.matchAll(/\[([^\]\n]+)\]\.map\(\s*(\w+)\s*=>/g)) {
		values.set(m[2]!, [...m[1]!.matchAll(/['"]([A-Z][A-Z0-9_$#]*)['"]/gi)].map(v => v[1]!));
	}
	const expanded = literals(source).flatMap(literal => {
		let variants = [literal];
		for (const [name, options] of values) {
			if (literal.includes('${' + name + '}')) variants = variants.flatMap(text => options.map(option => text.split('${' + name + '}').join(option)));
		}
		return variants;
	});
	const identifier = '(?:"[A-Z_][A-Z0-9_$#]*"|[A-Z_][A-Z0-9_$#]*)';
	const relation = `(${identifier}(?:\\s*\\.\\s*${identifier})?)(?![A-Z0-9_$#{])`;
	return expanded.flatMap(raw => {
		const named = /^(?:V\$|DBA_|ALL_|USER_)[A-Z][A-Z0-9_#]*$/i.test(raw) ? [raw.toUpperCase()] : [];
		if (!/\bSELECT\b/i.test(raw) && !/^\s*(?:(?:FROM|JOIN)\b|(?:V\$|DBA_|ALL_)[A-Z0-9_$#]+\s+JOIN\b)/i.test(raw)) return named;
		const sql = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
		const normalize = (name: string) => name.replace(/["\s]/g, '').toUpperCase().replace(/^SYS\./, '');
		const direct = [...sql.matchAll(new RegExp(`\\b(?:FROM|JOIN)\\s+${relation}`, 'gi'))].map(m => normalize(m[1]!));
		// Scan comma relations only within FROM clauses, never SELECT lists or
		// function arguments. Nested subqueries are scanned independently too.
		const comma: string[] = [];
		const alias = '(?:"(?:[^"]|"")*"|[A-Z_][A-Z0-9_$#]*)';
		const fromList = new RegExp(`\\bFROM\\s+${relation}(?:\\s+(?!WHERE\\b|JOIN\\b|GROUP\\b|ORDER\\b)${alias})?((?:\\s*,\\s*${identifier}(?:\\s*\\.\\s*${identifier})?(?:\\s+(?!WHERE\\b|JOIN\\b|GROUP\\b|ORDER\\b)${alias})?)+)`, 'gi');
		for (const clause of sql.matchAll(fromList)) {
			for (const m of clause[2]!.matchAll(new RegExp(`,\\s*${relation}`, 'gi'))) comma.push(normalize(m[1]!));
		}
		return [...direct, ...comma, ...named];
	});
}
// Only file-scoped non-view names are permitted. Never add dictionary views here.
// Prose/comment tokens, regex fragments and TABLE(...) function syntax found
// by the deliberately conservative source scan. Scope them to their source file.
// V$DIAG is only the triage router's family prefix, not a queried relation.
const NON_VIEWS: Record<string, readonly string[]> = {
	// Generated date-formatting CTE, not a grantable database view.
	'oracle/index.ts': ['PIAGENT_WALL_QUERY'],
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
	'tools/overview.ts': [],
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
	backup: 'backup', jobs: 'jobs', report: 'report', sessions: 'sessions', space: 'space', security: 'security',
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

it.each([
	['comma joins', 'SELECT * FROM FIRST_VIEW a, SYS.SECOND_VIEW b WHERE a.id=b.id', ['FIRST_VIEW', 'SECOND_VIEW']],
	['quoted identifiers', 'SELECT * FROM "SYS" . "NEW_VIEW" JOIN "OTHER_VIEW" ON 1=1', ['NEW_VIEW', 'OTHER_VIEW']],
	['optimizer hints', 'SELECT /*+ FULL(a) */ * FROM /*+ NO_MERGE */ NEW_VIEW a JOIN /* hint */ OTHER_VIEW b ON 1=1', ['NEW_VIEW', 'OTHER_VIEW']],
	['interpolated constant', "const view = 'NEW_VIEW'; const sql = `SELECT * FROM ${view}`", ['NEW_VIEW']],
	['interpolated fragments', "const prefix = 'DBA'; const suffix = 'NEW_VIEW'; const sql = `SELECT * FROM ${prefix}_${suffix}`", ['DBA_NEW_VIEW']],
	['interpolated family', "['DBA', 'ALL'].map(p => `SELECT * FROM ${p}_NEW_VIEW`)", ['DBA_NEW_VIEW', 'ALL_NEW_VIEW']],
])('detects %s for catalog and grant coverage', (_label, source, expected) => {
	expect(references(source)).toEqual(expect.arrayContaining(expected));
	const catalog = new Set<string>();
	expect([...new Set(references(source))].filter(view => !catalog.has(view))).toEqual(expect.arrayContaining(expected));
});

it('does not treat SELECT/function commas or hints as relation names', () => {
	const found = references('SELECT a, FAKE_COLUMN, COALESCE(x, FAKE_ARG) FROM REAL_VIEW WHERE x IN (1, FAKE_VALUE) /* JOIN FAKE_HINT */');
	expect(found).toEqual(['REAL_VIEW']);
});

it.each([
	['quoted aliases', 'SELECT * FROM "SYS"."FIRST_VIEW" "a", "SYS"."UNGRANTED_VIEW" "b" WHERE "a".id="b".id', ['FIRST_VIEW', 'UNGRANTED_VIEW']],
	['dollar aliases', 'SELECT * FROM FIRST_VIEW "a alias", SECOND_VIEW b#2, THIRD_VIEW "c alias"', ['FIRST_VIEW', 'SECOND_VIEW', 'THIRD_VIEW']],
	['lowercase view', "const view = 'v$session'; const sql = `select * from ${view}`", ['V$SESSION']],
	['mixed-case fragments', "const prefix = 'dBa'; const suffix = 'new_view'; const sql = `SELECT * FROM ${prefix}_${suffix}`", ['DBA_NEW_VIEW']],
	['lowercase family', "['dba', 'All'].map(p => `select * from ${p}_new_view`)", ['DBA_NEW_VIEW', 'ALL_NEW_VIEW']],
])('retains coverage with %s', (_label, source, expected) => {
	expect(references(source)).toEqual(expect.arrayContaining(expected));
});

it('ignores diagnostic prose, comments and adjacent code without ignore-list entries', () => {
	expect(references(`
		// SELECT * FROM COMMENT_VIEW
		const note = 'identity fields retained from connection, other facts NULL.';
		const select = 'SELECT x FROM ';
		const where = ' WHERE x = 1';
		const code = 'JOIN '; const next = 'CODE_FRAGMENT';
		const sql = 'SELECT * FROM REAL_VIEW';
	`)).toEqual(['REAL_VIEW']);
});

it('keeps nested SQL templates and quoted dictionary choices visible', () => {
	expect(references('const sql = `SELECT * FROM FIRST_VIEW WHERE x IN (${flag ? `SELECT x FROM SECOND_VIEW` : `SELECT x FROM THIRD_VIEW`})`;'))
		.toEqual(expect.arrayContaining(['FIRST_VIEW', 'SECOND_VIEW', 'THIRD_VIEW']));
});

it('retains every previously scanned catalog relation in each source file', () => {
	const known = new Set([...Object.values(FEATURE_VIEWS).flat(), ...NO_GRANT_VIEWS]);
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		const previous = [
			...[...source.matchAll(/\b(?:FROM|JOIN)\s+((?:[A-Z_][A-Z0-9_$#]*\.)?[A-Z_][A-Z0-9_$#]*)/gi)].map(m => m[1]!.toUpperCase().replace(/^SYS\./, '')),
			...[...source.matchAll(/['"`]((?:V\$|DBA_|ALL_|USER_)[A-Z][A-Z0-9_#]*)['"`]/gi)].map(m => m[1]!.toUpperCase()),
		].filter(view => known.has(view));
		expect(references(source), file).toEqual(expect.arrayContaining([...new Set(previous)]));
	}
});

it('keeps literals after regular expressions containing quotes visible', () => {
	expect(references(`const pattern = /[^\\s'"<>]*\\.trc\\b/gi; const sql = 'SELECT * FROM NEW_VIEW';`)).toEqual(['NEW_VIEW']);
});

it('handles escaped quotes inside comma-join aliases', () => {
	expect(references('SELECT * FROM FIRST_VIEW "a""alias", SECOND_VIEW b$1, THIRD_VIEW c#2'))
		.toEqual(['FIRST_VIEW', 'SECOND_VIEW', 'THIRD_VIEW']);
});
