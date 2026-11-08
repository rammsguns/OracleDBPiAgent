// Oracle 19c documented domains, not domains inferred from currently present rows.
// NULL is not a string literal and is intentionally absent.
export const dictionaryDomains: Record<string, Record<string, readonly string[]>> = {
	DBA_USERS: {
		ORACLE_MAINTAINED: ['Y', 'N'], COMMON: ['YES', 'NO'], INHERITED: ['YES', 'NO'],
		ACCOUNT_STATUS: ['OPEN', 'EXPIRED', 'EXPIRED(GRACE)', 'LOCKED', 'LOCKED(TIMED)', 'EXPIRED & LOCKED', 'EXPIRED(GRACE) & LOCKED', 'EXPIRED & LOCKED(TIMED)', 'EXPIRED(GRACE) & LOCKED(TIMED)', 'OPEN & IN ROLLOVER', 'EXPIRED & IN ROLLOVER', 'EXPIRED & LOCKED & IN ROLLOVER', 'LOCKED & IN ROLLOVER', 'LOCKED(TIMED) & IN ROLLOVER', 'EXPIRED & LOCKED(TIMED) & IN ROL'],
	},
	DBA_OBJECTS: { ORACLE_MAINTAINED: ['Y', 'N'], STATUS: ['VALID', 'INVALID', 'N/A'] },
	DBA_DATA_FILES: { AUTOEXTENSIBLE: ['YES', 'NO'] },
	DBA_TEMP_FILES: { AUTOEXTENSIBLE: ['YES', 'NO'] },
	DBA_TAB_STATISTICS: { STALE_STATS: ['YES', 'NO'] },
	DBA_IND_STATISTICS: { STALE_STATS: ['YES', 'NO'] },
	DBA_SCHEDULER_JOBS: { ENABLED: ['TRUE', 'FALSE'] },
	DBA_SCHEDULER_JOB_RUN_DETAILS: { STATUS: ['SUCCEEDED', 'FAILED', 'STOPPED'] },
	DBA_INDEXES: { STATUS: ['VALID', 'UNUSABLE', 'N/A'] },
	DBA_IND_PARTITIONS: { STATUS: ['USABLE', 'UNUSABLE'] },
	DBA_IND_SUBPARTITIONS: { STATUS: ['USABLE', 'UNUSABLE'] },
	'V$DATABASE': { LOG_MODE: ['ARCHIVELOG', 'NOARCHIVELOG', 'MANUAL'] },
	DBA_TABLESPACES: { CONTENTS: ['PERMANENT', 'TEMPORARY', 'UNDO'] },
};

export function dictionaryDomainHint(sql: string, rowCount: number): string | undefined {
	if (rowCount) return;
	const rawTokens = [...sql.matchAll(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|[a-zA-Z_][a-zA-Z0-9_$#]*|\S/g)];
	// Prefixes are quoting syntax only when directly adjacent to an opening quote.
	if (rawTokens.some((t, i) => /^(N|Q|NQ)$/i.test(t[0]) && rawTokens[i + 1]?.[0].startsWith("'") && t.index + t[0].length === rawTokens[i + 1]!.index)) return;
	const tokens = rawTokens.map(t => t[0]).filter(t => !t.startsWith('--') && !t.startsWith('/*'));
	const upper = tokens.map(t => t.startsWith("'") ? t : t.toUpperCase());
	// Deliberately decline scopes, quoted identifiers, alternate/national strings,
	// joins and expressions rather than guessing column provenance or semantics.
	if (upper[0] !== 'SELECT' || upper.filter(t => t === 'SELECT').length !== 1 || upper.some(t => ['WITH', '"', 'UNION', 'MINUS', 'INTERSECT', 'NOT', 'CASE', 'COLLATE'].includes(t))) return;
	const from = upper.indexOf('FROM'), where = upper.indexOf('WHERE');
	if (from < 0 || where < from) return;
	const source = upper.slice(from + 1, where);
	if (source[0] === 'SYS' && source[1] === '.') source.splice(0, 2);
	if (source.length < 1 || source.length > 2 || !source.every(t => /^[A-Z_][A-Z0-9_$#]*$/.test(t))) return;
	const table = source[0]!, alias = source[1] ?? table, domains = dictionaryDomains[table];
	if (!domains) return;
	const end = upper.findIndex((t, i) => i > where && ['GROUP', 'ORDER', 'HAVING', 'FETCH', 'CONNECT', 'START'].includes(t));
	const predicates = upper.slice(where + 1, end < 0 ? undefined : end);
	if (predicates.some((t, i) => /^[A-Z_][A-Z0-9_$#]*$/.test(t) && predicates[i + 1] === '(' && !['IN', 'AND', 'OR'].includes(t))) return;
	for (let i = 0; i < predicates.length; i++) {
		if (i && !['AND', 'OR', '('].includes(predicates[i - 1]!)) continue;
		let cursor = i;
		const literals: string[] = [];
		const reversed = /^'(?:''|[^'])*'$/.test(predicates[cursor]!);
		if (reversed) {
			literals.push(predicates[cursor++]!);
			if (predicates[cursor++] !== '=') continue;
		}
		let column = predicates[cursor++]!;
		if (predicates[cursor] === '.') {
			if (column !== alias) continue;
			column = predicates[++cursor]!;
			cursor++;
		}
		const values = domains[column];
		if (!values) continue;
		if (!reversed) {
			const op = predicates[cursor++];
			if (op === '=') literals.push(predicates[cursor++] ?? '');
			else if (op === 'IN' && predicates[cursor++] === '(') {
				do { literals.push(predicates[cursor++] ?? ''); } while (predicates[cursor++] === ',');
				if (predicates[cursor - 1] !== ')') continue;
			} else continue;
		}
		if (cursor < predicates.length && !['AND', 'OR', ')', ';'].includes(predicates[cursor]!)) continue;
		if (!literals.length || literals.some(t => !/^'(?:''|[^'])*'$/.test(t) || values.includes(t.slice(1, -1).replace(/''/g, "'")))) continue;
		return `Hint: ${table}.${column} values are ${values.map(v => `'${v}'`).join(' or ')}; the filter ${literals.join(', ')} matches nothing.`;
	}
}
