import { StatementRejectedError } from "../contracts.js";

/** Lex SQL before checking tokens: quoted text must never hide executable tokens. */
export function classifySql(sql: string): string {
	const reject = (reason: string): never => { throw new StatementRejectedError(reason); };
	let clean = ""; const terminators: number[] = [];
	for (let i = 0; i < sql.length;) {
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
			clean += quote === '"' ? ` ${value.toUpperCase()} ` : " literal ";
		} else { if (sql[i] === ";") terminators.push(i); clean += sql[i++]; }
	}
	clean = clean.trim();
	if (clean.endsWith(";")) clean = clean.slice(0, -1).trim();
	if (clean.includes(";")) reject("Only one statement is allowed");
	if (!/^(SELECT|WITH)\b/i.test(clean)) reject("Only SELECT or WITH is allowed");
	if (/\bNEXTVAL\b/i.test(clean)) reject("Sequence advancement is forbidden");
	if (/@/.test(clean)) reject("Database links are forbidden");
	if (/\bFOR\s+UPDATE\b/i.test(clean)) reject("FOR UPDATE is forbidden");
	if (/(?<![\w$#])(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|BEGIN|DECLARE|CALL|EXECUTE|LOCK|COMMIT|ROLLBACK|INTO)(?![\w$#])/i.test(clean)) reject("Write or procedural token is forbidden");
	if (/\b(DBMS_\w+|UTL_\w+)\b/i.test(clean) && !/\bDBMS_XPLAN\s*\.\s*DISPLAY_CURSOR\b/i.test(clean)) reject("Package calls are forbidden");
	if (/\bDBMS_XPLAN\s*\.\s*(?!DISPLAY_CURSOR\b)\w+/i.test(clean)) reject("Only DISPLAY_CURSOR is allowed from DBMS_XPLAN");
	// Even when DISPLAY_CURSOR is present, no other DBMS/UTL package may piggyback.
	if (/\b(?:DBMS_(?!XPLAN\b)\w+|UTL_\w+)\b/i.test(clean)) reject("Package calls are forbidden");
	if (/\b(V\$ACTIVE_SESSION_HISTORY|DBA_HIST_\w+)\b/i.test(clean)) reject("Diagnostics Pack views are out of scope");
	return (terminators.length ? sql.slice(0, terminators[0]) + sql.slice(terminators[0]! + 1) : sql).trim();
}
export const assertReadOnlySql = classifySql;
