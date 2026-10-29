import { diff } from '../report/diff.js';
import type { DatabaseReport, ReportSection } from '../report/index.js';

/** Add display values without changing the shared deterministic diff contract. */
export function webReportDiff(previous: DatabaseReport | null, current: DatabaseReport) {
	const result = diff(previous, current);
	return { ...result, changes: result.changes.map(change => {
		const before = previous?.sections.find(s => s.name === change.section);
		const after = current.sections.find(s => s.name === change.section);
		const value = (section: ReportSection | undefined): string => {
			if (!section) return 'Not present';
			if (change.rule === 'availability') return section.status;
			if (change.rule === 'backup_not_recent') return section === before ? 'Recent completed backup' : 'No recent completed backup';
			const fields = change.section === 'tablespaces' ? ['TABLESPACE_NAME'] : change.section === 'top_sql' ? ['SQL_ID'] : change.section === 'scheduler_failures' ? ['OWNER', 'JOB_NAME', 'LOG_DATE'] : change.section === 'optimizer_stats' ? ['OWNER', 'TABLE_NAME'] : [change.section === 'index_health' ? 'OWNER' : 'INDEX_OWNER', 'INDEX_NAME', ...(change.section !== 'index_health' ? ['PARTITION_NAME'] : []), ...(change.section === 'index_subpartitions' ? ['SUBPARTITION_NAME'] : [])];
			const columns = section.columns.map(c => c.toUpperCase());
			const row = section.rows.find(row => {
				const values = fields.map(f => row[columns.indexOf(f)]).map(value => value instanceof Date ? value.toISOString() : value);
				return change.section === 'tablespaces' ? String(values[0]) === change.key : JSON.stringify(values) === change.key;
			});
			return row ? section.columns.map((c, i) => `${c}: ${String(row[i])}`).join(', ') : 'Not present';
		};
		return { ...change, before: value(before), after: value(after) };
	}) };
}
