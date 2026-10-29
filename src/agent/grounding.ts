/** Deterministic evidence check, deliberately limited to lexical hard facts.
 * Question text is an optional third argument so callers can exempt user-supplied facts.
 */
export interface FactCheck { facts: string[]; unsupported: string[] }
interface Numeric { text: string; value: number; precision: number; coefficient: bigint; exponent: number; unit: string; start: number; end: number }
const numberPattern = /(?<![\w$.])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?(?:\s*(?:[KMGT]i?B|[KMGT]|bytes|%))?(?![\w]|\.\d|,\d)/gi;
const identifierPattern = /(?<![\w])(?:[A-Za-z_$#][\w$#]*)(?:\.[A-Za-z_$#][\w$#]*)*/g;
const constants = new Set(('SQL SQL_ID ID DBA DB DML DDL PL SQL SELECT FROM WHERE JOIN ON AS AND OR NOT NULL WITH BY GROUP ORDER HAVING DESC ASC UNION ALL DISTINCT CASE WHEN THEN ELSE END IN IS LIKE EXISTS COUNT SUM AVG MIN MAX ROUND OVER PARTITION ROWS FETCH FIRST ONLY OFFSET LIMIT INSERT UPDATE DELETE MERGE DROP CREATE ALTER TABLE VIEW INDEX COMMIT ROLLBACK EXPLAIN PLAN FOR NEXTVAL SYS SYSTEM DBMS_ UTL_ KB MB GB TB KIB MIB GIB TIB CPU SGA PGA IO IOPS TEMP UNDO RMAN ASH AWR ORA JSON CSV UTC GMT TRUE FALSE N A OK PK FK UK Y N READ CTAS LIST_TARGETS DB_OVERVIEW LIST_SCHEMAS LIST_OBJECTS DESCRIBE_OBJECT GET_SOURCE RUN_QUERY EXPLAIN_PLAN TOP_SQL SESSION_ACTIVITY WAIT_EVENTS TABLESPACE_USAGE ROW_NUMBER DENSE_RANK RANK TO_CHAR TO_DATE TRUNC NVL NULLIF COALESCE PRIMARY KEY NO ACTION DBWR LGWR OLTP TX TM AE FIRST_ROWS FM DBA_ R C P U V O V$SQL V$SQLSTATS V$SQL_PLAN V$SQL_PLAN_MONITOR V$SESSION V$LOCK V$ACTIVE_SESSION_HISTORY DBA_HIST_ACTIVE_SESS_HISTORY ALL_CONSTRAINTS ALL_CONS_COLUMNS ALL_INDEXES ALL_IND_COLUMNS ALL_TAB_COLUMNS ALL_TABLES ALL_OBJECTS ALL_USERS ALL_SYNONYMS EXECUTIONS ELAPSED_TIME BUFFER_GETS CPU_TIME BLOCKING_SESSION R_OWNER R_CONSTRAINT_NAME').split(' '));
const norm = (text: string) => text.toLowerCase().replace(/["'`]/g, '').replace(/,/g, '');
function numbers(text: string): Numeric[] {
	return [...text.matchAll(numberPattern)].flatMap(match => {
		const raw = match[0];
		const parts = raw.match(/^([-+\d,.]+(?:e[-+]?\d+)?)(?:\s*(.*))?$/i)!;
		const literal = parts[1]!.replace(/,/g, '');
		const [mantissa, exponent] = literal.toLowerCase().split('e');
		const value = Number(literal);
		if (!Number.isFinite(value)) return [];
		const decimalExponent = Number(exponent ?? 0) - (mantissa!.split('.')[1]?.length ?? 0);
		return [{ text: raw, value, coefficient: BigInt(mantissa!.replace('.', '')), exponent: decimalExponent, precision: 10 ** decimalExponent, unit: (parts[2] ?? '').toUpperCase(), start: match.index!, end: match.index! + raw.length }];
	});
}
function scales(unit: string): number[] {
	const exponent = 'KMGT'.indexOf(unit[0] ?? '') + 1;
	if (/^[KMGT]$/.test(unit)) return [1000 ** exponent];
	if (!exponent || !/^[KMGT]I?B$/.test(unit)) return [1];
	return unit.includes('I') ? [1024 ** exponent] : [1024 ** exponent, 1000 ** exponent];
}
function rounded(actual: number, shown: Numeric): boolean {
	// Ratios use doubles; do not let floating-point uncertainty certify fine digits.
	if (shown.precision <= Math.max(Math.abs(actual), Math.abs(shown.value)) * Number.EPSILON * 8) return false;
	return Math.abs(actual - shown.value) < shown.precision / 2 + Math.max(Math.abs(actual), Math.abs(shown.value), 1) * Number.EPSILON * 8;
}
// Compare decimal values at the displayed precision without losing Oracle NUMBER digits.
function exactRounded(value: Numeric, shown: Numeric, sourceScale = 1, displayScale = 1): boolean {
	if (!Number.isFinite(value.exponent) || !Number.isFinite(shown.exponent)) return norm(value.text) === norm(shown.text) && sourceScale === displayScale;
	const common = Math.min(value.exponent, shown.exponent);
	const sourcePower = value.exponent - common, displayPower = shown.exponent - common;
	// Oracle NUMBER exponents are bounded; avoid huge allocations on arbitrary prose.
	if (sourcePower > 1000 || displayPower > 1000) return false;
	const source = value.coefficient * BigInt(sourceScale) * 10n ** BigInt(sourcePower);
	const displayQuantum = BigInt(displayScale) * 10n ** BigInt(displayPower);
	const delta = source - shown.coefficient * displayQuantum;
	return (delta < 0n ? -delta : delta) * 2n <= displayQuantum;
}
// Find a numerator near each denominator's required value, without an O(n²) scan.
function ratioSupported(shown: Numeric, values: readonly number[], multiplier: number): boolean {
	return values.some(denominator => {
		if (denominator === 0) return false;
		const target = shown.value * denominator / multiplier;
		let low = 0, high = values.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (values[mid]! < target) low = mid + 1; else high = mid;
		}
		return [values[low], values[low - 1]].some(n => n !== undefined && rounded(n / denominator * multiplier, shown));
	});
}
function identifiers(text: string): string[] {
	return [...text.matchAll(identifierPattern)].map(m => m[0].toLowerCase());
}
function identifierSupported(fact: string, evidence: Set<string>): boolean {
	return evidence.has(norm(fact)) || (fact.includes('.') && fact.split('.').every(part => evidence.has(norm(part))));
}
export function checkFacts(answer: string, toolResultTexts: readonly string[], question = ''): FactCheck {
	const evidenceText = toolResultTexts.join('\n');
	const evidence = new Set(identifiers(evidenceText).flatMap(id => [id, ...id.split('.')]));
	const questionEvidence = new Set(identifiers(question).flatMap(id => [id, ...id.split('.')]));
	const values = numbers(evidenceText);
	// Oracle wait tables label time in microseconds in the header, not in each cell.
	for (const text of toolResultTexts) {
		const lines = text.split('\n'), headers = lines[0]?.split('|').map(h => h.trim()) ?? [];
		for (const line of lines.slice(1)) {
			const cells = line.split('|');
			headers.forEach((header, i) => {
				if (!/(?:_MICRO|_MICROSECONDS)$/.test(header) || !cells[i]) return;
				for (const value of numbers(cells[i]!)) values.push({ ...value, value: value.value / 1e6, exponent: value.exponent - 6 });
			});
		}
	}
	const ratioValues = [...new Set(values.filter(n => !n.unit).map(n => n.value))].sort((a, b) => a - b);
	const questionNumbers = new Set(numbers(question).map(n => norm(n.text).replace(/\s+/g, '')));
	const facts: string[] = [], unsupported: string[] = [];
	const seen = new Set<string>();
	const add = (fact: string, supported: boolean) => {
		const key = norm(fact);
		if (seen.has(key)) return;
		seen.add(key); facts.push(fact);
		if (!supported) unsupported.push(fact);
	};
	const quoted = [...answer.matchAll(/([`"'])([A-Za-z_$#][\w$#]*(?:\.[A-Za-z_$#][\w$#]*)*)\1/g)];
	for (const match of answer.matchAll(identifierPattern)) {
		const fact = match[0];
		const isQuoted = quoted.some(q => match.index! > q.index! && match.index! < q.index! + q[0].length);
		const sqlId = /^[0-9abcdfghjkmnpqrstuvwxyz]{13}$/i.test(fact);
		if (!isQuoted && !sqlId && !(fact.length > 1 && fact === fact.toUpperCase() && /[A-Z]/.test(fact))) continue;
		if (constants.has(fact.toUpperCase()) || fact.split('.').every(part => constants.has(part.toUpperCase())) || /^FM[09]+$/i.test(fact) || identifierSupported(fact, questionEvidence)) continue;
		// Hyphenated prose (e.g. SHOPAPP-style) is not an unquoted Oracle identifier.
		if (/^-[a-z]/i.test(answer.slice(match.index! + fact.length)) || /[a-z]-$/i.test(answer.slice(0, match.index!))) continue;
		add(fact, identifierSupported(fact, evidence));
	}
	// SQL IDs can begin with a digit; identifier scanning above cannot capture those.
	for (const match of answer.matchAll(/(?<![\w])[0-9abcdfghjkmnpqrstuvwxyz]{13}(?![\w])/gi)) {
		if (/^\d+$/.test(match[0])) continue;
		if (questionEvidence.has(norm(match[0])) || question.toLowerCase().includes(match[0].toLowerCase())) continue;
		add(match[0], new RegExp(`(?<![\\w])${match[0]}(?![\\w])`, 'i').test(evidenceText));
	}
	for (const match of answer.matchAll(/(?<![\w.])\d+(?:\.\d+){2,4}(?![\w]|\.\d)/g)) {
		if (match[0].replace(/\D/g, '').length < 4 || evidenceText.includes(match[0]) || question.includes(match[0])) continue;
		add(match[0], false);
	}
	for (const shown of numbers(answer)) {
		if (shown.text.replace(/e[-+]?\d+/i, '').replace(/[^\d]/g, '').replace(/^0+/, '').length < 4) continue;
		if (!shown.unit && Number.isInteger(shown.value) && shown.value >= 1900 && shown.value <= 2099) continue;
		if (questionNumbers.has(norm(shown.text).replace(/\s+/g, ''))) continue;
		if (shown.value === 100 && /percent(?:age)?s?[^.!?]*sum[^.!?]*$/i.test(answer.slice(Math.max(0, shown.start - 100), shown.start))) continue;
		// Avoid treating digits inside quoted identifiers or SQL_IDs as quantities.
		if (quoted.some(q => shown.start >= q.index! && shown.end <= q.index! + q[0].length)) continue;
		const supported = values.some(value => {
			if (shown.unit === '%' || value.unit === '%') return shown.unit === '%' && (!value.unit || value.unit === '%') && exactRounded(value, shown);
			return scales(shown.unit).some(scale => scales(value.unit).some(source => exactRounded(value, shown, source, scale)));
		}) || ((shown.unit === '%' || !shown.unit) && ratioSupported(shown, ratioValues, shown.unit === '%' ? 100 : 1));
		add(shown.text, supported);
	}
	return { facts, unsupported };
}
