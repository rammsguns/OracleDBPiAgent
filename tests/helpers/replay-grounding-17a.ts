import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkFacts as newCheck } from '../../src/agent/grounding.js';

const baseline = process.argv[2];
if (!baseline) throw new Error('Pass the absolute path to the baseline grounding.ts');
const { checkFacts: oldCheck } = await import(pathToFileURL(baseline).href) as typeof import('../../src/agent/grounding.js');
const root = process.argv[3];
if (!root) throw new Error('Pass the absolute archive root path');
let checked = 0, files = 0;
const changes: unknown[] = [];
function walk(dir: string) {
	for (const item of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, item.name);
		if (item.isDirectory()) {
			walk(path);
			continue;
		}
		if (!item.name.endsWith('.json')) continue;
		let data;
		try {
			data = JSON.parse(readFileSync(path, 'utf8'));
		} catch {
			continue;
		}
		let used = false;
		for (const record of data.records ?? []) {
			if (!Array.isArray(record.toolResultTexts) || typeof record.answer !== 'string') continue;
			checked++; used = true;
			const before = oldCheck(record.answer, record.toolResultTexts).unsupportedNumbers;
			const after = newCheck(record.answer, record.toolResultTexts).unsupportedNumbers;
			if (JSON.stringify(before) === JSON.stringify(after)) continue;
			const removed = before.filter(n => !after.includes(n));
			// Collect candidate source texts for manual review; numeric support itself
			// is decided by checkFacts, not by this substring search.
			const evidence = removed.map(number => ({
				number,
				texts: record.toolResultTexts.filter((text: string) =>
					text.includes(number.replace(/,/g, '').replace(/^[-+]/, ''))),
			}));
			if (evidence.some(e => e.texts.length === 0)) throw new Error('Missing evidence: ' + path);
			changes.push({ file: relative(root, path), id: record.id, iteration: record.iteration, before, after, evidence });
		}
		if (used) files++;
	}
}
walk(root);
writeFileSync(process.argv[4] ?? '/tmp/replay-17a.json', JSON.stringify({ checked, files, changes }, null, '\t'));
console.log(JSON.stringify({ checked, files, changed: changes.length }));
