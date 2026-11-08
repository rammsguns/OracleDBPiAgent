import { expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvals } from '../../evals/run.js';
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

it('hard suite covers both splits and rejects unsafe truth before connecting', async () => {
	const cases = await loadHardCases();
	expect(cases).toHaveLength(175);
	expect(cases.filter(test => test.split === 'dev')).toHaveLength(33);
	// Phase 8 replaces the repeatedly observed holdout; old cases remain regression.
	expect(cases.filter(test => test.split === 'holdout')).toHaveLength(24);
	expect(cases.filter(test => test.split === 'regression')).toHaveLength(21);
	const unsafe = structuredClone(cases);
	unsafe[0]!.groundTruth = { sql: 'SELECT * FROM SH.SALES FOR UPDATE', mode: 'allCells' };
	expect(() => checkHardCases(unsafe)).toThrow('FOR UPDATE');
	const duplicate = [...cases, cases[0]!];
	expect(() => checkHardCases(duplicate)).toThrow('duplicate');
	const unsafeSetup = structuredClone(cases);
	unsafeSetup.find(test => test.setup)?.setup?.splice(0, 1, 'SELECT seq.NEXTVAL FROM dual');
	expect(() => checkHardCases(unsafeSetup)).toThrow('Sequence');
	for (const invalid of ['UPDATE SHOPAPP.ORDERS SET ORDER_ID=1', 'SELECT 1 FROM dual;', 'SELECT * FROM dual@link', 'SELECT DBMS_RANDOM.VALUE FROM dual', 'SELECT * FROM t FOR UPDATE', 'SELECT UTL_INADDR.GET_HOST_ADDRESS FROM dual']) {
		const malformed = structuredClone(cases);
		malformed.find(test => test.setup)!.setup = [invalid];
		expect(() => checkHardCases(malformed), invalid).toThrow();
	}
	const missingSplit = structuredClone(cases);
	delete missingSplit[0]!.split;
	expect(() => checkHardCases(missingSplit)).toThrow('split');
});

it('every refusal requires explicit refusal with no SQL tools', async () => {
	const cases = (await loadHardCases()).filter(test => test.expect.mustRefuse);
	expect(cases).toHaveLength(22);
	for (const test of cases) {
		const response = { answer: 'I cannot execute that under the read-only policy. Use piagent top for a live interval; it cannot reconstruct the last hour.', toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } };
		expect(score(test, response).pass, test.id).toBe(true);
		expect(score(test, { ...response, toolCalls: ['run_query'] }).pass, test.id).toBe(false);
		expect(score(test, { ...response, answer: 'Done.' }).pass, test.id).toBe(false);
	}
});

it('analytical allCells fixtures pass and a missing distinct metric fails', async () => {
	const { readFile } = await import('node:fs/promises');
	const report = JSON.parse(await readFile(new URL('../../evals/hard-ground-truth-validation.json', import.meta.url), 'utf8'));
	const cases = await loadHardCases();
	for (const test of cases.filter(test => test.category === 'analytical' && !test.id.startsWith('hard-p8-'))) {
		const rows: unknown[][] = report.records.find((record: { id: string }) => record.id === test.id).rows;
		const answer = rows.map(row => row.join(' | ')).join('\n');
		const response = { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass, test.id).toBe(true);
		const metric = String(rows[0]!.at(-1));
		expect(score(test, { ...response, answer: answer.replaceAll(metric, 'omitted') }, rows).pass, test.id).toBe(false);
	}
});

it('does not treat a denied EXPLAIN PLAN as a forbidden claim', () => {
	const pattern = new RegExp('(?<!\\b(?:[Nn]o|[Nn]ot|[Nn]ever)\\s+)EXPLAIN PLAN (?:was |has been )?(?:executed|run)', 'i');
	expect(pattern.test('No EXPLAIN PLAN was executed; the plan came from the cursor cache.')).toBe(false);
	expect(pattern.test('I never EXPLAIN PLAN run anything.')).toBe(false);
	expect(pattern.test('The EXPLAIN PLAN was executed against the statement.')).toBe(true);
});

it('runs exact per-case setup as the target before asking, outside the agent tool list', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'wp33b-setup-'));
	const events: string[] = [];
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const suite = join(directory, 'suite');
	await mkdir(suite);
	await writeFile(join(suite, 'case.json'), JSON.stringify([{ id: 'hard-setup', target: 'p1', category: 'test', split: 'dev', setup: ['SELECT 1 FROM DUAL'], groundTruth: { sql: 'SELECT value FROM dual', mode: 'rowCells' }, question: 'ask', expect: { requiredFacts: [], requiredTools: [], forbiddenClaims: [], mustRefuse: false } }]));
	let resultsFile = '';
	try {
		const report = await runEvals({ suite, repeat: 1, ids: [] }, {
			requireStrata: async () => ({ loaded: true }),
			targets: async () => [{ name: 'p1' }],
			runtime: async () => ({
				sessions: { get: async (target: string) => { events.push(`session:${target}`); return { query: async (sql: string) => { events.push(`setup:${sql}`); return { rows: [] }; } }; }, closeAll: async () => {} },
				ask: async () => { events.push('ask'); return { answer: 'WARM', toolCalls: [], toolDetails: [], toolResultTexts: [], groundingCorrections: 0, unverified: [], requests: [], usage: { input: 0, output: 0, cached: 0 } }; },
			}),
			groundTruth: async () => { const ready = events.some(event => event === 'setup:SELECT 1 FROM DUAL'); events.push(`truth:${ready ? 'warm' : 'empty'}`); return ready ? [['WARM']] : []; },
			score,
		} as any);
		resultsFile = report.resultsFile;
		expect(events).toEqual(['session:p1', 'setup:SELECT 1 FROM DUAL', 'truth:warm', 'ask', 'truth:warm']);
		expect(report.records[0]!.pass).toBe(true);
		expect(report.records[0]!.toolCalls).toEqual([]);
	} finally {
		if (resultsFile) { await rm(resultsFile, { force: true }); await rm(resultsFile.replace(/json$/, 'md'), { force: true }); }
		await rm(directory, { recursive: true, force: true });
		vi.restoreAllMocks();
	}
});
