import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadHardCases, checkP26Cases } from '../../evals/validate-hard.js';
import { inspectP26, JOBS_VIEWS } from '../../evals/validate-p26.js';
import { loadSelectedCases, parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
import type { OracleSession } from '../../src/contracts.js';
const cases = async () => (await loadHardCases()).filter(test => test.id.startsWith('hard-p26-'));
const live = JSON.parse(readFileSync('docs/wp-26d-live-p1-19c-prod.json', 'utf8'));
it('selects four fair jobs cases and rejects hints, moving counters and unsafe SQL', async () => {
	const tests = await cases();
	expect(await loadSelectedCases(parseArgs(['--suite', 'p26']))).toEqual(tests);
	expect(() => checkP26Cases(tests.slice(1))).toThrow('four distinct');
	for (const mutation of ['hint', 'counter', 'write']) {
		const changed = structuredClone(tests);
		if (mutation === 'hint') changed[0]!.question = 'Use DBA_SCHEDULER_JOBS';
		else changed[0]!.groundTruth!.sql = mutation === 'counter' ? 'SELECT run_count FROM dba_scheduler_jobs' : 'DELETE FROM t';
		expect(() => checkP26Cases(changed)).toThrow();
	}
});
it('accepts live truth and rejects wrong job, error, count, status and guarantee claims', async () => {
	const explanations = ['Foreign key child record found.', '', 'This does not guarantee success.', 'A scheduler estimate does not guarantee actual execution or success.'];
	const wrong = ['OTHER_JOB ORA-00001', 'SHOPAPP 99', 'auto optimizer stats collection DISABLED', 'SHOPAPP NIGHTLY_PURGE_JOB FALSE NOT RECORDED'];
	for (const [i, test] of (await cases()).entries()) {
		const rows = live.records.find((row: { id: string }) => row.id === test.id).rows;
		const response = { answer: rows.map((row: unknown[]) => row.join(' | ')).join('\n') + '\n' + explanations[i], toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass, test.id).toBe(true);
		expect(score(test, { ...response, answer: wrong[i]! }, rows).pass, test.id).toBe(false);
		if (test.expect.requiredFacts.length) expect(score(test, { ...response, answer: rows[0].join(' | ') }, rows).pass).toBe(false);
	}
});
function fake(code?: string, containerId = 0) {
	return { identity: { target: 'd1-19c-lab' }, query: vi.fn(async (sql: string) => {
		if (sql.includes('SYS_CONTEXT')) return { rows: [[String(containerId), 'TEST']], truncated: false };
		if (code) throw { code };
		return { rows: [], truncated: false };
	}) } as unknown as Pick<OracleSession, 'query' | 'identity'>;
}
it.each(['ORA-00942', 'ORA-01031', 'ORA-65040'])('reports %s per source without inferring zero', async code => {
	const report = await inspectP26(fake(code), await cases());
	expect(report.views).toHaveLength(JOBS_VIEWS.length);
	for (const record of report.records) { expect(record.code).toBe(code); expect(record).not.toHaveProperty('rows'); }
});
it('propagates unexpected errors and withholds unverified PDB absence conclusions', async () => {
	await expect(inspectP26(fake('NJS-511'), await cases())).rejects.toMatchObject({ code: 'NJS-511' });
	const report = await inspectP26(fake(undefined, 3), await cases());
	expect(report.records.every(record => record.code === 'PDB_VISIBILITY_UNVERIFIED')).toBe(true);
});

it('refuses root before probing views or running truth SQL', async () => {
	const session = fake(undefined, 1);
	await expect(inspectP26(session, await cases())).rejects.toThrow('CDB$ROOT refused');
	expect(session.query).toHaveBeenCalledTimes(1);
	expect(session.query).toHaveBeenCalledWith(expect.stringContaining('SYS_CONTEXT'), {}, { maxRows: 1 });
});
it('fails loudly when the p1 error fixture changes, including absent history', async () => {
	const tests = await cases();
	const id = 'hard-p26-p1-last-failed-job';
	expect(() => checkP26Cases(tests, { id, target: 'p1-19c-prod', rows: [['NIGHTLY_PURGE_JOB'], ['ORA-02292']] })).not.toThrow();
	for (const rows of [[['NIGHTLY_PURGE_JOB'], ['ORA-01403']], [['NONE RECORDED'], ['NO ERROR RECORDED']], []]) {
		expect(() => checkP26Cases(tests, { id, target: 'p1-19c-prod', rows })).toThrow('expected ORA-02292');
	}
	// d1 is an empty-branch smoke, not the p1 fixture.
	expect(() => checkP26Cases(tests, { id, target: 'd1-19c-lab', rows: [['NONE RECORDED'], ['NO ERROR RECORDED']] })).not.toThrow();
	const session = fake();
	Object.assign(session.identity, { target: 'p1-19c-prod' });
	await expect(inspectP26(session, tests)).rejects.toThrow('expected ORA-02292');
});
