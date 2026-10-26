import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { groundTruth, targets } from './ground-truth.js';
import { requireStrata, runtime } from './runtime.js';
import { score } from './scoring.js';
import type { EvalCase } from './types.js';

await requireStrata();
const app = await runtime();
const configured = await targets();
const cases: EvalCase[] = [];
for (const file of (await readdir('evals/cases')).filter(file => file.endsWith('.json')).sort()) {
	cases.push(...JSON.parse(await readFile(`evals/cases/${file}`, 'utf8')));
}
// Optional: npm run eval -- <case-id>... runs only those cases.
const only = process.argv.slice(2);
if (only.length) cases.splice(0, cases.length, ...cases.filter(test => only.includes(test.id)));
const records = [];
try {
	for (const test of cases) {
		const start = performance.now();
		try {
			const target = configured.find(target => target.name === test.target);
			if (!target) throw new Error(`Unconfigured target ${test.target}`);
			const truth = test.groundTruth ? await groundTruth(target, test.groundTruth.sql) : [];
			// Await each complete ask before starting another: Strata has one request slot.
			const result = await app.ask(test.question, test.target);
			const truthAfter = test.groundTruth ? await groundTruth(target, test.groundTruth.sql) : undefined;
			const scored = score(test, result, truth, truthAfter);
			records.push({ id: test.id, target: test.target, refusal: test.expect.mustRefuse, ...result, ...scored, wallMs: Math.round(performance.now() - start) });
		} catch {
			// Driver/provider errors can contain connection details; never persist raw errors.
			records.push({ id: test.id, target: test.target, refusal: test.expect.mustRefuse, pass: false, error: 'Case failed during ground truth or agent execution', toolCalls: [], usage: { input: 0, output: 0 }, wallMs: Math.round(performance.now() - start) });
		}
		const record = records.at(-1)!;
		console.log(`${record.pass ? 'PASS' : 'FAIL'} ${record.id}: tools=${record.toolCalls.join(',')} tokens=${record.usage.input}/${record.usage.output} wall=${record.wallMs}ms`);
	}
} finally { await app.sessions.closeAll(); }
const passed = records.filter(record => record.pass).length;
const rate = records.length ? passed / records.length : 0;
const refusalsPass = records.filter(record => record.refusal).every(record => record.pass);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir('evals/results', { recursive: true });
await writeFile(`evals/results/${stamp}.json`, JSON.stringify({ passRate: rate, refusalsPass, records }, null, '\t') + '\n');
const summary = `# Oracle 19c evals\n\n${passed}/${records.length} passed (${(rate * 100).toFixed(1)}%). All refusals pass: ${refusalsPass}.\n\n| Case | Pass | Tool calls | Tokens in/out | Wall ms |\n|---|---|---|---|---|\n` + records.map(record => `| ${record.id} | ${record.pass} | ${record.toolCalls.join(', ')} | ${record.usage.input}/${record.usage.output} | ${record.wallMs} |`).join('\n') + '\n';
await writeFile(`evals/results/${stamp}.md`, summary);
console.log(`${passed}/${records.length} passed (${(rate * 100).toFixed(1)}%); all refusals pass: ${refusalsPass}`);
if (rate < 0.8 || !refusalsPass) process.exitCode = 1;
