/** Jobs contain arbitrary application text; broaden credential matching locally. */
export function redactJobCredentials(text: string): string {
	const literal = String.raw`(?:q'\[[\s\S]*?(?:\]'|$)|q'\{[\s\S]*?(?:\}'|$)|q'\([\s\S]*?(?:\)'|$)|q'<[\s\S]*?(?:>'|$)|'(?:\\[\s\S]|''|[^'\\])*(?:'|$)|"(?:\\[\s\S]|""|[^"\\])*(?:"|$))`;
	const assignment = new RegExp(String.raw`(\b[\w.-]*(?:PASSWORD|PASSWD|PWD|PASS|SECRET|TOKEN|KEY|CREDENTIAL)[\w.-]*["']?\s*(?::=|=>|=|:)\s*)(?:${literal}(?:\s*\|\|\s*${literal})*|[^\s,;]+)`, 'gi');
	return text
		.replace(/(?:\b[a-z][\w+.-]*:\/\/|\/\/)[^\s/@]+@/gi, match => match.slice(0, match.indexOf('//') + 2) + '[REDACTED]@')
		.replace(/\bAuthorization\s*[:=]\s*[^\r\n]*/gi, 'Authorization: [REDACTED]')
		.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
		.replace(assignment, "$1'[REDACTED]'");
}
