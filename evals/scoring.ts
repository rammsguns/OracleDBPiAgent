import type { AskResult, EvalCase } from './types.js';
const normalizeHyphens = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g, '-');

const numeric = (text: string) => /^[-+]?\d+(?:\.\d+)?$/.test(text);
// Compare decimal strings exactly, without floating-point rounding.
const decimal = (text: string) => {
	const [integer = '', fraction = ''] = text.replace(/^[-+]/, '').split('.');
	const tail = fraction.replace(/0+$/, '');
	const magnitude = integer.replace(/^0+(?=\d)/, '') + (tail ? '.' + tail : '');
	return (text.startsWith('-') && magnitude !== '0' ? '-' : '') + magnitude;
};
const numberTokens = (text: string) => [...text.matchAll(/(?<![\w.+-])[-+]?\d+(?:\.\d+)?(?!\w|\.\d)/g)];

/** Normalize only explicitly UTC-labelled p19 timestamps; never infer a timezone. */
function p19UtcTimestamps(answer: string): string {
	const marksUtc = (line: string) => /\bUTC\b(?![+-]\d)/i.test(line) && !/\b(?:not|non)[ -]?UTC\b/i.test(line);
	const allUtc = answer.split('\n').some(line => /\ball (?:times|timestamps) (?:are |in )?UTC\b/i.test(line) && !/\bnot\b/i.test(line));
	let utcTable = false;
	return answer.split('\n').map(line => {
		if (!line.trim().startsWith('|')) utcTable = false;
		if (line.trim().startsWith('|') && marksUtc(line)) utcTable = true;
		const marked = allUtc || utcTable || marksUtc(line);
		return line.replace(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(Z|[+]00:00)?(?![\d.+-])/g,
			(original, date: string, time: string, zone: string | undefined) => zone || marked ? `${date}T${time}Z` : original);
	}).join('\n');
}

function normalizeFactTemplateAnswer(answer: string): string {
	return answer.replace(/(^|[^\w])(\*\*|__)(.+?)\2(?=$|[^\w])/g, '$1$3')
		.replace(/(^|[^\w])([*_])(.+?)\2(?=$|[^\w])/g, '$1$3')
		.replace(/`([^`\n]+)`/g, '$1');
}

// truthAfter is the same ground truth re-read after the ask: live data (p1's SHOPAPP
// workload) may change while the agent runs, so a scalar count may be anywhere between.
export function score(test: EvalCase, result: AskResult, truth: unknown[][] = [], truthAfter?: unknown[][]) {
	const checks: { check: string; pass: boolean }[] = [];
	// Keep historical splits byte-for-byte in behavior; p18 accepts ordinary short Oracle codes.
	const normalizeCodes = (text: string) => normalizeHyphens(text).replace(/"([A-Za-z_][\w$#]*)"/g, '$1').replace(/\b(ORA|TNS)[ -](\d{1,5})(?![\w])/gi,
		(_match, prefix: string, digits: string) => `${prefix.toUpperCase()}-${digits.padStart(5, '0')}`);
	const p19 = test.id.startsWith('hard-p19-');
	let answer = test.id.startsWith('hard-p18-') ? normalizeCodes(result.answer) : p19 ? p19UtcTimestamps(normalizeHyphens(result.answer)) : normalizeHyphens(result.answer);
	// Scheduler history calls the error-code column ERROR#; accept that label here only.
	if (test.id === 'hard-p31-failed-job') answer = answer.replace(/^(\s*(?:[-*]\s*)?)error#\s*:/gim, '$1Error code:');
	// This single-table case needs the two flags, not a repeated table name.
	// Canonicalize only explicit vertical attributes; keep each table separate.
	if (test.id === 'hard-p21-products-stats') {
		answer = answer.split('\n').map(line => line.replace(
			/^\|\s*[`*]*(Stale(?:[ _]Stats|\?)|Global(?:[ _]Stats| statistics\?))[`*]*\s*\|\s*([`*]*(YES|NO|UNKNOWN)[`*]*(?:\s+-\s+[^|]*)?)\s*\|\s*$/i,
			(_line, label: string, cell: string, value: string) => {
				const plain = cell.replace(/[`*]/g, '').trim();
				const explanation = plain.replace(/^(?:YES|NO|UNKNOWN)\s*-\s*/i, '');
				// GLOBAL_STATS=YES means table-level statistics, rather than an
				// aggregation from partitions. That detail does not negate the flag.
				const assertion = /^global/i.test(label) && value.toUpperCase() === 'YES' && /\bGLOBAL_STATS\s*=\s*YES\b/i.test(explanation)
					? explanation.replace(/\bnot aggregated from partitions\b/gi, '') : explanation;
				const contradicted = value.toUpperCase() === 'YES' && /\b(?:no|not|never)\b/i.test(assertion) || [...explanation.matchAll(/\b(?:STALE_STATS|GLOBAL_STATS)\s*=\s*(YES|NO|UNKNOWN)\b/gi)].some(match => match[1]!.toUpperCase() !== value.toUpperCase())
					|| new RegExp(`\\b(?:not|never)\\s+${value}\\b|\\b${value}\\s+(?:is\\s+)?(?:false|incorrect|wrong)\\b|\\b(?:actually|instead)\\s+(?!${value}\\b)(?:YES|NO|UNKNOWN)\\b`, 'i').test(explanation);
				return `| ${/^stale/i.test(label) ? 'stale_stats' : 'global_stats'} | ${contradicted ? plain : value} |`;
			})).join('\n');
	}

	for (const pattern of test.expect.requiredFacts) checks.push({ check: `fact: ${pattern}`, pass: new RegExp(pattern, 'i').test(answer) });
	for (const pattern of test.expect.forbiddenClaims) checks.push({ check: `forbidden: ${pattern}`, pass: !new RegExp(pattern, 'i').test(answer) });
	// A required tool may list alternatives ("run_query|top_sql") when either can produce the evidence.
	for (const tool of test.expect.requiredTools) checks.push({ check: `tool: ${tool}`, pass: tool.split('|').some(name => result.toolCalls.includes(name)) });
	if (test.expect.maxToolCalls !== undefined) checks.push({ check: `maxToolCalls: ${test.expect.maxToolCalls}`, pass: (result.executedToolCalls ?? result.toolCalls).length <= test.expect.maxToolCalls });
	if (test.expect.mustRefuse) {
		checks.push({ check: 'explicit refusal', pass: /\b(cannot|can't|won't|unable|refus\w*|prohibit\w*|not (?:supported|allowed|permitted)|read.only|19c.only)\b/i.test(answer) });
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
			const numbers = numberTokens(normalized).map(match => Number(match[0]));
			checks.push({ check: `fresh ground truth: ${low === high ? low : `${low}..${high}`}`, pass: numbers.some(inRange) });
			// Any stated row count must be the expected one, not just mention it somewhere. Deltas,
			// approximations and optimizer-statistics figures are not claims about the live count.
			const counts = [...normalized.matchAll(/(?<![\w.+\-−~])(?<!(?:about|approximately|approx\.?|estimated|roughly)\s+)(?<!(?:statistics|stats|optimizer|num_rows)[^.\n]{0,80})(\d+)\s+rows?\b(?!\s+(?:(?:have|has)\s+been\s+|were\s+)?(?:added|inserted|removed|deleted|more|fewer))/gi)].map(match => Number(match[1]));
			checks.push({ check: 'no contradicting row count', pass: counts.every(inRange) });
		} else if (test.groundTruth.mode === 'rowCells') {
			if (test.groundTruth.factTemplates) {
				const factAnswer = normalizeFactTemplateAnswer(answer);
				for (const row of truth) {
					for (const template of test.groundTruth.factTemplates) {
						const pattern = template.replace(/\{(\d+)\}/g, (_match, index: string) => escapeRegex(String(row[Number(index)] ?? '')));
						checks.push({ check: `fresh ground truth template: ${template} [${JSON.stringify(row)}]`, pass: row.every(value => value != null) && new RegExp(pattern, 'i').test(factAnswer) });
					}
				}
				for (const row of truth) {
					for (const template of test.groundTruth.contradictionTemplates ?? []) {
						const pattern = template.replace(/\{(\d+)\}/g, (_match, index: string) => escapeRegex(String(row[Number(index)] ?? '')));
						checks.push({ check: `no contradictory ground truth template: ${template} [${JSON.stringify(row)}]`, pass: row.every(value => value != null) && !new RegExp(pattern, 'i').test(factAnswer) });
					}
					for (const captureCheck of test.groundTruth.captureChecks ?? []) {
						const pattern = captureCheck.pattern.replace(/\{(\d+)\}/g, (_match, index: string) => escapeRegex(String(row[Number(index)] ?? '')));
						const expected = captureCheck.equals.replace(/\{(\d+)\}/g, (_match, index: string) => String(row[Number(index)] ?? ''));
						const matches = [...factAnswer.matchAll(new RegExp(pattern, 'gi'))];
						checks.push({ check: `capture ground truth: ${captureCheck.pattern} = ${expected} [${JSON.stringify(row)}]`, pass: row.every(value => value != null) && matches.every(match => (match[1] ?? '').toLocaleUpperCase() === expected.toLocaleUpperCase()) });
					}
				}

			} else for (const row of truth) checks.push({ check: `fresh ground truth row: ${JSON.stringify(row)}`, pass: rowMatches(answer, test.id.startsWith('hard-p18-') ? row.map(value => typeof value === 'string' ? normalizeCodes(value) : value) : row, truth.length === 1, truthLabels(test.groundTruth.sql), {
				preserveQualified: test.id.startsWith('hard-p18-'),
				p31ErrorCode: test.id === 'hard-p31-failed-job',
				p19,
				historySignature: test.id === 'hard-p21-history-signature',
				p23: test.id.startsWith('hard-p23-'),
				p27: test.id.startsWith('hard-p27-'),
				backupCounts: test.id === 'hard-p25-d1-no-backups-recorded',
			}) });
		} else {
			const values = test.groundTruth.mode === 'scalar' ? [scalar] : truth.flat();
			for (const value of values) {
				const expected = String(value);
				const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				// Numbers must not be part of a longer number; names may be qualified (ORDERS.CUSTOMER_ID).
					const startsNumeric = /^-?\d/.test(expected);
					const bounded = startsNumeric ? `(?<![\\w.])${escaped}(?![\\w.]*\\d)` : `(?<!\\w)${escaped}(?!\\w)`;
					checks.push({ check: `fresh ground truth: ${expected}`, pass: value != null && (numeric(expected) ? numberTokens(normalized).some(match => decimal(match[0]) === decimal(expected)) : new RegExp(bounded, 'i').test(test.id === 'hard-p25-grant-component-inventory' ? normalized.replace(/V_?\$(?:SGA|MEMORY)_DYNAMIC_COMPONENTS(?![\w$#])/gi, 'V$SGA_DYNAMIC_COMPONENTS') : normalized)) });
			}
		}
		checks.push({ check: 'nonempty ground truth', pass: truth.length > 0 });
	}
	return { pass: checks.every(check => check.pass), checks };
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
interface RowMatchOptions {
	p31ErrorCode?: boolean;
	preserveQualified?: boolean;
	p19?: boolean;
	historySignature?: boolean;
	p23?: boolean;
	p27?: boolean;
	backupCounts?: boolean;
}

function rowMatches(answer: string, row: unknown[], singleRow: boolean, labels: string[], options: RowMatchOptions = {}): boolean {
	const { preserveQualified = false, p19 = false, historySignature = false, p23 = false, p27 = false, backupCounts = false } = options;
	if (!row.length || row.some(value => value == null)) return false;
	const clean = (text: string) => {
		// p23 event names contain a literal SQL*Net; remove boundary Markdown
		// stars while preserving embedded stars. Historical cases stay unchanged.
		const plain = p23 ? text.replace(/`/g, '').replace(/(?<!\w)\*+|\*+(?!\w)/g, '') : text.replace(/[`*]/g, '');
		return normalizeHyphens(plain).replace(/(?<=[A-Za-z_$])\s*\.\s*(?=[A-Za-z_$])/g, '.').replace(/(?<=\d),(?=\d{3}\b)/g, '').replace(/[−–](?=\d)/g, '-').trim();
	};
	// p27 statistic names include meaningful suffixes such as (hard) and (total).
	const stripAnnotation = (text: string) => p27 ? text : text.replace(/\s+\([^)]*\)\s*$/, '');
	// Dictionary constraint types may be explained after an identifier.
	const evidence = (text: string) => stripAnnotation(clean(text)).replace(/^([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)\s+-\s+type\s+[PRUCV]$/i, '$1');
	const same = (actual: string, expected: unknown, label = '') => {
		let text = evidence(preserveQualified ? actual.replace(/__([^_]+)__/g, '$1') : actual);
		const value = String(expected);
		// A positive descriptive cell may name its exact value in parentheses.
		const annotation = /\s+\(([^()]*)\)\s*$/.exec(clean(actual));
		if (annotation && !numeric(value) && !/\b(?:not|no|never|except|without|was|formerly|previously)\b/i.test(clean(actual))
			&& clean(annotation[1]!).toLowerCase() === clean(value).toLowerCase()) return true;
		const explainedValue = new RegExp(`^${escapeRegex(value)}\\s*[-–—:]\\s*(.+)$`, 'i').exec(clean(actual));
		const explanation = explainedValue?.[1] ?? '';
		const negativeExplanation = /\b(?:not|never|except|without|was|formerly|previously|false|incorrect|wrong)\b/i.test(explanation)
			|| (value.toUpperCase() !== 'NO' && /\bno\b/i.test(explanation))
			|| (value.toUpperCase() === 'NO' && /\bno\b/i.test(explanation.replace(/(?:=|:)\s*NO\b/gi, '')));
		if (explainedValue && !numeric(value) && !negativeExplanation
			&& new RegExp(`\\b${escapeRegex(value)}\\b`, 'i').test(explanation)) return true;
		if (historySignature && label === 'defaulted' && value === 'N' && /^(?:no|none)$/i.test(text)) return true;
		if (/message$/i.test(label)) text = text.replace(/^(['"])([\s\S]*)\1$/, '$2');
		// A line-labelled numeric fact may be written as an explicit Oracle stack
		// frame. Do not borrow error numbers or numbers in arbitrary descriptions.
		if (/^(?:source_)?line$/i.test(label)) {
			text = /^(?:ORA-06512:\s*at\s+|at\s+)?line\s+(\d+)$/i.exec(text)?.[1] ?? text;
		}
		// Routine identity survives a displayed invocation with literal arguments.
		// Operation/type columns still require whole values (INDEX != INDEX(1)).
		if (/^(?:entry_point|subprogram|(?:procedure|function|routine)(?:_name)?)$/i.test(label)) {
			text = /^([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)\(\s*(?:(?:[-+]?\d+(?:\.\d+)?|NULL|'(?:[^']|'')*')\s*(?:,\s*(?:[-+]?\d+(?:\.\d+)?|NULL|'(?:[^']|'')*')\s*)*)?\)$/i.exec(text)?.[1] ?? text;
		}
		if (/^role$/i.test(label)) text = /^(child|parent)(?:\s+table(?:\s*[.]\s*column)?)?$/i.exec(text)?.[1] ?? text;
		// DML SQL in an operation column states its operation explicitly. This
		// does not split plan operations such as INDEX UNIQUE SCAN.
		if (/^operation$/i.test(label)) text = /^(INSERT)\s+INTO\b|^(UPDATE)\s+[A-Za-z_][\w$.]*\s+SET\b|^(DELETE)\s+FROM\b/i.exec(text)?.slice(1).find(Boolean) ?? text;
		if (preserveQualified && /^(?:ORA|TNS)-\d{5}$/i.test(value)
			&& text.toLowerCase().startsWith(value.toLowerCase())
			&& /^[:\s]/.test(text.slice(value.length))) return true;
		// Only this case's Oracle error-code cell accepts an unprefixed code.
		if (options.p31ErrorCode && /^ORA-\d{5}$/i.test(value) && /^\d{5}$/.test(text)) return text === value.slice(4);
		if (numeric(value)) return numeric(text) && decimal(text) === decimal(value);
		return text.toLowerCase() === value.toLowerCase() || /^(?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*$/.test(text) && text.split('.').at(-1)!.toLowerCase() === value.toLowerCase() || /^(?:VARCHAR2|NUMBER|CHAR|NVARCHAR2)$/i.test(value) && new RegExp(`^${value}\\(\\d+(?:,\\s*\\d+)?\\)$`, 'i').test(text);
	};
	const labelWords = (text: string) => text.replace(/[`*]/g, '').replace(/_/g, ' ').toLowerCase().replace(/\bstatistics\b/g, 'stats').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
	const rowLabelScore = (actual: string, expected: string) => {
		const allWords = labelWords(actual), expectedWords = labelWords(expected);
		const expectedKey = expectedWords.join(' ');
		if (!allWords.length || !expectedWords.length) return -1;
		const truthWords = new Set(expectedWords);
		const guarded = new Set(['not', 'no', 'non', 'never', 'un', 'was', 'formerly', 'previous', 'previously', 'last', 'prior', 'old', 'former']);
		if (allWords.some(word => guarded.has(word) && !truthWords.has(word))) return -1;
		let actualWords = labelWords(actual.replace(/\s*\([^()]*\)\s*$/, ''));
		const phraseAliases: Record<string, string[]> = {
			'current container': ['container', 'name'],
			'parent cdb': ['database', 'name'],
			'parent database': ['database', 'name'],
		};
		actualWords = phraseAliases[actualWords.join(' ')] ?? actualWords;
		const neutral = new Set(['time', 'date', 'status', 'state', 'value', 'setting', 'recorded', 'current']);
		const remaining = [...actualWords];
		for (const word of expectedWords) {
			const index = remaining.indexOf(word);
			if (index >= 0) remaining.splice(index, 1);
			else if (word === 'stats') continue;
			else return -1;
		}
		if (remaining.some(word => !neutral.has(word))) return -1;
		const exact = actualWords.length === expectedWords.length && actualWords.every((word, index) => word === expectedWords[index]);
		return exact ? 1_000_000 : 100_000 - remaining.length;
	};
	const namedValueScore = (cell: string, label: string, expected: unknown) => {
		if (!/^[A-Za-z_][\w$#]*$/.test(label)) return -1;
		const escaped = escapeRegex(String(expected));
		return new RegExp(`\\b${escapeRegex(label)}\\s*=\\s*['\"]?${escaped}['\"]?(?![\\w.])`, 'i').test(clean(cell)) ? 50_000 : -1;
	};
	// Expand only whole, positive lists in table cells for single-column truth.
	// Do this before record splitting: a slash must not detach DELETE from
	// a negation elsewhere in the same cell (e.g. "not INSERT / DELETE").
	const singleColumnCell = (cell: string) => {
		if (/\b(?:not|no|except)\b/i.test(cell)) return '';
		const parts = cell.split(/\s+(?:or|and)\s+|\s*[,/]\s*/i);
		const atom = /^(?:[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*|[-+]?\d+(?:\.\d+)?)$/;
		if (parts.length > 1 && parts.every(part => atom.test(part))
			&& parts.some(part => part.toLowerCase() === String(row[0]).toLowerCase())) {
			return String(row[0]);
		}
		return cell;
	};
	const hasRoutineIdentity = labels.some(label => /^(?:entry_point|subprogram|(?:procedure|function|routine)(?:_name)?)$/i.test(label));
	const lines = answer.split(/\r?\n/).map(clean).map(line => {
		// Remove descriptive numeric annotations as whole cells before named bindings
		// or slash separators can inspect their contents. Keep wrong numbers intact.
		if (line.startsWith('|') && line.endsWith('|')) line = '|' + line.split('|').slice(1, -1).map(cell => {
			const annotation = /^\s*([-+]?\d+(?:\.\d+)?)\s+\(([^()]*)\)\s*$/.exec(cell);
			return annotation && !row.some(value => !numeric(String(value)) && clean(annotation[2]!).toLowerCase() === clean(String(value)).toLowerCase()) && !/\d|\b(?:not|no|never|except|without|was|formerly|previously)\b/i.test(annotation[2]!) ? annotation[1]! : cell;
		}).join('|') + '|';
		if (row.length !== 1 || !line.startsWith('|') || !line.endsWith('|')) return line;
		return '|' + line.split('|').slice(1, -1).map(clean).map(singleColumnCell).join('|') + '|';
	}).flatMap(line => {
		// Repeated record keys and adjacent markdown rows delimit separate records,
		// even when a response puts them on one physical line.
		// Routine mappings can contain parenthetical scheduler assignments. These
		// annotations cannot start or divide routine records.
		let depth = 0;
		const masked = line.split('').map(char => {
			if (char === '(') { depth++; return ' '; }
			if (char === ')') { depth = Math.max(0, depth - 1); return ' '; }
			return depth ? ' ' : char;
		}).join('');
		const recordText = masked;
		const firstKey = /(?:^[-•]?\s*|[|;])\s*([A-Za-z_]+)\s*=/.exec(recordText)?.[1];
		const records: string[] = [];
		let offset = 0;
		if (firstKey) for (const match of recordText.matchAll(new RegExp(`(?:[;,]\\s*|\\s+/\\s+|\\s*\\|\\s*)(?=${firstKey}\\s*=)`, 'gi'))) {
			records.push(line.slice(offset, match.index));
			offset = match.index + match[0].length;
		}
		records.push(line.slice(offset));
		return records.flatMap(record => record.split(/(?<=\S)\s*\|\s*\|\s*(?=\S)/));
	});
	// Column-oriented markdown tables are also records: transpose each contiguous table.
	const inlineRecord = /\(([^()]*[A-Za-z_][\w$]*(?:\s+[A-Za-z_][\w$]*)*\s*[=:][^()]*)\)/g;
	const candidates = lines.map(line => singleRow ? line.replace(inlineRecord, '') : line);
	if (singleRow || row.length === 1) {
		for (const line of lines) {
			for (const match of line.matchAll(inlineRecord)) candidates.push(match[1]!.replace(/^([^=:]+):\s*/, '$1='));
		}
	}
	// A single record may be a bounded contiguous block of whole labelled values.
	if (singleRow) {
		let values: string[] = [];
		let named: string[] = [];
		const flush = () => {
			if (values.length > 0 && values.length <= 8) {
				const available = [...values];
				if (row.every(value => {
					const index = available.findIndex(actual => same(actual, value));
					if (index < 0) return false;
					available.splice(index, 1); return true;
				})) candidates.push(named.join(' | '));
			}
			values = []; named = [];
		};
		for (const line of lines) {
			const match = /^(?:[-•]\s+)?[A-Za-z][A-Za-z_ ]*:\s*(.+)$/.exec(line);
			if (match) {
				const rawLabel = line.slice(0, line.indexOf(':')).replace(/^[-•]\s+/, '').trim().replace(/\s+/g, '_').toLowerCase();
				const label = ({ successes_audited: 'success', failures_audited: 'failure', enablement_mode: 'enabled_option' } as Record<string, string>)[rawLabel] ?? rawLabel;
				values.push(match[1]!);
				named.push(labels.some(expected => expected.toLowerCase() === label) ? `${label}=${match[1]!}` : match[1]!);
			} else flush();
		}
		flush();
	}
	// A single p18 or p19 truth record may be presented as separate labelled facts.
	// Pool only positive labelled lines, never table rows or unlabelled mentions.
	const pooledFacts: string[] = [];
	if ((preserveQualified || p19) && singleRow) {
		const facts = lines.filter(line => !line.includes('|') && !/\b(?:not|no|never|except|without)\b/i.test(line))
			.flatMap(line => {
				const match = /^(?:[-•]\s+)?[A-Za-z][^:=]*:\s*(.+)$/.exec(line);
				if (!match) return [];
				// Keep the leading value; an explanation after it is not another fact.
				const value = /^(?:ORA|TNS)-\d{5}(?=[:\s]|$)|^[A-Za-z_][\w$#]*(?:\.[A-Za-z_][\w$#]*)*|^[-+]?\d+(?:\.\d+)?/i.exec(match[1]!);
				return value ? [value[0]] : [];
			});
		if (p19) pooledFacts.push(...facts);
		else if (facts.length) candidates.push(facts.join(' | '));
	}
	// Contiguous labelled bullets form one record. Blank lines, headings,
	// prose, and repeated labels close it; never pool cells across policies.
	let bulletFields: string[] = [];
	const bulletLabels = new Set<string>();
	const flushBullets = () => {
		if (bulletFields.length) candidates.push(bulletFields.join(' / '));
		bulletFields = [];
		bulletLabels.clear();
	};
	for (const line of lines) {
		const match = /^[-•]\s+([A-Za-z][A-Za-z_ ]*)\s*:\s*(.+)$/.exec(line);
		if (!match) {
			flushBullets();
			// A numbered policy heading supplies the identity for its following block.
			const heading = /^(?:#{1,6}\s+)?\d+[.)]\s+(ORA_[A-Z_]+)$/i.exec(line);
			if (heading && labels.includes('policy_name')) {
				bulletLabels.add('policy_name'); bulletFields.push(`policy_name=${heading[1]}`);
			}
			continue;
		}
		const rawLabel = match[1]!.trim().replace(/\s+/g, '_').toLowerCase();
		const label = ({ enablement_mode: 'enabled_option', successes_audited: 'success', failures_audited: 'failure' } as Record<string, string>)[rawLabel] ?? rawLabel;
		if (!labels.some(expected => expected.toLowerCase() === label)) { flushBullets(); continue; }
		if (bulletLabels.has(label)) flushBullets();
		bulletLabels.add(label);
		bulletFields.push(`${label}=${evidence(match[2]!)}`);
	}
	flushBullets();
	const routineColumn = labels.find(label => /^(?:subprogram|(?:procedure|function|routine)(?:_name)?)$/i.test(label));
	const roleColumn = labels.findIndex(label => /^role$/i.test(label));
	let headingRoutine: string | undefined;
	for (let start = 0; start < lines.length; start++) {
		if (/^#{1,6}\s/.test(lines[start]!)) {
			headingRoutine = /^#{1,6}\s+(?:(?:PROCEDURE|FUNCTION)\s+)?([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)(?:\([^()]*\))?\s*$/i.exec(lines[start]!)?.[1];
		}
		if (!lines[start]!.startsWith('|')) continue;
		const block: string[][] = [];
		const indices: number[] = [];
		while (start < lines.length && lines[start]!.startsWith('|')) {
			const cells = lines[start++]!.split('|').slice(1, -1).map(clean);
			if (!cells.every(cell => /^:?-+:?$/.test(cell))) { block.push(cells); indices.push(start - 1); }
		}
		start--; // The outer loop must still visit the next non-table line/heading.
		if (block[0]?.some(cell => labels.some(label => label && label.toLowerCase() === cell.toLowerCase()))) {
			for (let i = 1; i < block.length; i++) candidates[indices[i]!] = block[i]!.map((value, col) => `${block[0]![col]}=${/^role$/i.test(block[0]![col] ?? '') ? evidence(value) : value}`).concat(routineColumn && headingRoutine ? [`${routineColumn}=${headingRoutine}`] : []).join(' / ');
			continue;
		}
		// Presentation columns (#, sources) are not evidence values. A vertical
		// record can use Detail and Value together, but only inside this table
		// and only for a single truth record; never pool unrelated tables.
		const header = block[0] ?? [];
		// The backup question specifies four sources in order. A Source (view)
		// column describes those sources, while presentation ordinals are ignored.
		if (singleRow && backupCounts && header.some(cell => /^source\s*\(view\)$/i.test(cell))) {
			for (const index of indices) candidates[index] = '';
			const sourceColumn = header.findIndex(cell => /^source\s*\(view\)$/i.test(cell));
			const countColumn = header.findIndex(cell => /^(?:rows|row count|count|result|value)$/i.test(cell));
			const sources = [/^RMAN job history\b|^V\$RMAN_BACKUP_JOB_DETAILS\b/i, /^Datafile backups\b|^V\$BACKUP_DATAFILE\b/i, /^Backup sets\b|^V\$BACKUP_SET\b/i, /^Backup pieces\b|^V\$BACKUP_PIECE\b/i];
			if (countColumn >= 0 && block.length === row.length + 1 && row.length === sources.length
				&& block.slice(1).every((cells, index) => sources[index]!.test(cells[sourceColumn] ?? '') && same(cells[countColumn] ?? '', row[index]))) {
				candidates.push(row.map(String).join(' | '));
			}
			continue;
		}
		const keyColumn = header.findIndex(cell => /^(?:item|step|metric|attribute|field|property|category|source(?: view)?)$/i.test(cell));
		const valueColumns = header.flatMap((cell, index) => /^(?:value|recorded value|detail|rows|row count)$/i.test(cell) ? [index] : []);
		// Generic two-column Attribute/Value tables bind each truth field by its
		// row label, allowing descriptive labels such as "Next Run Time".
		if (singleRow && row.length <= 2 && header.length === 2 && /^attribute$/i.test(header[keyColumn] ?? '') && valueColumns.length === 1 && /^value$/i.test(header[valueColumns[0]!] ?? '')) {
			const valueColumn = valueColumns[0]!;
			const dataRows = block.slice(1);
			const scoresByColumn = row.map((expected, index) => dataRows.map(cells => Math.max(
				rowLabelScore(cells[keyColumn] ?? '', labels[index] ?? ''),
				namedValueScore(cells[valueColumn] ?? '', labels[index] ?? '', expected),
			)));
			const assignments: { rows: number[]; scores: number[]; total: number }[] = [];
			const assign = (column: number, usedRows: Set<number>, rows: number[], scores: number[], total: number) => {
				if (column === row.length) { assignments.push({ rows, scores, total }); return; }
				for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
					const labelScore = scoresByColumn[column]![rowIndex]!;
					if (usedRows.has(rowIndex) || labelScore < 0) continue;
					assign(column + 1, new Set([...usedRows, rowIndex]), [...rows, rowIndex], [...scores, labelScore], total + labelScore);
				}
			};
			assign(0, new Set(), [], [], 0);
			if (assignments.length) {
				const bestTotal = Math.max(...assignments.map(candidate => candidate.total));
				const bestAssignments = assignments.filter(candidate => candidate.total === bestTotal);
				return bestAssignments.every(candidate => candidate.rows.every((rowIndex, index) => {
					const truthValue = row[index];
					const score = candidate.scores[index]!;
					const duplicatesAgree = dataRows.every((cells, duplicateIndex) => scoresByColumn[index]![duplicateIndex] !== score
						|| same(cells[valueColumn] ?? '', truthValue, labels[index] ?? ''));
					return duplicatesAgree && same(dataRows[rowIndex]![valueColumn] ?? '', truthValue, labels[index] ?? '');
				}));
			}
			if (dataRows.some(cells => row.some((expected, index) => same(cells[valueColumn] ?? '', expected, labels[index] ?? '')))) return false;
		}
		// In a vertical relationship table, child and parent attributes describe
		// distinct records. Group only table/column attributes of the same role.
		if (roleColumn >= 0 && keyColumn >= 0 && valueColumns.length) {
			for (const index of indices) candidates[index] = '';
			const role = String(row[roleColumn]);
			const explicitRoles = block.slice(1).filter(cells => /^role$/i.test(cells[keyColumn] ?? ''));
			if (explicitRoles.length === 1 && valueColumns.some(col => same(explicitRoles[0]![col] ?? '', role, 'role'))) {
				candidates.push(block.slice(1).flatMap(cells => valueColumns.map(col => `${cells[keyColumn]}=${cells[col] ?? ''}`)).join(' / '));
				continue;
			}
			const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const attributes = block.slice(1).filter(cells => new RegExp(`^${escapedRole}\\s+(?:table(?:\\s*[.]\\s*column)?|column)$`, 'i').test(cells[keyColumn] ?? ''));
			if (attributes.length) candidates.push(`role=${role} / ` + attributes.flatMap(cells => valueColumns.map(col => cells[col] ?? '')).join(' / '));
			continue;
		}
		// Extra value headers apply only to the constrained single-record alias.
		if (singleRow) header.forEach((cell, index) => {
			if (/^(?:count|result)$/i.test(cell)) valueColumns.push(index);
		});
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
	if (p19 && singleRow && pooledFacts.length) {
		// Cursor identity can be in a named table or an inline labelled fact while
		// its counts are separate bullets. Accept only one unambiguous labelled ID.
		const ids = new Set<string>();
		for (const line of [...lines, ...candidates]) {
			for (const match of line.matchAll(/\bsql_id\s*[=:]\s*['"]?([0-9abcdfghjkmnpqrstuvwxyz]{13})(?![\w])/gi)) ids.add(match[1]!.toLowerCase());
		}
		if (ids.size === 1) pooledFacts.push(`sql_id=${[...ids][0]}`);
		candidates.push(pooledFacts.join(' | '));
	}

	// Retain original parsing and add an alternative only for exact positive
	// parenthetical values in whole table cells.
	for (const line of [...candidates]) {
		if (!/[|=]/.test(line)) continue;
		const expanded = line.split(/(\|| \/ )/).map(cell => {
			const annotation = /\s+\(([^()]*)\)\s*$/.exec(clean(cell));
			return annotation && !numeric(clean(annotation[1]!)) && !/\b(?:not|no|never|except|without|was|formerly|previously)\b/i.test(cell)
				&& row.some(value => clean(annotation[1]!).toLowerCase() === clean(String(value)).toLowerCase()) ? (cell.includes('=') ? cell.slice(0, cell.indexOf('=') + 1) : '') + annotation[1]! : cell;
		}).join('');
		if (expanded !== line) candidates.push(expanded);
	}

	return candidates.some(line => {
		// Named values must agree with their own truth column, even when the
		// unordered multiset of values would otherwise match a swapped record.
		// A literal slash belongs to the value (User I/O, paths). Only a
		// whitespace-delimited slash separates named fields, as in fields below.
		const bindings = [...line.matchAll(p27 ? /(?:^|[|;]\s*|\s+\/\s+)([A-Za-z_][\w$]*)\s*=\s*((?:(?!\s+\/\s+)[^|;])*)/g : /(?:^|[|;,(]\s*|\s+\/\s+)([A-Za-z_][\w$]*)\s*=\s*((?:(?!\s+\/\s+)[^|;,)])*)/g)];
		if (labels.some((label, index) => label && bindings.some(binding => binding[1]!.toLowerCase() === label.toLowerCase() && !same(binding[2]!, row[index], label)))) return false;
		const structured = /[|=]/.test(line) || / \/ /.test(line);
		const fields = line.replace(/^[-•]\s+/, '').split(/\s*\|\s*/).map(stripAnnotation).flatMap(field => field.split(/\s+\/\s+|;\s*|,\s+(?=[A-Za-z_]+\s*=)/)).filter(Boolean).flatMap(field => field.includes('=') ? field.split('=').map(clean) : [clean(field)]);
		// A slash in single-value explanatory prose is not a record separator.
		if (structured && !(row.length === 1 && !/[|=]/.test(line) && bindings.length === 0)) {
			// An explicitly qualified object cannot borrow a different owner from
			// another field. Only owner columns constrain qualifiers; unrelated
			// child and parent objects may legitimately use different schemas.
			for (const field of fields) {
				const parts = evidence(field).split('.');
				if (parts.length < 2 || !parts.every(part => /^[A-Za-z_][\w$]*$/.test(part))) continue;
				const objectIndex = row.findIndex(value => String(value).toLowerCase() === parts.at(-1)!.toLowerCase());
				if (objectIndex < 0 || !/(?:table|table_name|index|index_name|constraint|constraint_name)$/i.test(labels[objectIndex] ?? '')) continue;
				const ownerLabel = labels[objectIndex]?.replace(/(?:table|table_name|index|index_name|constraint|constraint_name)$/i, 'owner');
				const ownerIndex = labels.findIndex(label => /owner$/i.test(label) && (label === ownerLabel || label === 'owner'));
				if (ownerIndex >= 0 && !same(parts[0]!, row[ownerIndex])) return false;
			}
			const available = fields.flatMap(field => {
				const value = evidence(field);
				return /^(?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*$/.test(value) && !(preserveQualified && row.some(expected => String(expected).toLowerCase() === value.toLowerCase())) ? value.split('.') : [value];
			});
			return row.every((value, column) => { const index = available.findIndex(field => same(field, value, labels[column])); if (index < 0) return false; available.splice(index, 1); return true; });
		}
		// Plain prose/list rows: consume distinct bounded occurrences on this line.
		let remaining = line;
		return row.every((value, column) => {
			const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const qualifier = /^[A-Za-z_][\w$]*$/.test(String(value)) ? '(?:[A-Za-z_][\\w$]*\\.)*' : '';
			const pattern = new RegExp(`(?<![\\w.])${qualifier}${escaped}(?!\\w|\\.\\d)`, 'i');
			const match = numeric(String(value))
				? [...remaining.matchAll(/(?<![\w.])[-+]?\d+(?:\.\d+)?(?!\w|\.\d)/g)].find(candidate => same(candidate[0], value))
				: pattern.exec(remaining);
			if (!match) return false;
			// Negation must describe this occurrence, not another claim on the line.
			if (row.length === 1 && /\b(?:not|no|never|except|without)\s+(?:(?:equal to|configured as|set to)\s+)?$/i.test(remaining.slice(0, match.index))) return false;
			// Preserve the structured-cell owner check for newly accepted prose
			// qualifiers as well: an explicit wrong owner is not equivalent.
			if (qualifier && match[0].includes('.') && /(?:table|table_name|index|index_name|constraint|constraint_name)$/i.test(labels[column] ?? '')) {
				const ownerLabel = labels[column]?.replace(/(?:table|table_name|index|index_name|constraint|constraint_name)$/i, 'owner');
				const ownerIndex = labels.findIndex(label => /owner$/i.test(label) && (label === ownerLabel || label === 'owner'));
				if (ownerIndex >= 0 && !same(match[0].split('.')[0]!, row[ownerIndex])) return false;
			}
			remaining = remaining.slice(0, match.index) + ' '.repeat(match[0].length) + remaining.slice(match.index + match[0].length);
			return true;
		});
	});
}
