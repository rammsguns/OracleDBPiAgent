import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkFacts } from '../../src/agent/grounding.js';

// Without owners the checker is the pre-17E baseline. Never infer alignment.
export function ownersFor(record: { toolResultTexts: string[]; toolDetails?: { args: unknown }[] }): (string | undefined)[] {
	if (record.toolDetails?.length !== record.toolResultTexts.length) return [];
	return record.toolDetails.map(detail => {
		let args;
		try { args = typeof detail.args === 'string' ? JSON.parse(detail.args) : detail.args; } catch { return undefined; }
		const owner = typeof args?.schema === 'string' ? args.schema : args?.owner;
		return typeof owner === 'string' ? owner.toUpperCase() : undefined;
	});
}

export function replay(root: string) {
	let checked = 0, files = 0, aligned = 0, changedUnsupportedNumbers = 0;
	const changes: unknown[] = [];
	function walk(dir: string) {
		for (const item of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, item.name);
			if (item.isDirectory()) { walk(path); continue; }
			if (!item.name.endsWith('.json')) continue;
			let data;
			try { data = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
			if (!Array.isArray(data?.records)) continue;
			let used = false;
			for (const record of data.records) {
				if (typeof record.answer !== 'string' || !Array.isArray(record.toolResultTexts)) continue;
				checked++; used = true;
				const owners = ownersFor(record);
				if (owners.some(owner => owner !== undefined)) aligned++;
				const before = checkFacts(record.answer, record.toolResultTexts);
				const after = checkFacts(record.answer, record.toolResultTexts, '', owners);
				if (JSON.stringify(before.unsupportedNumbers) !== JSON.stringify(after.unsupportedNumbers)) changedUnsupportedNumbers++;
				if (JSON.stringify(before.unsupported) !== JSON.stringify(after.unsupported)) {
					changes.push({ file: relative(root, path), id: record.id, iteration: record.iteration,
						before: before.unsupported, after: after.unsupported,
						removed: before.unsupported.filter(fact => !after.unsupported.includes(fact)) });
				}
			}
			if (used) files++;
		}
	}
	walk(root);
	return { checked, files, aligned, changedUnverified: changes.length, changedUnsupportedNumbers, changes };
}

if (process.argv[1]?.endsWith('replay-grounding-17e.ts')) {
	if (!process.argv[2] || !process.argv[3]) throw Error('Usage: tsx tests/helpers/replay-grounding-17e.ts ARCHIVE OUTPUT');
	const result = replay(process.argv[2]);
	writeFileSync(process.argv[3], JSON.stringify(result, null, '\t') + '\n');
	console.log(JSON.stringify({ ...result, changes: undefined }));
	if (result.changedUnsupportedNumbers) process.exitCode = 1;
}
