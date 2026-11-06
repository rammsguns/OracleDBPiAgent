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
it('catalog covers fixed SQL views throughout src, including view-name literals', () => {
	const catalog = new Set(Object.values(FEATURE_VIEWS).flat());
	const missing: string[] = [];
	for (const path of sources(root)) {
		if (path.startsWith(`${root}preflight/`)) continue;
		const source = readFileSync(path, 'utf8');
		// FROM/JOIN catches embedded SQL; exact literals catch view parameters and
		// dynamically assembled queries. Arbitrary run_query input is not fixed SQL.
		const refs = [...source.matchAll(/\b(?:FROM|JOIN)\s+(?:SYS\.)?((?:V\$|DBA_|ALL_|USER_|SESSION_)[A-Z0-9_$#]+|NLS_DATABASE_PARAMETERS|PRODUCT_COMPONENT_VERSION|ROLE_TAB_PRIVS|PROXY_USERS|AUDIT_UNIFIED_[A-Z_]+|DUAL)\b/gi),
			...source.matchAll(/['"`]((?:V\$|DBA_|ALL_|USER_)[A-Z][A-Z0-9_#]*)['"`]/gi)];
		for (const match of refs) {
			const view = match[1]!.toUpperCase();
			// V$DIAG is a triage routing prefix, not a queried view.
			if (view === 'V$DIAG') continue;
			if (!catalog.has(view) && !NO_GRANT_VIEWS.has(view)) missing.push(`${path.slice(root.length + 1)}: ${view}`);
		}
	}
	// Known composed SQL: PL/SQL dictionary suffixes and ask's ALL_ -> DBA_
	// fallbacks. Inspect call-site suffixes rather than freezing another catalog.
	const dictionary = readFileSync(`${root}/plsql/dictionary.ts`, 'utf8');
	for (const match of dictionary.matchAll(/this\.read(?:<[^>]+>)?\('([A-Z_]+)'/g)) {
		expect(catalog.has(`DBA_${match[1]}`), `dictionary: DBA_${match[1]}`).toBe(true);
	}
	const tools = readFileSync(`${root}/tools/index.ts`, 'utf8');
	for (const match of tools.matchAll(/\b(?:FROM|JOIN)\s+ALL_([A-Z_]+)\b/gi)) {
		if (['USERS'].includes(match[1]!.toUpperCase())) continue;
		expect(catalog.has(`DBA_${match[1]!.toUpperCase()}`), `ask fallback: DBA_${match[1]}`).toBe(true);
	}
	for (const prefix of ['TAB', 'IND']) expect(catalog.has(`DBA_${prefix}_STATISTICS`)).toBe(true);
	expect([...new Set(missing)].sort()).toEqual([]);
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

it('grant template covers every probed DBA_/V$ base object', () => {
	const template = readFileSync(new URL('../../docs/grants-template-pdb.sql', import.meta.url), 'utf8');
	const grants = new Set([...template.matchAll(/^GRANT SELECT ON SYS\.([A-Z0-9_$]+) TO /gm)].map(m => m[1]));
	const missing = [...new Set(Object.values(FEATURE_VIEWS).flat())]
		.filter(view => /^(?:DBA_|V\$)/.test(view) && !grants.has(grantObject(view)));
	expect(missing).toEqual([]);
});
