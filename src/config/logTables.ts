import type { LogTableConfig } from '../contracts.js';
const simple = /^[A-Z][A-Z0-9_$#]{0,127}$/;
export function validateLogTables(value: unknown): asserts value is LogTableConfig[] {
	if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid logTables configuration');
	for (const entry of value) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(k => !['table', 'timestampColumn', 'columns'].includes(k)) || Object.keys(entry).length !== 3) throw new Error('Invalid logTables entry');
		const { table, timestampColumn, columns } = entry;
		if (typeof table !== 'string' || table.split('.').length !== 2 || !table.split('.').every(s => simple.test(s)) || typeof timestampColumn !== 'string' || !simple.test(timestampColumn) || !Array.isArray(columns) || columns.length < 1 || columns.length > 8 || !columns.every(c => typeof c === 'string' && simple.test(c)) || new Set(columns).size !== columns.length) throw new Error('logTables requires OWNER.TABLE and simple uppercase columns (1–8)');
	}
}
