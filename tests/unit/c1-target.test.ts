import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateTarget } from '../../src/config/targets.js';
it('packages the dedicated C1 PDB with a local diagnostic identity', () => {
	const target = JSON.parse(readFileSync('config/targets.json', 'utf8')).targets.find((t: { name: string }) => t.name === 'c1-19c-pdb');
	validateTarget(target);
	expect(target).toMatchObject({ host: 'localhost', port: 1524, serviceName: 'PIPDB1', username: 'PIAGENT_RO', passwordFile: 'c1_piagent_ro.pw', defaultSchema: 'SHOPAPP', environment: 'production-like' });
	expect(target?.description).toMatch(/ARCHIVELOG.*RMAN/);
});
it('restricts the seed runner to the C1 container and PDB', () => {
	const runner = readFileSync('lab/c1/seed.sh', 'utf8');
	expect(runner).toContain("'oracle19c-cdb'");
	expect(runner).toContain('alter session set container=PIPDB1');
	expect(runner).toContain("pathlib.Path('docs/grants-template-pdb.sql')");
	expect(runner).not.toContain('SELECT_CATALOG_ROLE');
});
