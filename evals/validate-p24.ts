import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHardCases, validateHardCases } from './validate-hard.js';

export function checkP24Stability(first: { id: string; rows: unknown[][] }[], second: { id: string; rows: unknown[][] }[]): void {
	if (first.length !== 6 || second.length !== 6 || new Set(first.map(row => row.id)).size !== 6 || new Set(second.map(row => row.id)).size !== 6) throw new Error('Expected six p24 truth records in each sample');
	for (const record of first) {
		if (JSON.stringify(record.rows) !== JSON.stringify(second.find(other => other.id === record.id)?.rows)) throw new Error(`Unstable p24 truth: ${record.id}`);
	}
}

/** DB-only validation: retain the full suite invariants and compare fixed SQL twice. */
export async function validateP24() {
	const cases = await loadHardCases();
	const sample = async () => {
		const startedAt = new Date().toISOString();
		const report = await validateHardCases(cases);
		return { startedAt, completedAt: report.validatedAt, records: report.records.filter(record => record.id.startsWith('hard-p24-')) };
	};
	const first = await sample();
	// Wait from completion, ensuring every truth is re-read at least 60 s later.
	await new Promise(resolve => setTimeout(resolve, 60_000));
	const second = await sample();
	checkP24Stability(first.records, second.records);
	return { caseCount: 6, stable: true, minimumGapMs: 60_000, first, second };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateP24();
	await writeFile(new URL('../docs/wp-24d-p24-truth-stability.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log('Validated the full hard suite twice; all six p24 truths stable across a minimum 60 s gap. No LLM calls.');
}
