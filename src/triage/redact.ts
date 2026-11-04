/** Preserve business literals; redact only credential contexts, including split lines. */
export function redactCredentials(text: string): string {
	const literal = String.raw`(?:q'\[[\s\S]*?(?:\]'|$)|q'\{[\s\S]*?(?:\}'|$)|q'\([\s\S]*?(?:\)'|$)|q'<[\s\S]*?(?:>'|$)|q'([^\w\s])[\s\S]*?(?:BACKREF'|$)|'(?:''|[^'])*(?:'|$)|"(?:""|[^"])*(?:"|$))`;
	const prefix = String.raw`(\bIDENTIFIED\s+BY\s+|\b(?:[A-Z0-9_]*_)?(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_?KEY)\s*(?::=|=>|=|:)\s*)`;
	// Match credential contexts directly, so apostrophes in comments cannot hide an assignment.
	const assignments = new RegExp(prefix + `(?:${literal.replace('BACKREF', '\\2')}(?:\\s*\\|\\|\\s*${literal.replace('BACKREF', '\\3')})*|[^\\s;,()]+)`, 'gi');
	return text.replace(assignments, (match: string, context: string) => context + "'[REDACTED]'" + '\n'.repeat((match.slice(context.length).match(/\n/g) ?? []).length))
		.replace(/\b[a-z][\w+.-]*:\/\/[^\s:@/'"]+:[^\s@]+@[^\s'";]+|\b[\w$#]+\/(?:"(?:""|[^"])*"|'(?:''|[^'])*'|[^\s/@'";]+)@[^\s'";]+/gi, '[REDACTED CONNECTION]');
}
