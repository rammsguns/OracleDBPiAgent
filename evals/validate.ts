import { readFile, writeFile } from 'node:fs/promises';
import { groundTruth, targets } from './ground-truth.js';
import type { EvalCase } from './types.js';
const cases: EvalCase[] = JSON.parse(await readFile('evals/cases/oracle19c.json', 'utf8'));
const configured = await targets();
const records = [];
for (const test of cases) {
	if (!test.groundTruth) continue;
	const target = configured.find(target => target.name === test.target);
	if (!target) throw new Error(`Unknown target ${test.target}`);
	const rows = await groundTruth(target, test.groundTruth.sql);
	if (!rows.length || rows[0]?.[0] == null) throw new Error(`Empty truth: ${test.id}`);
	records.push({ id: test.id, target: test.target, sql: test.groundTruth.sql, rows });
	console.log(`Validated ${test.id}`);
}
await writeFile('evals/ground-truth-validation.json', JSON.stringify({ validatedAt: new Date().toISOString(), records }, null, '\t') + '\n');
