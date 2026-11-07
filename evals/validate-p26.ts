/** DB-only jobs truth smoke: npx tsx evals/validate-p26.ts --target d1-19c-lab */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { createSessionProvider } from '../src/oracle/index.js';
import type { OracleSession } from '../src/contracts.js';
import type { EvalCase } from './types.js';
import { checkP26Cases, loadHardCases } from './validate-hard.js';

export const JOBS_VIEWS = ['DBA_SCHEDULER_JOBS', 'DBA_SCHEDULER_JOB_RUN_DETAILS', 'DBA_OBJECTS', 'DBA_AUTOTASK_CLIENT'] as const;

function accessCode(error: unknown): string | undefined {
	if (error && typeof error === 'object' && 'code' in error && ['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(String(error.code))) return String(error.code);
	return undefined;
}

/** Missing views are evidence gaps, never zero invalid-object counts. Unexpected errors fail. */
export async function inspectP26(session: Pick<OracleSession, 'query' | 'identity'>, cases: EvalCase[]) {
	checkP26Cases(cases);
	const containerResult = await session.query("SELECT SYS_CONTEXT('USERENV','CON_ID'), SYS_CONTEXT('USERENV','CON_NAME') FROM dual", {}, { maxRows: 1 });
	const [rawId, rawName] = containerResult.rows[0] ?? [];
	const containerId = Number(rawId);
	if (rawId == null || String(rawId).trim() === '' || !Number.isSafeInteger(containerId) || containerId < 0 || typeof rawName !== 'string' || !rawName.trim()) throw new Error('Invalid session container metadata');
	const container = { id: containerId, name: rawName };
	// CON_ID 0 is a non-CDB, 1 is CDB$ROOT, and >1 identifies a PDB (including seed).
	if (container.id === 1 || container.name.toUpperCase() === 'CDB$ROOT') throw new Error('CDB$ROOT refused; connect through a PDB service');
	const isPdb = container.id > 1;
	const views = [];
	for (const view of JOBS_VIEWS) {
		try {
			await session.query(`SELECT 1 FROM ${view} WHERE ROWNUM = 0`, {}, { maxRows: 1 });
			views.push({ view, status: 'readable' });
		} catch (error) {
			const code = accessCode(error);
			if (!code) throw error;
			views.push({ view, status: 'not verifiable from this database', code });
		}
	}
	const records = [];
	for (const test of cases) {
		if (isPdb) {
			records.push({ id: test.id, status: 'not verifiable from this database', code: 'PDB_VISIBILITY_UNVERIFIED' });
			continue;
		}
		try {
			const result = await session.query(test.groundTruth!.sql, {}, { maxRows: 100 });
			if (result.truncated || result.rows.some(row => row.some(cell => cell == null))) throw new Error(`Invalid p26 truth: ${test.id}`);
			checkP26Cases(cases, { id: test.id, target: session.identity.target, rows: result.rows });
			records.push({ id: test.id, status: 'readable', rows: result.rows, ...(!result.rows.length ? { note: 'No rows visible; no absence outside this scope inferred.' } : {}) });
		} catch (error) {
			const code = accessCode(error);
			if (!code) throw error;
			records.push({ id: test.id, status: 'not verifiable from this database', code });
		}
	}
	return {
		scope: 'Current container visible scheduler and maintenance metadata',
		container,
		note: isPdb ? 'PDB visibility is unverified; empty rows do not establish CDB-wide absence.' : 'Retained visible history only; a scheduled next run is an estimate, not a guarantee.',
		views, records,
	};
}

export async function validateP26(target: string) {
	if (!['d1-19c-lab', 'p1-19c-prod'].includes(target)) throw new Error('Only the two lab targets are allowed');
	// Pin packaged lab config: this worker command never follows an owner private target file.
	const config = loadConfig({ ...process.env, PIAGENT_TARGETS_FILE: fileURLToPath(new URL('../config/targets.json', import.meta.url)) });
	const sessions = createSessionProvider(config);
	try {
		const session = await sessions.get(target);
		try {
			const cases = (await loadHardCases()).filter(test => test.id.startsWith('hard-p26-'));
			return { target, validatedAt: new Date().toISOString(), ...await inspectP26(session, cases) };
		} finally { await session.close(); }
	} finally { await sessions.closeAll(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.length !== 4 || process.argv[2] !== '--target') throw new Error('Usage: npx tsx evals/validate-p26.ts --target <lab-target>');
	const report = await validateP26(process.argv[3]!);
	await writeFile(new URL(`../docs/wp-26d-live-${report.target}.json`, import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report, null, '\t'));
}
