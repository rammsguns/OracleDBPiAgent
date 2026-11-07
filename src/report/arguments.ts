import { reportQueries } from './queries.js';
export const sectionNames = [...reportQueries.map(q => q.name), 'security', 'sessions', 'space', 'backup', 'jobs'];
export class ReportSectionUsageError extends Error {
	constructor(section: string) {
		// Suppress arbitrary paths, control characters and other unsafe input.
		const name = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(section) ? ` ${section}` : '';
		super(`Unknown report section${name}; valid sections: ${sectionNames.join(', ')}`);
		this.name = 'ReportSectionUsageError';
	}
}
export function validateReportSections(sections?: readonly string[]): void {
	const unknown = sections?.find(name => !sectionNames.includes(name));
	if (unknown !== undefined) throw new ReportSectionUsageError(unknown);
}
