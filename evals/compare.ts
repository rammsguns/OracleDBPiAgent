import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RecordRow {
	id: string; target: string; iteration: number; pass: boolean; error?: string; refusal?: boolean;
	usage: { input: number; output: number };
	toolDetails?: { isError: boolean | null }[];
}
export interface Report { casesSha256?: string; records: RecordRow[] }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Percentile bootstrap of paired differences; fixed PRNG makes reports reproducible. */
export function interval(xs: number[], samples = 10000): [number, number] | null {
	if (xs.length < 2) return null;
	let state = 8129;
	const draws = Array.from({ length: samples }, () => mean(xs.map(() => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return xs[Math.floor(state / 4294967296 * xs.length)]!;
	}))).sort((a, b) => a - b);
	return [draws[Math.floor(samples * .025)]!, draws[Math.ceil(samples * .975) - 1]!];
}
function blocks(reports: Report[]) {
	return reports.flatMap(report => {
		const groups = new Map<number, RecordRow[]>();
		for (const row of report.records) {
			if (!row.id || !row.target || !Number.isInteger(row.iteration) || typeof row.pass !== 'boolean'
				|| ![row.usage?.input, row.usage?.output].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Invalid result record');
			const rows = groups.get(row.iteration) ?? [];
			rows.push(row); groups.set(row.iteration, rows);
		}
		return [...groups.entries()].sort(([a], [b]) => a - b).map(([, rows]) => {
			const map = new Map(rows.map(row => [`${row.target}/${row.id}`, row]));
			if (map.size !== rows.length) throw new Error('Duplicate case in iteration');
			return map;
		});
	});
}
export function compare(a: Report[], b: Report[]) {
	const hashes = new Set([...a, ...b].map(r => r.casesSha256).filter(Boolean));
	if (hashes.size > 1) throw new Error('Case definition hashes differ');
	const aa = blocks(a), bb = blocks(b);
	if (!aa.length || aa.length !== bb.length) throw new Error('Need equal nonempty sets of paired run/iteration blocks');
	const keys = [...aa[0]!.keys()].sort();
	if ([...aa, ...bb].some(block => block.size !== keys.length || keys.some(key => !block.has(key)))) throw new Error('Case/target sets differ');
	const summarize = (xs: number[]) => ({ mean: mean(xs), ci95: interval(xs) });
	const cases = keys.map(key => {
		const pairs = aa.map((block, i) => [block.get(key)!, bb[i]!.get(key)!] as const);
		const tokens = (r: RecordRow) => r.usage.input + r.usage.output;
		const errors = (r: RecordRow) => r.toolDetails?.some(d => d.isError === null) || !r.toolDetails ? null : r.toolDetails.filter(d => d.isError).length;
		return { case: key, pairs: pairs.length, aTokens: mean(pairs.map(([r]) => tokens(r))), bTokens: mean(pairs.map(([, r]) => tokens(r))),
			aPassRate: mean(pairs.map(([r]) => Number(r.pass))), bPassRate: mean(pairs.map(([, r]) => Number(r.pass))),
			executionFailures: { a: pairs.filter(([r]) => r.error).length, b: pairs.filter(([, r]) => r.error).length },
			tokens: summarize(pairs.map(([x, y]) => tokens(y) - tokens(x))),
			passRate: summarize(pairs.map(([x, y]) => Number(y.pass) - Number(x.pass))),
			toolErrors: pairs.some(([x, y]) => errors(x) === null || errors(y) === null) ? null : summarize(pairs.map(([x, y]) => errors(y)! - errors(x)!)) };
	});
	// Resample whole paired runs for suite totals, preserving within-run case covariance.
	const total = (field: 'tokens' | 'passRate' | 'toolErrors') => {
		if (field === 'toolErrors' && cases.some(c => c.toolErrors === null)) return null;
		return summarize(aa.map((block, i) => keys.reduce((sum, key) => {
			const x = block.get(key)!, y = bb[i]!.get(key)!;
			if (field === 'tokens') return sum + y.usage.input + y.usage.output - x.usage.input - x.usage.output;
			if (field === 'passRate') return sum + (Number(y.pass) - Number(x.pass)) / keys.length;
			return sum + y.toolDetails!.filter(d => d.isError).length - x.toolDetails!.filter(d => d.isError).length;
		}, 0)));
	};
	return { direction: 'B minus A; tokens = uncached input + output', pairedBlocks: aa.length,
		warnings: [...([...aa, ...bb].some(block => [...block.values()].some(r => r.error)) ? ['Execution failures present: zero recorded tokens are not a saving.'] : []),
			...(aa.length < 4 ? ['Fewer than four pairs: intervals are exploratory, not an acceptance gate.'] : []),
			...([...a, ...b].some(r => !r.casesSha256) ? ['Missing case hash: manually verify identical questions and scoring.'] : [])],
		cases, suite: { tokens: total('tokens'), passRate: total('passRate'), toolErrors: total('toolErrors') } };
}
export function parseFiles(args: string[]) {
	const out: { a: string[]; b: string[] } = { a: [], b: [] };
	let side: 'a' | 'b' | undefined;
	for (const arg of args) {
		if (arg === '--a' || arg === '--b') side = arg.slice(2) as 'a' | 'b';
		else if (!side || arg.startsWith('--')) throw new Error('Usage: --a <files...> --b <files...>');
		else out[side].push(arg);
	}
	if (!out.a.length || !out.b.length || new Set([...out.a, ...out.b].map(f => resolve(f))).size !== out.a.length + out.b.length) throw new Error('Provide distinct files in both sets');
	return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		const files = parseFiles(process.argv.slice(2));
		const read = (paths: string[]) => Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8')) as Report));
		console.log(JSON.stringify(compare(await read(files.a), await read(files.b)), null, '\t'));
	} catch (error) { console.error(error instanceof Error ? error.message : 'Comparison failed'); process.exitCode = 1; }
}
