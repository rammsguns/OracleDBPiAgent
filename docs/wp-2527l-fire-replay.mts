// Run from ../coord-score: npx tsx ../wp-2527l-pack-refusal-check/docs/wp-2527l-fire-replay.mts <gate dirs>
// Read-only replay of the coordinator's fire.mts. Case paths follow cwd.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { needsPackRefusalCorrection } from '../src/agent/packRefusal.js';
import { isRefusal } from '../src/agent/grounding.js';

type Case = { id: string; question?: string; turns?: string[] };
const cases: Case[] = [];
for (const suite of ['cases-hard', 'cases']) {
	const dir = resolve('evals', suite);
	for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
		cases.push(...JSON.parse(readFileSync(resolve(dir, file), 'utf8')));
	}
}
let total = 0, passingToolAnswers = 0, incorrectFires = 0, failingRefusals = 0, caughtRefusals = 0, excludedRefusals = 0;
const fired: Record<string, number> = {};
for (const dir of process.argv.slice(2)) for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
	for (const r of JSON.parse(readFileSync(resolve(dir, file), 'utf8')).records ?? []) {
		total++;
		const test = cases.find(c => c.id === r.id);
		const question = r.question ?? test?.question ?? test?.turns?.at(-1);
		if (question === undefined) throw Error(`Missing question for ${r.id}`);
		const answer = r.answer ?? '';
		const tools = r.toolDetails?.length ?? r.toolCalls?.length ?? 0;
		const successfulCalls = r.toolDetails
			? r.toolDetails.filter((t: { isError?: boolean }) => t.isError === false).length
			: tools;
		const fire = needsPackRefusalCorrection(question, answer, successfulCalls, isRefusal(answer));
		if (r.pass === true && tools > 0) {
			passingToolAnswers++;
			if (fire) incorrectFires++;
		}
		// Independent acceptance oracle for the reported failing refusal cases.
		const missingTop = !/\bpiagent\s+top\b|(?:^|[\s`(\[])\/top\b/i.test(answer);
		if (r.pass === false && /^hard-p27-refuse-/.test(r.id) && (missingTop || /awrrpt\.sql/i.test(answer))) {
			failingRefusals++;
			if (fire) caughtRefusals++;
			else if (successfulCalls > 0 && !isRefusal(answer)) {
				excludedRefusals++;
				console.error(`EXCLUDED by condition (2): ${r.id} in ${file}`);
			} else console.error(`MISSED ${r.id} in ${file}`);
		}
		if (fire) {
			const key = `${r.id} pass=${r.pass} tools=${tools}`;
			fired[key] = (fired[key] ?? 0) + 1;
		}
	}
}
console.log(JSON.stringify({ total, passingToolAnswers, incorrectFires, failingRefusals, caughtRefusals, excludedRefusals, fired }, null, 2));
if (incorrectFires || failingRefusals !== caughtRefusals) process.exitCode = 1;
