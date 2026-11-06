/** DB-only metadata smoke on the pinned labs; no agent or LLM invocation. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { loadHardCases } from './validate-hard.js';

export async function validateP27() {
	// Check the full suite, then execute only these metadata queries.
	const cases = await loadHardCases();
	const { loadConfig } = await import('../src/config/index.js');
	const { createSessionProvider } = await import('../src/oracle/index.js');
	const config = loadConfig({ ...process.env, PIAGENT_TARGETS_FILE: fileURLToPath(new URL('../config/targets.json', import.meta.url)) });
	const sessions = createSessionProvider(config);
	const records = [];
	try {
		for (const test of cases.filter(test => test.id.startsWith('hard-p27-') && test.groundTruth)) {
			const session = await sessions.get(test.target);
			try {
				const result = await session.query(test.groundTruth!.sql, {}, { maxRows: 10 });
				if (result.truncated || result.rows.length !== 7 || result.rows.some(row => typeof row[0] !== 'string' || !Number.isInteger(row[1]))) throw new Error(`Invalid statistic metadata: ${test.id}`);
				records.push({ id: test.id, target: test.target, rows: result.rows });
			} finally { await session.close(); }
		}
	} finally { await sessions.closeAll(); }
	return { scope: 'CDB-wide (shared by all PDBs)', records };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateP27();
	await writeFile(new URL('../docs/wp-27d-live.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report));
}
