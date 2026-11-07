import { formatBytes } from '../space/index.js';

// Match the jobs/report Markdown cell escaping, including embedded row breaks.
export const cell = (value: unknown): string => (value instanceof Date ? value.toISOString() : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, '<br>');
const byteColumn = (name: string) => /bytes/i.test(name) || ['SPACE_LIMIT', 'SPACE_USED', 'SPACE_RECLAIMABLE'].includes(name);
export function markdownTable(input: object[], limit = 100): string {
	const rows = input as Record<string, unknown>[];
	if (!rows.length) return 'None.';
	const columns = [...new Set(rows.flatMap(Object.keys))];
	return [
		'| ' + columns.map(cell).join(' | ') + ' |',
		'| ' + columns.map(() => '---').join(' | ') + ' |',
		...rows.slice(0, limit).map(row => '| ' + columns.map(key => cell(byteColumn(key) && typeof row[key] === 'number' ? formatBytes(row[key]) : row[key])).join(' | ') + ' |'),
		...(rows.length > limit ? ['', `${rows.length - limit} more rows; use --json`] : []),
	].join('\n');
}
