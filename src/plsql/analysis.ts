import type { SourceRow, ArgumentRow } from './dictionary.js';
export interface BodyRange { type: string; startLine: number; endLine: number; heuristic: true }
interface Token { value: string; start: number; end: number }
export interface Routine { type: string; name: string; declaration: string; comments: string; parameters: { name: string; type: string; default: string | null }[]; range: BodyRange | null; rows: SourceRow[] }
/** Offset-preserving lexer: comments/literals cannot introduce declarations or ENDs. */
export function mask(text: string): string { return text.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, s => s.replace(/[^\n]/g, ' ')); }
function parameters(header: string): Routine['parameters'] {
	const text = mask(header), start = text.indexOf('('); if (start < 0) return [];
	let depth = 1, from = start + 1;
	const parts: string[] = [];
	for (let i = from; i < text.length; i++) {
		if (text[i] === '(') depth++;
		if (text[i] === ')') depth--;
		if (depth === 0 || (depth === 1 && text[i] === ',')) { parts.push(header.slice(from, i)); from = i + 1; if (!depth) break; }
	}
	return parts.map(part => {
		const m = /^\s*([\w$#]+)\s+(?:(?:IN\s+OUT|IN|OUT)\s+)?(?:NOCOPY\s+)?([\s\S]*)$/i.exec(part);
		if (!m) return { name: '', type: '', default: null };
		const d = /\bDEFAULT\b|:=/i.exec(mask(m[2]!));
		return { name: m[1]!.toUpperCase(), type: (d ? m[2]!.slice(0, d.index) : m[2]!).trim().toUpperCase(), default: d ? m[2]!.slice(d.index + d[0].length).trim() : null };
	});
}
function commentsBefore(text: string): string {
	let prefix = text.trimEnd();
	const comments: string[] = [];
	while (prefix) {
		if (prefix.endsWith('*/')) {
			const start = prefix.lastIndexOf('/*'); if (start < 0) break;
			comments.unshift(prefix.slice(start)); prefix = prefix.slice(0, start).trimEnd();
		} else {
			const line = /(?:^|\n)[ \t]*(--[^\n]*)$/.exec(prefix); if (!line) break;
			comments.unshift(line[1]!); prefix = prefix.slice(0, line.index).trimEnd();
		}
	}
	return comments.join('\n');
}
export function routines(source: SourceRow[]): Routine[] {
	const output: Routine[] = [];
	for (const type of new Set(source.map(s => s.type))) {
		const rows = source.filter(s => s.type === type), text = rows.map(s => s.text.replace(/\n$/, '')).join('\n');
		const clean = mask(text), tokens: Token[] = [...clean.matchAll(/[A-Za-z][\w$#]*|:=|[^\s]/g)].map(m => ({ value: m[0].toUpperCase(), start: m.index, end: m.index + m[0].length }));
		const lineAt = (offset: number) => rows[text.slice(0, offset).split('\n').length - 1]?.line ?? rows.at(-1)?.line ?? 0;
		function parse(start: number): { next: number; routine: Routine } | null {
			const name = tokens[start + 1]; if (!name || !/^[A-Z][\w$#]*$/.test(name.value)) return null;
			let depth = 0, headerEnd = start + 2;
			for (; headerEnd < tokens.length; headerEnd++) {
				const v = tokens[headerEnd]!.value;
				if (!depth && [';', 'IS', 'AS'].includes(v)) break;
				if (v === '(') depth++; if (v === ')') depth--;
			}
			if (headerEnd === tokens.length) return null;
			const header = text.slice(tokens[start]!.start, tokens[headerEnd]!.start).trim();
			const comments = commentsBefore(text.slice(0, tokens[start]!.start));
			const routine: Routine = { type, name: name.value, declaration: header + ';', comments, parameters: parameters(header), range: null, rows: [] };
			if (tokens[headerEnd]!.value === ';') return { next: headerEnd + 1, routine };
			const blocks: string[] = [], nested: [number, number][] = [];
			let began = false;
			for (let i = headerEnd + 1; i < tokens.length; i++) {
				const v = tokens[i]!.value;
				if (v === 'PROCEDURE' || v === 'FUNCTION') {
					const child = parse(i); if (!child) return { next: tokens.length, routine };
					nested.push([tokens[i]!.start, tokens[child.next - 1]!.end]); i = child.next - 1; continue;
				}
				if (['BEGIN', 'IF', 'LOOP', 'CASE'].includes(v)) { blocks.push(v); if (v === 'BEGIN') began = true; continue; }
				if (v !== 'END') continue;
				const next = tokens[i + 1]?.value;
				const expected = next && ['IF', 'LOOP', 'CASE'].includes(next) ? next : undefined;
				const closed = blocks.pop();
				if (!closed || (expected && closed !== expected)) return { next: tokens.length, routine };
				if (expected) i++;
				if (began && !blocks.length) {
					let end = i + 1;
					if (tokens[end]?.value === name.value) end++;
					if (tokens[end]?.value !== ';') return { next: tokens.length, routine };
					const beginOffset = tokens[start]!.start, endOffset = tokens[end]!.end;
					routine.range = { type, startLine: lineAt(beginOffset), endLine: lineAt(endOffset - 1), heuristic: true };
					// Nested local routine SQL must not be attributed to its enclosing routine.
					let body = text.slice(beginOffset, endOffset);
					for (const [a, b] of nested.reverse()) body = body.slice(0, a - beginOffset) + body.slice(a - beginOffset, b - beginOffset).replace(/[^\n]/g, ' ') + body.slice(b - beginOffset);
					routine.rows = [{ type, line: routine.range.startLine, text: body }];
					return { next: end + 1, routine };
				}
			}
			return { next: tokens.length, routine };
		}
		for (let i = 0; i < tokens.length; i++) {
			if (!['PROCEDURE', 'FUNCTION'].includes(tokens[i]!.value)) continue;
			const parsed = parse(i); if (parsed) { output.push(parsed.routine); i = parsed.next - 1; }
		}
	}
	return output;
}
const normalizedType = (s: string) => s.replace(/\s+/g, '').replace(/PLS_INTEGER/g, 'BINARY_INTEGER');
/** Never guess between overloads with indistinguishable dictionary signatures. */
export function matchRoutine(candidates: Routine[], name: string, args: ArgumentRow[], allowSingle = false): Routine | undefined {
	const named = candidates.filter(r => r.name === name), actual = args.filter(a => a.level === 0 && a.position > 0);
	const matches = named.filter(r => r.parameters.length === actual.length && r.parameters.every((p, i) => p.name === actual[i]?.name && normalizedType(p.type) === normalizedType(actual[i]!.type)));
	if (matches.length === 1) return matches[0];
	return allowSingle && named.length === 1 && named[0]!.parameters.length === actual.length && named[0]!.parameters.every((p, i) => p.name === actual[i]?.name) ? named[0] : undefined;
}
