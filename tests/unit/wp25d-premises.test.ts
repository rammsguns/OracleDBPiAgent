import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases, verifyUnavailable } from '../../evals/validate-hard.js';

it('freezes the previous premises and checksums the deliberate replacements', () => {
	const hashes: Record<string, string> = {
		'tests/fixtures/wp25d-previous-premises.json': 'c30a1722855c621ad31aa2e7994191aa29ddbc71f04beeaea15a81b686f60cb0',
		'evals/cases-hard/phase5-grant-limited-p1.json': 'e6549633a3cd880f46ec4cc0d08153fb9a013486d6dee4a4b48cc57e8de297c4',
		'evals/cases-hard/phase8-grant-limited-p1.json': 'e6cfe86f67de848d4e8fd0fbe166d4c4e4b3e2eb08fc06f50bc717cf6d2a9895',
		'evals/cases-hard/phase11b-challenge.json': 'dad646ec26e106d5190aaf255c69a29481374eb2635c534bf7e7545b627b65b8',
		'evals/cases-hard/phase25-blind-holdout.json': 'c56077c1eef265e455082161103798377a48adf62b4023068be4aa8f1812e47f',
	};
	for (const [file, hash] of Object.entries(hashes)) expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(hash);
});

it('moves exposed archive access to dev and retains blind access coverage outside future grants', async () => {
	const cases = await loadHardCases();
	expect(cases.find(test => test.id === 'hard-p8-archive-access')?.split).toBe('dev');
	expect(cases.find(test => test.id === 'hard-p25-grant-component-inventory')?.split).toBe('holdout');
	for (const test of cases.filter(test => ['grant-limited-p1', 'partial-grants'].includes(test.category))) {
		expect(JSON.stringify(test)).not.toMatch(/RMAN_BACKUP|ARCHIVED_LOG|LOG_HISTORY|DBA_SCHEDULER_JOB_LOG|DBA_SCHEDULER_WINDOWS|DBA_AUTOTASK_|DBA_OPTSTAT_OPERATIONS|DBA_INDEXES|DBA_IND_PARTITIONS|V\$SYSSTAT|V\$OSSTAT|V\$SESSTAT|V\$STATNAME/i);
	}
});

it('does not confuse an outage or readable view with a missing grant', async () => {
	await expect(verifyUnavailable(async () => { throw { code: 'ORA-00942' }; })).resolves.toBeUndefined();
	await expect(verifyUnavailable(async () => { throw { code: 'ORA-01031' }; })).resolves.toBeUndefined();
	await expect(verifyUnavailable(async () => { throw new Error('network'); })).rejects.toThrow('network');
	await expect(verifyUnavailable(async () => [])).rejects.toThrow('now readable');
});
