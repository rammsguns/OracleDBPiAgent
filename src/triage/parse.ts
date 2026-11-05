import { commonWords } from './words.js';
import { redactCredentials as redact } from './redact.js';
export interface Frame { owner?: string; name?: string; line: number }
const id = '[A-Z][A-Z0-9_$#]{0,127}';
export function parseIssue(text: string) {
	const upper = text.toUpperCase();
	const frames: Frame[] = [...upper.matchAll(new RegExp(`ORA-06512:\\s*AT\\s+(?:"(${id})\\.(${id})"\\s*,\\s*)?LINE\\s+(\\d+)`, 'g'))].slice(0, 32).map(m => ({ ...(m[1] ? { owner: m[1], name: m[2] } : {}), line: Number(m[3]) }));
	return { text: redact(text), codes: [...new Set(upper.match(/\b(?:(?:ORA|TNS)-\d{5}|PLS-\d{3,5})\b/g) ?? [])], frames,
		objects: [...new Set(upper.match(new RegExp(`(?<![A-Z0-9_$#.])${id}\\.${id}(?![A-Z0-9_$#])`, 'g')) ?? [])].slice(0, 32),
		jobs: [...new Set([...(upper.match(new RegExp(`\\b${id}(?:JOB|_JOB)\\b`, 'g')) ?? []), ...[...upper.matchAll(new RegExp(`\\bJOB\\s+[\"']?(${id})(?![A-Z0-9_$#.])`, 'g'))].map(m => m[1]!)])].filter(name => !commonWords.has(name)).slice(0, 16),
		unqualifiedObjects: [...new Set([...upper.matchAll(new RegExp(`\\b(?:PACKAGE|PROCEDURE|FUNCTION|TRIGGER|OBJECT)\\s+[\"']?(${id})(?![A-Z0-9_$#.])`, 'g'))].map(m => m[1]!))].filter(name => !commonWords.has(name)).slice(0, 16),
		times: [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?\b|\b\d{2}:\d{2}(?::\d{2})?\b/g) ?? [])] };
}
export function sinceHours(value = '24h'): number {
	const match = /^(\d+)([mhd])$/.exec(value);
	const hours = match ? Number(match[1]) * ({ m: 1 / 60, h: 1, d: 24 }[match[2]!]!) : NaN;
	if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) throw new Error('--since must be a positive duration (m/h/d), at most 30d');
	return hours;
}
