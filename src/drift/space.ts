import { UnsupportedVersionError, type ToolContext } from '../contracts.js';
import { readAuditedSpace } from '../report/space.js';
import type { SpaceReport } from '../space/index.js';
import { compareEntries, type DriftEntry, type DriftOptions, type DriftResult, type DriftSection } from './index.js';

/** Configuration only: usage, paths, current redo status and group identity are deliberately omitted. */
export function spaceConfiguration(data: SpaceReport, id: 'tablespaces' | 'redo' | 'recovery'): DriftEntry[] {
	if (id === 'tablespaces') return data.sections.tablespaces.rows.map(t => ({ key: t.name, values: [t.contents, t.bigfile, t.maxBytes] })).sort((a, b) => a.key.localeCompare(b.key));
	if (id === 'redo') {
		const sizes = data.sections.redo.rows.filter(r => r.kind === 'Group').map(r => Number(r.bytes)).sort((a, b) => a - b);
		return [{ key: 'groups', values: [sizes.length, sizes] }];
	}
	const area = data.sections.recovery.rows.find(r => r.kind === 'Area');
	return [{ key: 'FRA', values: [!!area, area?.limitBytes ?? 0] }];
}
export async function compareSpace(ctx: ToolContext, options: DriftOptions): Promise<DriftResult> {
	const result: DriftResult = { ...options, generatedAt: new Date().toISOString(), complete: true, hasDrift: false, sections: [] };
	const sides: (SpaceReport | null)[] = [];
	for (const target of [options.left, options.right]) {
		try { sides.push(await readAuditedSpace(ctx, target, { sections: ['tablespaces', 'redo', 'recovery'] }, 'drift:space')); }
		catch (error) { if (error instanceof UnsupportedVersionError) throw error; sides.push(null); }
	}
	for (const id of ['tablespaces', 'redo', 'recovery'] as const) {
		const section: DriftSection = { name: id, source: 'readSpaceUsage', status: 'ok', notes: [], onlyLeft: [], onlyRight: [], different: [] };
		for (const [index, side] of sides.entries()) {
			const data = side?.sections[id];
			if (!data || data.status !== 'ok' || [data.evidence, ...data.supportingEvidence].some(e => e.truncated || e.status !== 'ok')) {
				section.status = 'unavailable'; section.notes.push(`${[options.left, options.right][index]}: space evidence unavailable or incomplete; comparison withheld`);
			}
		}
		if (section.status === 'ok') Object.assign(section, compareEntries(spaceConfiguration(sides[0]!, id), spaceConfiguration(sides[1]!, id)));
		else result.complete = false;
		if (section.onlyLeft.length || section.onlyRight.length || section.different.length) result.hasDrift = true;
		result.sections.push(section);
	}
	return result;
}
