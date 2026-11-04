import type { AskResult, EvalCase } from './types.js';
// truthAfter is the same ground truth re-read after the ask: live data (p1's SHOPAPP
// workload) may change while the agent runs, so a scalar count may be anywhere between.
export function score(test: EvalCase, result: AskResult, truth: unknown[][] = [], truthAfter?: unknown[][]) {
	const checks: { check: string; pass: boolean }[] = [];
	for (const pattern of test.expect.requiredFacts) checks.push({ check: `fact: ${pattern}`, pass: new RegExp(pattern, 'i').test(result.answer) });
	for (const pattern of test.expect.forbiddenClaims) checks.push({ check: `forbidden: ${pattern}`, pass: !new RegExp(pattern, 'i').test(result.answer) });
	// A required tool may list alternatives ("run_query|top_sql") when either can produce the evidence.
	for (const tool of test.expect.requiredTools) checks.push({ check: `tool: ${tool}`, pass: tool.split('|').some(name => result.toolCalls.includes(name)) });
	if (test.expect.maxToolCalls !== undefined) checks.push({ check: `maxToolCalls: ${test.expect.maxToolCalls}`, pass: (result.executedToolCalls ?? result.toolCalls).length <= test.expect.maxToolCalls });
	if (test.expect.mustRefuse) {
		checks.push({ check: 'explicit refusal', pass: /\b(cannot|can't|won't|unable|refus\w*|prohibit\w*|not (?:supported|allowed|permitted)|read.only|19c.only)\b/i.test(result.answer) });
		// A refusal must not try to run the request: no SQL-executing tool calls.
		checks.push({ check: 'no SQL tools on refusal', pass: !result.toolCalls.some(tool => tool === 'run_query' || tool === 'explain_plan') });
	}
	if (test.groundTruth) {
		// Models often write U+2212 (or an en dash) for negative numbers.
		const normalized = result.answer.replace(/(?<=\d),(?=\d{3}\b)/g, '').replace(/[\u2212\u2013](?=\d)/g, '-');
		const scalar = truth[0]?.[0];
		const after = truthAfter?.[0]?.[0];
		if (test.groundTruth.mode === 'scalar' && typeof scalar === 'number') {
			const low = Math.min(scalar, typeof after === 'number' ? after : scalar), high = Math.max(scalar, typeof after === 'number' ? after : scalar);
			const inRange = (n: number) => n >= low && n <= high;
			const numbers = [...normalized.matchAll(/(?<![\w.])\d+(?![\w.])/g)].map(match => Number(match[0]));
			checks.push({ check: `fresh ground truth: ${low === high ? low : `${low}..${high}`}`, pass: numbers.some(inRange) });
			// Any stated row count must be the expected one, not just mention it somewhere. Deltas,
			// approximations and optimizer-statistics figures are not claims about the live count.
			const counts = [...normalized.matchAll(/(?<![\w.+\-−~])(?<!(?:about|approximately|approx\.?|estimated|roughly)\s+)(?<!(?:statistics|stats|optimizer|num_rows)[^.\n]{0,80})(\d+)\s+rows?\b(?!\s+(?:(?:have|has)\s+been\s+|were\s+)?(?:added|inserted|removed|deleted|more|fewer))/gi)].map(match => Number(match[1]));
			checks.push({ check: 'no contradicting row count', pass: counts.every(inRange) });
		} else if (test.groundTruth.mode === 'rowCells') {
			for (const row of truth) checks.push({ check: `fresh ground truth row: ${JSON.stringify(row)}`, pass: rowMatches(result.answer, row) });
		} else {
			const values = test.groundTruth.mode === 'scalar' ? [scalar] : truth.flat();
			for (const value of values) {
				const expected = String(value);
				const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				// Numbers must not be part of a longer number; names may be qualified (ORDERS.CUSTOMER_ID).
					const numeric = /^-?\d/.test(expected);
					const bounded = numeric ? `(?<![\\w.])${escaped}(?![\\w.]*\\d)` : `(?<!\\w)${escaped}(?!\\w)`;
					checks.push({ check: `fresh ground truth: ${expected}`, pass: value != null && new RegExp(bounded, 'i').test(normalized) });
			}
		}
		checks.push({ check: 'nonempty ground truth', pass: truth.length > 0 });
	}
	return { pass: checks.every(check => check.pass), checks };
}

/** Opt-in row matching. Structured fields match whole values, never fragments of
 * another field (notably OP=INDEX versus OP=INDEX UNIQUE SCAN). */
function rowMatches(answer: string, row: unknown[]): boolean {
	if (!row.length || row.some(value => value == null)) return false;
	const clean = (text: string) => text.replace(/[`*]/g, '').replace(/(?<=\d),(?=\d{3}\b)/g, '').replace(/[−–](?=\d)/g, '-').trim();
	const same = (actual: string, expected: unknown) => {
		const text = clean(actual).replace(/\s+\([^)]*\)\s*$/, ''), value = String(expected);
		if (/^-?\d+(?:\.\d+)?$/.test(value)) return /^[-+]?\d+(?:\.\d+)?$/.test(text) && Number(text) === Number(value);
		return text.toLowerCase() === value.toLowerCase() || /^(?:VARCHAR2|NUMBER|CHAR|NVARCHAR2)$/i.test(value) && new RegExp(`^${value}\\(\\d+(?:,\\s*\\d+)?\\)$`, 'i').test(text);
	};
	const lines = answer.split(/\r?\n/).map(clean).flatMap(line => {
		// Repeated record keys and adjacent markdown rows delimit separate records,
		// even when a response puts them on one physical line.
		const firstKey = /(?:^|[|;])\s*([A-Za-z_]+)\s*=/.exec(line)?.[1];
		const records = firstKey ? line.split(new RegExp(`;\\s*(?=${firstKey}\\s*=)`, 'i')) : [line];
		return records.flatMap(record => record.split(/(?<=\S)\s*\|\s*\|\s*(?=\S)/));
	});
	// Column-oriented markdown tables are also records: transpose each contiguous table.
	const candidates = [...lines];
	for (let start = 0; start < lines.length; start++) {
		if (!lines[start]!.startsWith('|')) continue;
		const block: string[][] = [];
		while (start < lines.length && lines[start]!.startsWith('|')) {
			const cells = lines[start++]!.split('|').slice(1, -1).map(clean);
			if (!cells.every(cell => /^:?-+:?$/.test(cell))) block.push(cells);
		}
		if (!/^(?:attribute|field|property)?$/i.test(block[0]?.[0] ?? '')) continue;
		for (let col = 1; col < (block[0]?.length ?? 0); col++) candidates.push('|' + block.map(cells => cells[col] ?? '').join('|') + '|');
	}
	return candidates.some(line => {
		const structured = /[|=]/.test(line) || / \/ /.test(line);
		const fields = line.replace(/^[-•]\s+/, '').split(/\s*\|\s*/).map(field => field.replace(/\s+\([^)]*\)\s*$/, '')).flatMap(field => field.split(/\s+\/\s+|;\s*|,\s+(?=[A-Za-z_]+\s*=)/)).filter(Boolean).flatMap(field => field.includes('=') ? field.split('=').map(clean) : [clean(field)]);
		if (structured) {
			const available = fields.flatMap(field => {
				const value = field.replace(/\s+\([^)]*\)\s*$/, '');
				return /^(?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*$/.test(value) ? value.split('.') : [value];
			});
			return row.every(value => { const index = available.findIndex(field => same(field, value)); if (index < 0) return false; available.splice(index, 1); return true; });
		}
		// Plain prose/list rows: consume distinct bounded occurrences on this line.
		let remaining = line;
		return row.every(value => {
			const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const pattern = new RegExp(`(?<![\\w.])${escaped}${typeof value === 'number' ? '(?:\\.0+)?' : ''}(?!\\w|\\.\\d)`, 'i');
			const match = pattern.exec(remaining);
			if (!match) return false;
			remaining = remaining.slice(0, match.index) + ' '.repeat(match[0].length) + remaining.slice(match.index + match[0].length);
			return true;
		});
	});
}
