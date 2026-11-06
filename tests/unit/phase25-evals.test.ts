import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { inspectP25, BACKUP_VIEWS } from '../../evals/validate-p25.js';
import { loadSelectedCases, parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
import type { OracleSession } from '../../src/contracts.js';
import type { EvalCase } from '../../evals/types.js';

const live = JSON.parse(readFileSync('docs/wp-25d-live-d1-19c-lab.json', 'utf8'));
const backupCases = async () => (await loadHardCases()).filter(test => test.category === 'backup');
function session(error?: string, isCdb = false) {
	const query = vi.fn(async (sql: string) => {
		if (error) throw { code: error };
		const cases = await backupCases();
		const test = cases.find(test => test.groundTruth!.sql === sql);
		return { columns: [], rows: test ? live.records.find((record: { id: string }) => record.id === test.id).rows : [], truncated: false, elapsedMs: 0 };
	});
	return { query, identity: { isCdb } } as unknown as Pick<OracleSession, 'query' | 'identity'>;
}

it('selects four backup cases without exposing the blind replacement in the p25 suite', async () => {
	const options = parseArgs(['--suite', 'p25']);
	expect(await loadSelectedCases(options)).toEqual(await backupCases());
	await expect(loadSelectedCases({ ...options, split: 'holdout' })).rejects.toThrow('No eval cases');
	const cases = await loadHardCases();
	expect(() => checkHardCases(cases.filter(test => test.id !== 'hard-p25-d1-last-level0'))).toThrow('four distinct');
	const hinted = structuredClone(cases);
	hinted.find(test => test.id === 'hard-p25-d1-last-level0')!.question = 'Use run_query';
	expect(() => checkHardCases(hinted)).toThrow('must not name');
});

it('scores live empty-history truth and rejects invented dates, zero gaps and retention overrides', async () => {
	for (const test of await backupCases()) {
		const rows = live.records.find((record: { id: string }) => record.id === test.id).rows;
		const answer = rows.map((row: unknown[]) => row.join(' | ')).join('\n') + '\nThis does not prove recoverability or establish external media availability.';
		const response = { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass, test.id).toBe(true);
		const wrong = { ...response, answer: 'The last level 0 was 2026-11-06 12:00:00; gap count 0; retention REDUNDANCY 1; backups are available.' };
		expect(score(test, wrong, rows).pass, test.id).toBe(false);
	}
});

it.each(['ORA-00942', 'ORA-01031', 'ORA-65040'])('degrades per view on %s without inventing empty-history counts', async code => {
	const report = await inspectP25(session(code), await backupCases());
	expect(report.views).toHaveLength(BACKUP_VIEWS.length);
	expect(report.records).toHaveLength(4);
	for (const record of report.records) {
		expect(record).toMatchObject({ status: 'not verifiable from this database', code });
		expect(record).not.toHaveProperty('rows');
	}
});

it('preserves readable evidence when another view is missing and propagates unexpected errors', async () => {
	const fake = session();
	const original = fake.query;
	fake.query = async (sql, binds, options) => {
		if (sql.includes('v$rman_configuration') || sql.includes('V$RMAN_CONFIGURATION')) throw { code: 'ORA-00942' };
		return original(sql, binds, options);
	};
	const report = await inspectP25(fake, await backupCases());
	expect(report.records.filter(record => record.status === 'readable')).toHaveLength(3);
	await expect(inspectP25(session('NJS-511'), await backupCases())).rejects.toMatchObject({ code: 'NJS-511' });
});

it('does not infer backup absence from empty PDB-visible rows', async () => {
	const fake = session(undefined, true);
	const report = await inspectP25(fake, await backupCases());
	expect(report.note).toContain('empty rows do not establish absence');
	expect(report.scope).toBe('CDB-wide (shared by all PDBs)');
	for (const record of report.records) {
		expect(record).not.toHaveProperty('rows');
		expect(record.status).toBe('not verifiable from this database');
	}
	expect(fake.query).toHaveBeenCalledTimes(BACKUP_VIEWS.length);
});
