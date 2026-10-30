import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RecordRow {
	id: string; target: string; iteration: number; pass: boolean; error?: string; refusal?: boolean;
	usage: { input: number; output: number };
	toolDetails?: { isError: boolean | null }[];
}
export interface Report { endpoint?: "primary" | "secondary"; casesSha256?: string; records: RecordRow[] }
export function endpointWarnings(a: Report[], b: Report[]): string[] {
	// Count case observations, so repeats and partial suites retain their weight.
	const count = (reports: Report[], endpoint: string) => reports.filter(r => (r.endpoint ?? 'primary') === endpoint).reduce((n, r) => n + r.records.length, 0);
	return ['primary', 'secondary'].some(endpoint => count(a, endpoint) !== count(b, endpoint))
		? ['Unequal endpoint use between sides: server differences may confound the comparison.'] : [];
}
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
		warnings: [...endpointWarnings(a, b),...([...aa, ...bb].some(block => [...block.values()].some(r => r.error)) ? ['Execution failures present: zero recorded tokens are not a saving.'] : []),
			...(aa.length < 4 ? ['Fewer than four pairs: intervals are exploratory, not an acceptance gate.'] : []),
			...([...a, ...b].some(r => !r.casesSha256) ? ['Missing case hash: manually verify identical questions and scoring.'] : [])],
		cases, suite: { tokens: total('tokens'), passRate: total('passRate'), toolErrors: total('toolErrors') } };
}
export interface PerCaseOptions { seed?: number; samples?: number }
const variance = (xs: number[]) => xs.length < 2 ? 0 : xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1);
/** Equal-case geometric mean; independent arms, hierarchical percentile bootstrap. */
export function comparePerCase(a: Report[], b: Report[], { seed = 8129, samples = 10000 }: PerCaseOptions = {}) {
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(samples) || samples < 100) throw new Error('Invalid bootstrap seed or sample count');
	const hashes = new Set([...a, ...b].map(r => r.casesSha256).filter(Boolean));
	if (hashes.size > 1) throw new Error('Case definition hashes differ');
	const collect = (reports: Report[]) => {
		blocks(reports); // Reuse record and duplicate-within-iteration validation.
		const groups = new Map<string, { target: string; tokens: number[] }>();
		for (const r of reports.flatMap(report => report.records)) {
			const group = groups.get(r.id) ?? { target: r.target, tokens: [] };
			if (group.target !== r.target) throw new Error('Case id has multiple targets');
			group.tokens.push(r.usage.input + r.usage.output); groups.set(r.id, group);
		}
		return groups;
	};
	const aa = collect(a), bb = collect(b);
	const skipped = { missingFromA: [...bb.keys()].filter(id => !aa.has(id)).sort(), missingFromB: [...aa.keys()].filter(id => !bb.has(id)).sort() };
	const cases = [...aa.keys()].filter(id => bb.has(id)).sort().map(id => {
		const x = aa.get(id)!, y = bb.get(id)!;
		if (x.target !== y.target) throw new Error('Case targets differ');
		const aMean = mean(x.tokens), bMean = mean(y.tokens);
		if (aMean <= 0 || bMean <= 0) throw new Error('Per-case ratios require positive mean tokens; inspect execution failures');
		return { id, aRuns: x.tokens.length, bRuns: y.tokens.length, aTokens: aMean, bTokens: bMean,
			ratio: bMean / aMean, logRatio: Math.log(bMean / aMean),
			withinA: variance(x.tokens) / aMean ** 2, withinB: variance(y.tokens) / bMean ** 2 };
	});
	if (!cases.length) throw new Error('No common cases');
	let state = seed;
	const pick = <T,>(xs: T[]): T => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return xs[Math.floor(state / 4294967296 * xs.length)]!; };
	const drawMean = (xs: number[]) => mean(xs.map(() => pick(xs)));
	const pct = (log: number) => 100 * Math.expm1(log);
	const draws = Array.from({ length: samples }, () => pct(mean(cases.map(() => {
		const c = pick(cases);
		const x = drawMean(aa.get(c.id)!.tokens), y = drawMean(bb.get(c.id)!.tokens);
		if (x <= 0 || y <= 0) throw new Error('Bootstrap drew zero mean tokens; inspect execution failures');
		return Math.log(y / x);
	})))).sort((x, y) => x - y);
	const count = cases.length;
	const between = variance(cases.map(c => c.logRatio));
	const within = mean(cases.map(c => c.withinA + c.withinB));
	const pilotNoise = mean(cases.map(c => c.withinA / c.aRuns + c.withinB / c.bRuns));
	const trueBetween = Math.max(0, between - pilotNoise);
	// Method-of-moments removes pilot mean-estimation noise from between-case variance.
	// Delta method: Var(overall log ratio) ~= (trueBetween + mean(CV_A² + CV_B²)/n) / C.
	// Solve 1.96 * sqrt(V) <= log(1.03) for equal future runs per arm/case.
	// This is an approximation: truncation at zero and small-sample noise can bias
	// the estimated variance components; more pilot runs may revise the estimate.
	const budget = count * (Math.log(1.03) / 1.96) ** 2 - trueBetween;
	const insufficient = cases.some(c => c.aRuns < 2 || c.bRuns < 2);
	const runsPerSide = insufficient || budget <= 0 ? null : Math.max(2, Math.ceil(within / budget));
	return { mode: 'per-case', direction: 'B / A; percent change in geometric mean of case mean-token ratios', seed, samples,
		percentChange: pct(mean(cases.map(c => c.logRatio))), ci95: [draws[Math.floor(samples * .025)]!, draws[Math.ceil(samples * .975) - 1]!],
		skipped, planning: { targetHalfWidthPercent: 3, runsPerSide, betweenLogVariance: between, denoisedBetweenLogVariance: trueBetween, meanWithinRelativeVariance: within,
			reason: insufficient ? 'Within-case variance unknown with fewer than two runs on either side' : budget <= 0 ? 'No finite runs-only estimate under the de-noised between-case variance model' : 'Method-of-moments delta-method approximation; runs per arm per case' },
		warnings: [...endpointWarnings(a, b),...(insufficient ? ['Single-run cases have no estimable within-case variance; bootstrap conditions on those observations.'] : []),
			...([...a, ...b].some(r => r.records.some(row => row.error)) ? ['Execution failures present: zero recorded tokens are not a saving.'] : []),
			...([...a, ...b].some(r => !r.casesSha256) ? ['Missing case hash: manually verify identical questions and scoring.'] : []),
			'Case/run bootstrap assumes independent cases and independent within-case runs; shared run covariance is not preserved.'],
		cases: cases.map(c => ({ ...c, percentChange: pct(c.logRatio), contributionLog: c.logRatio / count }))
			.sort((x, y) => Math.abs(y.contributionLog) - Math.abs(x.contributionLog) || x.id.localeCompare(y.id)) };
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
		const args = process.argv.slice(2);
		const perCase = args.includes('--per-case');
		const seedIndex = args.indexOf('--seed');
		if (seedIndex >= 0 && (!perCase || !/^\d+$/.test(args[seedIndex + 1] ?? ''))) throw new Error('--seed requires --per-case and an unsigned integer');
		const seed = seedIndex >= 0 ? Number(args[seedIndex + 1]) : 8129;
		const files = parseFiles(args.filter((arg, i) => arg !== '--per-case' && i !== seedIndex && (seedIndex < 0 || i !== seedIndex + 1)));
		const read = (paths: string[]) => Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8')) as Report));
		console.log(JSON.stringify(perCase ? comparePerCase(await read(files.a), await read(files.b), { seed }) : compare(await read(files.a), await read(files.b)), null, '\t'));
	} catch (error) { console.error(error instanceof Error ? error.message : 'Comparison failed'); process.exitCode = 1; }
}
