import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { score } from '../../evals/scoring.js';
import type { EvalCase, AskResult } from '../../evals/types.js';

type ArchivedRecord = AskResult & { id: string; target: string; iteration: number; pass: boolean; checks: { check: string; pass: boolean }[] };
/** Reconstruct original expectations/truth from stored checks, never from today's DB. */
export function archivedCase(record: ArchivedRecord, definitions: Map<string, EvalCase>) {
	const checks = record.checks.map(c => c.check);
	const rows = checks.filter(c => c.startsWith('fresh ground truth row: ')).map(c => JSON.parse(c.slice('fresh ground truth row: '.length)) as unknown[]);
	const values = checks.filter(c => c.startsWith('fresh ground truth: ')).map(c => c.slice('fresh ground truth: '.length));
	const definition = definitions.get(record.id);
	const scalar = checks.includes('no contradicting row count');
	const truth = rows.length ? rows : scalar ? [[Number(values[0]?.split('..')[0])]] : values.map(v => [v]);
	const after = scalar ? [[Number(values[0]?.split('..').at(-1))]] : truth;
	const test: EvalCase = { id: record.id, target: record.target, category: definition?.category ?? 'archive', question: 'archived',
		expect: { requiredFacts: checks.filter(c => c.startsWith('fact: ')).map(c => c.slice(6)),
			forbiddenClaims: checks.filter(c => c.startsWith('forbidden: ')).map(c => c.slice(11)),
			requiredTools: checks.filter(c => c.startsWith('tool: ')).map(c => c.slice(6)), mustRefuse: checks.includes('explicit refusal'),
			...(checks.some(c => c.startsWith('maxToolCalls: ')) ? { maxToolCalls: Number(checks.find(c => c.startsWith('maxToolCalls: '))!.slice(14)) } : {}) } };
	if (checks.includes('nonempty ground truth')) test.groundTruth = { sql: definition?.groundTruth?.sql ?? 'SELECT value FROM archived', mode: rows.length ? 'rowCells' : scalar ? 'scalar' : 'allCells' };
	// Archived p19 controls predate the identity column. Replay their original
	// two-column truth first; identity tightening is measured separately below.
	if (record.id === 'hard-p19-plan-controls' && rows[0]?.length === 2) test.groundTruth!.sql = 'SELECT attached_baseline_count, attached_profile_count FROM archived';
	return { test, truth, after };
}
export function replayScoring(roots: string[], before: typeof score, definitions: Map<string, EvalCase>) {
	let files = 0, records = 0, unanswered = 0, p19 = 0, changedChecks = 0, nonP19ChangedChecks = 0;
	const flips: { file: string; id: string; iteration: number; before: boolean; after: boolean; reason: string; checks: string[] }[] = [];
	const identity: { file: string; iteration: number; truth: unknown[][]; pass: boolean; reason: string }[] = [];
	for (const root of roots) {
		function walk(dir: string) {
			for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) { walk(path); continue; }
				if (!entry.name.endsWith('.json')) continue;
				const data = JSON.parse(readFileSync(path, 'utf8'));
				if (!Array.isArray(data?.records)) continue;
				files++;
				for (const record of data.records as ArchivedRecord[]) {
					if (typeof record.answer !== 'string' || !Array.isArray(record.checks)) { unanswered++; continue; }
					records++; if (record.id.startsWith('hard-p19-')) p19++;
					const { test, truth, after } = archivedCase(record, definitions);
					const old = before(test, record, truth, after), next = score(test, record, truth, after);
					const differences = next.checks.filter((c, i) => c.pass !== old.checks[i]?.pass).map(c => c.check);
					if (differences.length) { changedChecks++; if (!record.id.startsWith('hard-p19-')) nonP19ChangedChecks++; }
					if (old.pass !== next.pass) flips.push({ file: `${root}/${relative(root, path)}`, id: record.id, iteration: record.iteration, before: old.pass, after: next.pass,
						reason: !differences.some(c => /\d{4}-\d{2}-\d{2}T/.test(c)) ? 'P19 single-record labelled counts in separate bullets now pool' : 'P19 explicitly UTC-labelled equivalent timestamp spelling now matches', checks: differences });
					if (record.id === 'hard-p19-plan-controls' && truth[0]?.length === 2) {
						// Recover the real application's cursor from recorded evidence across
						// this run, independent of the agent's selected ID or answer.
						const ids = new Set<string>();
						for (const r of data.records) for (const text of r.toolResultTexts ?? []) for (const line of text.split('\n')) {
							const match = /^([0-9abcdfghjkmnpqrstuvwxyz]{13})\s*\|.*\|\s*SELECT PRICE FROM PRODUCTS WHERE PRODUCT_ID\s*=\s*:B1\s*$/i.exec(line);
							if (match) ids.add(match[1]);
						}
						if (ids.size !== 1) throw Error('Archived identity evidence is missing or ambiguous');
						const tightenedTruth = [[[...ids][0], ...truth[0]]];
						const tightened = score({ ...test, groundTruth: { sql: 'SELECT sql_id, attached_baseline_count, attached_profile_count FROM archived', mode: 'rowCells' } }, record, tightenedTruth);
						identity.push({ file: path, iteration: record.iteration, truth: tightenedTruth, pass: tightened.pass, reason: tightened.pass ? 'Correct runtime-discovered cursor and labelled zero counts' : 'Wrong selected cursor; zero counts cannot compensate for missing correct cursor identity' });
					}
				}
			}
		}
		walk(root);
	}
	return { roots, files, records, unanswered, p19, changedChecks, nonP19ChangedChecks, nonP19Flips: flips.filter(f => !f.id.startsWith('hard-p19-')).length, flips, identity };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [output, ...roots] = process.argv.slice(2);
	if (!output || !roots.length) throw Error('Usage: tsx tests/helpers/replay-scoring-19d.ts OUTPUT ROOT...');
	const source = execFileSync('git', ['show', '4ff40db:evals/scoring.ts'], { encoding: 'utf8' });
	const baseline = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
	const definitions = new Map<string, EvalCase>();
	for (const dir of ['evals/cases', 'evals/cases-hard']) for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
		for (const test of JSON.parse(readFileSync(join(dir, file), 'utf8')) as EvalCase[]) definitions.set(test.id, test);
	}
	const result = replayScoring(roots, baseline.score, definitions);
	writeFileSync(output, JSON.stringify(result, null, '\t') + '\n');
	console.log(JSON.stringify(result, null, '\t'));
	if (result.nonP19Flips || result.nonP19ChangedChecks) process.exitCode = 1;
}
