import { readdir, readFile, writeFile } from 'node:fs/promises';
import { groundTruth, targets } from '../evals/ground-truth.js';
import { groundTruth as before } from '../tests/fixtures/wp21b/truth-before.js';
const configured = await targets(); const records = [];
for (const directory of ['evals/cases', 'evals/cases-hard']) {
	for (const file of (await readdir(directory)).filter(f=>f.endsWith('.json')).sort()) {
		for (const test of JSON.parse(await readFile(`${directory}/${file}`,'utf8'))) {
			if (!test.groundTruth) continue;
			const target = configured.find(t=>t.name === test.target)!;
			console.log(test.id);
			const a = await before(target,test.groundTruth.sql,test.groundTruth.setupSql);
			const b = await groundTruth(target,test.groundTruth.sql,test.groundTruth.setupSql);
			records.push({id:test.id,before:a,after:b,equal:JSON.stringify(a)===JSON.stringify(b)});
		}
	}
}
await writeFile('docs/wp-21b-truth-replay.json',JSON.stringify(records,null,'\t')+'\n');
console.log(JSON.stringify({queries:records.length,changes:records.filter(r=>!r.equal)}));
