import { StatementRejectedError } from "../contracts.js";

// Explicit SQL built-ins only: never infer safety from a name prefix.
const sqlFunctions = new Set(`
ABS ACOS ASIN ATAN ATAN2 BITAND CEIL COS COSH EXP FLOOR LN LOG MOD NANVL
POWER REMAINDER ROUND SIGN SIN SINH SQRT TAN TANH TRUNC WIDTH_BUCKET
AVG COUNT SUM MIN MAX MEDIAN LISTAGG STDDEV STDDEV_POP STDDEV_SAMP VARIANCE
VAR_POP VAR_SAMP CORR COVAR_POP COVAR_SAMP PERCENTILE_CONT PERCENTILE_DISC
REGR_SLOPE REGR_INTERCEPT REGR_COUNT REGR_R2 REGR_AVGX REGR_AVGY REGR_SXX REGR_SYY REGR_SXY
RANK DENSE_RANK ROW_NUMBER LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE NTILE
RATIO_TO_REPORT CUME_DIST PERCENT_RANK
ASCII CHR CONCAT INITCAP INSTR INSTRB INSTRC INSTR2 INSTR4 LENGTH LENGTHB LENGTHC
LENGTH2 LENGTH4 LOWER UPPER LPAD RPAD LTRIM RTRIM TRIM REPLACE TRANSLATE
SUBSTR SUBSTRB SUBSTRC SUBSTR2 SUBSTR4 SOUNDEX NLS_INITCAP NLS_LOWER NLS_UPPER NLSSORT
REGEXP_COUNT REGEXP_INSTR REGEXP_REPLACE REGEXP_SUBSTR REGEXP_LIKE
ADD_MONTHS LAST_DAY MONTHS_BETWEEN NEXT_DAY EXTRACT NUMTODSINTERVAL NUMTOYMINTERVAL
TO_DSINTERVAL TO_YMINTERVAL FROM_TZ NEW_TIME TZ_OFFSET SYS_EXTRACT_UTC
CURRENT_DATE CURRENT_TIMESTAMP LOCALTIMESTAMP
TO_CHAR TO_NCHAR TO_NUMBER TO_BINARY_FLOAT TO_BINARY_DOUBLE TO_DATE TO_TIMESTAMP
TO_TIMESTAMP_TZ CAST TO_CLOB TO_NCLOB TO_LOB TO_MULTI_BYTE TO_SINGLE_BYTE
ASCIISTR UNISTR RAWTOHEX HEXTORAW RAWTONHEX BIN_TO_NUM CONVERT VALIDATE_CONVERSION
NVL NVL2 COALESCE NULLIF DECODE GREATEST LEAST LNNVL
JSON_VALUE JSON_QUERY JSON_TABLE JSON_EXISTS JSON_OBJECT JSON_ARRAY JSON_OBJECTAGG JSON_ARRAYAGG
SYS_CONTEXT USERENV GROUPING GROUPING_ID CARDINALITY DUMP VSIZE ORA_HASH
`.trim().split(/\s+/));

// These are grammar tokens, not callable object names. Quoted forms never qualify.
const parenthesizedSyntax = new Set(`IN EXISTS VALUES OVER GROUP KEEP FILTER AS
FROM JOIN ON WHERE AND OR NOT HAVING WHEN THEN ELSE SELECT BY DISTINCT ALL
COLUMNS ROLLUP CUBE GROUPING SETS PARTITION SUBPARTITION PIVOT UNPIVOT
VARCHAR2 VARCHAR CHAR NCHAR NVARCHAR2 NUMBER FLOAT RAW TIMESTAMP INTERVAL`.split(/\s+/));
const identifier = /^(?:[\p{L}_][\p{L}\p{N}\p{M}_$#]*|"(?:[^"]|"")*")$/u;
const intervalUnits = new Set(["YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND"]);

function closingParen(tokens: string[], open: number): number {
	for (let depth = 0, k = open; k < tokens.length; k++) {
		if (tokens[k] === '(') depth++;
		else if (tokens[k] === ')' && --depth === 0) return k;
	}
	return -1;
}

/** Non-reserved keywords (DAY, FIRST, NULLS, ...) can also name functions, so accept them only in their grammar position. */
function isContextualSyntax(tokens: string[], at: number, upper: string): boolean {
	const prev = (tokens[at - 1] ?? '').toUpperCase();
	const close = closingParen(tokens, at + 1);
	if (close < 0) return false;
	const precision = /^\(\d+(?:,\d+)?\)$/.test(tokens.slice(at + 1, close + 1).join(''));
	// INTERVAL '1' DAY(3), INTERVAL DAY(3) TO SECOND(2); string literals lex as `literal`.
	if (intervalUnits.has(upper)) return precision && (prev === 'INTERVAL' || prev === 'TO' || (tokens[at - 1] === 'literal' && tokens[at - 2]?.toUpperCase() === 'INTERVAL'));
	if (['NUMERIC', 'DECIMAL', 'DEC'].includes(upper)) return precision && prev === 'AS';
	if (upper === 'FIRST' || upper === 'NEXT') return prev === 'FETCH';
	if (upper === 'NULLS') return prev === 'INCLUDE' || prev === 'EXCLUDE';
	// OFFSET (n) ROWS ends a query block: only FETCH, ")" or the end may follow.
	if (upper === 'OFFSET') return !['SELECT', ',', '('].includes(prev) && ['ROW', 'ROWS'].includes((tokens[close + 1] ?? '').toUpperCase()) && [undefined, 'FETCH', ')', ';'].includes(tokens[close + 2]?.toUpperCase());
	return false;
}

function checkFunctionCalls(clean: string): void {
	const tokens = clean.match(/"(?:[^"]|"")*"|[\p{L}_][\p{L}\p{N}\p{M}_$#]*|[^\s]/gu) ?? [];
	for (let i = 0; i < tokens.length; i++) {
		if (!identifier.test(tokens[i]!) || tokens[i - 1] === '.') continue;
		let end = i;
		while (tokens[end + 1] === '.' && identifier.test(tokens[end + 2] ?? '')) end += 2;
		if (tokens[end + 1] !== '(') continue;
		const parts = tokens.slice(i, end + 1);
		const name = parts.join('');
		const upper = name.toUpperCase();
		const plain = /^[A-Za-z_][A-Za-z0-9_$#.]*$/.test(name);
		if (plain && upper === 'DBMS_XPLAN.DISPLAY_CURSOR') continue;
		if (end === i && plain) {
			if (sqlFunctions.has(upper) || parenthesizedSyntax.has(upper) || isContextualSyntax(tokens, end, upper)) continue;
			if (upper === 'TABLE' && tokens.slice(end + 2, end + 6).join('').toUpperCase() === 'DBMS_XPLAN.DISPLAY_CURSOR(') continue;
		}
		// A CTE declaration is name (identifier, ...) AS (, never an invocation.
		if (end === i && ['WITH', ','].includes((tokens[i - 1] ?? '').toUpperCase())) {
			let j = end + 2;
			if (identifier.test(tokens[j] ?? '')) {
				j++;
				while (tokens[j] === ',' && identifier.test(tokens[j + 1] ?? '')) j += 2;
				if (tokens[j] === ')' && tokens[j + 1]?.toUpperCase() === 'AS' && tokens[j + 2] === '(') continue;
			}
		}
		throw new StatementRejectedError(`Function ${name} is not allowed`);
	}
}

/** Lex SQL before checking tokens: quoted text must never hide executable tokens. */
export function classifySql(sql: string): string {
	const reject = (reason: string): never => { throw new StatementRejectedError(reason); };
	let clean = ""; let callClean = ""; const terminators: number[] = [];
	for (let i = 0; i < sql.length;) {
		const start = clean.length; let quotedIdentifier: string | undefined;
		const rest = sql.slice(i);
		if (rest.startsWith("--")) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end; clean += " "; }
		else if (rest.startsWith("/*")) { const end = sql.indexOf("*/", i + 2); if (end < 0) reject("Unterminated comment"); i = end + 2; clean += " "; }
		else if (/^[qQ]'/.test(rest)) {
			const open = sql[i + 2]; if (!open || /\s/.test(open)) reject("Invalid alternative quote");
			const close = ({ "[": "]", "{": "}", "(": ")", "<": ">" } as Record<string, string>)[open!] ?? open;
			const end = sql.indexOf(`${close}'`, i + 3); if (end < 0) reject("Unterminated alternative quote"); i = end + 2; clean += " literal ";
		} else if (sql[i] === "'" || sql[i] === '"') {
			const quote = sql[i++]!; let value = ""; let closed = false;
			while (i < sql.length) { const c = sql[i++]!; if (c === quote) { if (sql[i] === quote) { value += quote; i++; } else { closed = true; break; } } else value += c; }
			if (!closed) reject("Unterminated quote");
			if (quote === '"') quotedIdentifier = ` "${value.replaceAll('"', '""')}" `;
			clean += quote === '"' ? ` ${value.toUpperCase()} ` : " literal ";
		} else { if (sql[i] === ";") terminators.push(i); clean += sql[i++]; }
		callClean += quotedIdentifier ?? clean.slice(start);
	}
	clean = clean.trim();
	if (clean.endsWith(";")) clean = clean.slice(0, -1).trim();
	if (clean.includes(";")) reject("Only one statement is allowed");
	if (!/^(SELECT|WITH)\b/i.test(clean)) reject("Only SELECT or WITH is allowed");
	if (/\bNEXTVAL\b/i.test(clean)) reject("Sequence advancement is forbidden");
	if (/@/.test(clean)) reject("Database links are forbidden");
	if (/\bFOR\s+UPDATE\b/i.test(clean)) reject("FOR UPDATE is forbidden");
	if (/(?<![\w$#])(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|BEGIN|DECLARE|CALL|EXECUTE|LOCK|COMMIT|ROLLBACK|INTO)(?![\w$#])/i.test(clean)) reject("Write or procedural token is forbidden");
	checkFunctionCalls(callClean);
	if (/\b(DBMS_\w+|UTL_\w+)\b/i.test(clean) && !/\bDBMS_XPLAN\s*\.\s*DISPLAY_CURSOR\b/i.test(clean)) reject("Package calls are forbidden");
	if (/\bDBMS_XPLAN\s*\.\s*(?!DISPLAY_CURSOR\b)\w+/i.test(clean)) reject("Only DISPLAY_CURSOR is allowed from DBMS_XPLAN");
	// Even when DISPLAY_CURSOR is present, no other DBMS/UTL package may piggyback.
	if (/\b(?:DBMS_(?!XPLAN\b)\w+|UTL_\w+)\b/i.test(clean)) reject("Package calls are forbidden");
	if (/\b(V\$ACTIVE_SESSION_HISTORY|DBA_HIST_\w+)\b/i.test(clean)) reject("Diagnostics Pack views are out of scope");
	return (terminators.length ? sql.slice(0, terminators[0]) + sql.slice(terminators[0]! + 1) : sql).trim();
}
export const assertReadOnlySql = classifySql;
