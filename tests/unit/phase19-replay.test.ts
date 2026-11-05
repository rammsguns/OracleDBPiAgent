import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivedCase, replayScoring } from '../helpers/replay-scoring-19d.js';
import { score } from '../../evals/scoring.js';

it('reconstructs archived interval truth and expectations without a database', () => {
	const record = { id: 'historic', target: 'lab', iteration: 1, pass: true, answer: '12', toolCalls: ['run_query'], usage: { input: 0, output: 0 }, checks: [
		{ check: 'tool: run_query', pass: true }, { check: 'fresh ground truth: 10..15', pass: true },
		{ check: 'no contradicting row count', pass: true }, { check: 'nonempty ground truth', pass: true }
	] };
	const c = archivedCase(record, new Map());
	expect(c.truth).toEqual([[10]]); expect(c.after).toEqual([[15]]);
	expect(score(c.test, record, c.truth, c.after).pass).toBe(true);
});
it('walks nested archive files, counts unanswered failures, and lists flips with reasons', () => {
	const root = mkdtempSync(join(tmpdir(), 'p19-replay-'));
	try {
		writeFileSync(join(root, 'records.json'), JSON.stringify({ records: [
			{ id: 'historical', target: 'lab', iteration: 1, pass: false, error: 'sanitized' },
			{ id: 'hard-p19-test', target: 'lab', iteration: 1, pass: false, answer: '- A: 0\n- B: 0', toolCalls: [], usage: { input: 0, output: 0 }, checks: [
				{ check: 'fresh ground truth row: [0,0]', pass: false }, { check: 'nonempty ground truth', pass: true }
			] }
		] }));
		const r = replayScoring([root], () => ({ pass: false, checks: [] }), new Map());
		expect(r).toMatchObject({ files: 1, records: 1, unanswered: 1, p19: 1, nonP19Flips: 0 });
		expect(r.flips[0]).toMatchObject({ id: 'hard-p19-test', before: false, after: true, reason: expect.any(String) });
	} finally { rmSync(root, { recursive: true, force: true }); }
});
