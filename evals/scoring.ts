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
			for (const row of truth) checks.push({ check: `fresh ground truth row: ${JSON.stringify(row)}`, pass: rowMatches(result.answer, row, truth.length === 1, truthLabels(test.groundTruth.sql)) });
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

/** Recover explicit aliases and simple column names without changing the truth contract.
 * Expressions without aliases have no stable label and retain value matching. */
function truthLabels(sql: string): string[] {
	const fields: string[] = [];
	let depth = 0, quoted = false, start = sql.search(/SELECT\s/i) + 7;
	for (let i = start; i < sql.length; i++) {
		if (sql[i] === "'") {
			if (quoted && sql[i + 1] === "'") { i++; continue; }
			quoted = !quoted;
		}
		if (quoted) continue;
		if (sql[i] === '(') depth++;
		if (sql[i] === ')') depth--;
		if (depth === 0 && (sql[i] === ',' || /^\sFROM\s/i.test(sql.slice(i)))) {
			fields.push(sql.slice(start, i).trim());
			start = i + 1;
			if (sql[i] !== ',') break;
		}
	}
	return fields.map(field => /\s+(?:AS\s+)?([A-Za-z_][\w$]*)$/i.exec(field)?.[1]
		?? /^(?:[A-Za-z_][\w$]*\.)*([A-Za-z_][\w$]*)$/.exec(field)?.[1] ?? '');
}

/** Opt-in row matching. Structured fields match whole values, never fragments of
 * another field (notably OP=INDEX versus OP=INDEX UNIQUE SCAN). */
function rowMatches(answer: string, row: unknown[], singleRow: boolean, labels: string[]): boolean {
	if (!row.length || row.some(value => value == null)) return false;
	const clean = (text: string) => text.replace(/[`*]/g, '').replace(/(?<=\d),(?=\d{3}\b)/g, '').replace(/[−–](?=\d)/g, '-').trim();
	const numeric = (text: string) => /^[-+]?\d+(?:\.\d+)?$/.test(text);
	const decimal = (text: string) => {
		const negative = text.startsWith('-');
		const [integer = '', fraction = ''] = text.replace(/^[-+]/, '').split('.');
		const magnitude = integer.replace(/^0+(?=\d)/, '') + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
		return (negative && magnitude !== '0' ? '-' : '') + magnitude;
	};
	const same = (actual: string, expected: unknown) => {
		const text = clean(actual).replace(/\s+\([^)]*\)\s*$/, ''), value = String(expected);
		if (numeric(value)) return numeric(text) && decimal(text) === decimal(value);
		return text.toLowerCase() === value.toLowerCase() || /^(?:VARCHAR2|NUMBER|CHAR|NVARCHAR2)$/i.test(value) && new RegExp(`^${value}\\(\\d+(?:,\\s*\\d+)?\\)$`, 'i').test(text);
	};
	const lines = answer.split(/\r?\n/).map(clean).flatMap(line => {
		// Repeated record keys and adjacent markdown rows delimit separate records,
		// even when a response puts them on one physical line.
		const firstKey = /(?:^[-•]?\s*|[|;])\s*([A-Za-z_]+)\s*=/.exec(line)?.[1];
		const records = firstKey ? line.split(new RegExp(`(?:[;,]\\s*|\\s+/\\s+|\\s*\\|\\s*)(?=${firstKey}\\s*=)`, 'i')) : [line];
		return records.flatMap(record => record.split(/(?<=\S)\s*\|\s*\|\s*(?=\S)/));
	});
	// Column-oriented markdown tables are also records: transpose each contiguous table.
	const inlineRecord = /\(([^()]*[A-Za-z_][\w$]*\s*=[^()]*)\)/g;
	const candidates = lines.map(line => singleRow ? line.replace(inlineRecord, '') : line);
	if (singleRow || row.length === 1) {
		for (const line of lines) {
			for (const match of line.matchAll(inlineRecord)) candidates.push(match[1]!);
		}
	}
	for (let start = 0; start < lines.length; start++) {
		if (!lines[start]!.startsWith('|')) continue;
		const block: string[][] = [];
		const indices: number[] = [];
		while (start < lines.length && lines[start]!.startsWith('|')) {
			const cells = lines[start++]!.split('|').slice(1, -1).map(clean);
			if (!cells.every(cell => /^:?-+:?$/.test(cell))) { block.push(cells); indices.push(start - 1); }
		}
		if (block[0]?.some(cell => labels.some(label => label && label.toLowerCase() === cell.toLowerCase()))) {
			for (let i = 1; i < block.length; i++) candidates[indices[i]!] = block[i]!.map((value, col) => `${block[0]![col]}=${value}`).join(' / ');
			continue;
		}
		// Presentation columns (#, sources) are not evidence values. A vertical
		// record can use Detail and Value together, but only inside this table
		// and only for a single truth record; never pool unrelated tables.
		const header = block[0] ?? [];
		const keyColumn = header.findIndex(cell => /^(?:item|step|attribute|field|property)$/i.test(cell));
		const valueColumns = header.flatMap((cell, index) => /^(?:value|detail)$/i.test(cell) ? [index] : []);
		if (singleRow && keyColumn >= 0 && valueColumns.length) {
			for (const index of indices) candidates[index] = '';
			candidates.push(block.slice(1).flatMap(cells => valueColumns.map(col =>
				`${cells[keyColumn]}=${(cells[col] ?? '').replace(/\s+\([^)]*\)\s*$/, '')}`)).join(' / '));
			continue;
		}
		if (!singleRow && !/^(?:attribute|field|property)?$/i.test(block[0]?.[0] ?? '')) continue;
		if (singleRow && !block.every(cells => cells.length === 2) && !/^(?:attribute|field|property)?$/i.test(block[0]?.[0] ?? '')) continue;
		for (let col = 1; col < (block[0]?.length ?? 0); col++) candidates.push(block.slice(1).map(cells => `${cells[0]}=${(cells[col] ?? '').replace(/\s+\([^)]*\)\s*$/, '')}`).join(' / '));
	}
	return candidates.some(line => {
		// Named values must agree with their own truth column, even when the
		// unordered multiset of values would otherwise match a swapped record.
		const bindings = [...line.matchAll(/(?:^|[|;,/(]\s*)([A-Za-z_][\w$]*)\s*=\s*([^|;,/)]*)/g)];
		if (labels.some((label, index) => label && bindings.some(binding => binding[1]!.toLowerCase() === label.toLowerCase() && !same(binding[2]!, row[index])))) return false;
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
			const pattern = new RegExp(`(?<![\\w.])${escaped}(?!\\w|\\.\\d)`, 'i');
			const match = numeric(String(value))
				? [...remaining.matchAll(/(?<![\w.])[-+]?\d+(?:\.\d+)?(?!\w|\.\d)/g)].find(candidate => same(candidate[0], value))
				: pattern.exec(remaining);
			if (!match) return false;
			remaining = remaining.slice(0, match.index) + ' '.repeat(match[0].length) + remaining.slice(match.index + match[0].length);
			return true;
		});
	});
}
