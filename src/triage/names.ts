import type { TriageReader } from './read.js';

const ignored = new Set(`
	a an and are as at be been being but by can could database did do does error
	failed failing failure for from had has have how i if in into is it its job
	jobs keeps line name no not object of on or ora pls package procedure function
	trigger select insert update delete merge where join table the then this to
	was were what when which why with wrong sql begin end null values set check
	owner run running runs please help
`.toUpperCase().trim().split(/\s+/));
export interface NameCandidate { name: string; reportMissing: boolean }

/** Preserve original case only to distinguish prose from deliberate identifier spelling. */
export function nameCandidates(text: string): NameCandidate[] {
	const candidates = new Map<string, NameCandidate>();
	const withoutCodes = text.replace(/\b(?:ORA-\d{5}|PLS-\d{3,5})\b/gi, ' ');
	for (const match of withoutCodes.matchAll(/(?<![\w$#.])[A-Za-z][A-Za-z0-9_$#]{0,127}(?:\.[A-Za-z][A-Za-z0-9_$#]{0,127})?(?![\w$#.])/g)) {
		const token = match[0], name = token.toUpperCase();
		if (token.length < 3 || ignored.has(name)) continue;
		const reportMissing = /[_0-9]/.test(token) || token === name;
		const previous = candidates.get(name);
		if (previous) previous.reportMissing ||= reportMissing;
		else if (candidates.size < 20) candidates.set(name, { name, reportMissing });
	}
	return [...candidates.values()];
}

/** One bounded lookup, retried with ALL views only on dictionary privilege errors. */
export async function lookupNames(reader: TriageReader, candidates: NameCandidate[]) {
	if (!candidates.length) return undefined;
	const binds: Record<string, unknown> = {};
	const inputs = candidates.map((candidate, i) => {
		const parts = candidate.name.split('.');
		binds[`name${i}`] = parts.at(-1)!;
		binds[`owner${i}`] = parts.length === 2 ? parts[0]! : null;
		return `SELECT ${i} CANDIDATE, :owner${i} OWNER_FILTER, :name${i} NAME_FILTER FROM DUAL`;
	}).join('\nUNION ALL\n');
	return reader.query('Identifier candidate lookup', ['DBA', 'ALL'].map(prefix => {
		const sources = [
			{ suffix: 'SCHEDULER_JOBS', column: 'JOB_NAME', kind: 'JOB' },
			{ suffix: 'SCHEDULER_JOB_RUN_DETAILS', column: 'JOB_NAME', kind: 'JOB' },
			{ suffix: 'OBJECTS', column: 'OBJECT_NAME', kind: 'OBJECT' },
		];
		const branches = sources.map(({ suffix, column, kind }) => `SELECT DISTINCT c.CANDIDATE, '${kind}' KIND, d.OWNER, d.${column} NAME
FROM candidates c JOIN ${prefix}_${suffix} d ON d.${column} = c.NAME_FILTER
AND (c.OWNER_FILTER IS NULL OR d.OWNER = c.OWNER_FILTER)`);
		return {
			view: sources.map(s => `${prefix}_${s.suffix}`).join(', '),
			sql: `WITH candidates AS (${inputs})\n${branches.join('\nUNION\n')}\nORDER BY 1, 2, 3, 4`,
		};
	}), binds, 200);
}
