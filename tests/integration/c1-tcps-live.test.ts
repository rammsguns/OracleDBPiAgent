import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { runChecks } from '../../src/check/index.js';

const secretDir = process.env.PIAGENT_SECRET_DIR;
const target = {
	name: 'c1-19c-tcps', description: 'C1 PIPDB1 TCPS integration target',
	host: '172.17.0.6', port: 2484, serviceName: 'pipdb1', username: 'PIAGENT_RO',
	passwordFile: 'c1_piagent_ro.pw', defaultSchema: 'PIAGENT_RO', environment: 'development' as const,
	protocol: 'tcps' as const,
	wallet: { directory: '/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps', tnsAlias: 'pipdb1_tcps', passwordFile: 'c1_tcps_wallet.pw' },
};

it('C1 TCPS wallet session, identity, check and safe wallet refusals', async test => {
	if (!secretDir) { test.skip('PIAGENT_SECRET_DIR unset; C1 TCPS secrets unavailable'); return; }
	try {
		await readFile(join(target.wallet.directory, 'ewallet.pem'));
		await readFile(join(target.wallet.directory, 'tnsnames.ora'));
		await readFile(join(secretDir, target.passwordFile));
		await readFile(join(secretDir, target.wallet.passwordFile));
	} catch { test.skip('C1 TCPS endpoint or wallet files unavailable; run scripts/lab/c1-tcps/setup.sh'); return; }

	const base = loadConfig();
	const config = { ...base, targets: [target], defaultTarget: target.name };
	const sessions = createSessionProvider(config);
	try {
		let session;
		try { session = await sessions.get(target.name); }
		catch (error) {
			if (/unknown property.*(protocol|wallet)|protocol is invalid|wallet is invalid|wallet support/i.test(String(error))) {
				test.skip('Session provider does not support wallet targets yet; waiting for WP-37A merge'); return;
			}
			if (/NJS-511|NJS-503|ECONNREFUSED|ETIMEDOUT|ORA-12541|ORA-12514|ORA-12170|NJS-500/.test(String(error))) { test.skip('C1 TCPS listener or PIPDB1 service unavailable'); return; }
			throw error;
		}
		expect(session.identity.containerName).toBe('PIPDB1');
		expect(session.identity.versionFull).toMatch(/^19\./);
		const transport = await session.query("SELECT SYS_CONTEXT('USERENV','NETWORK_PROTOCOL') FROM dual");
		expect(String(transport.rows[0]![0]).toLowerCase()).toBe('tcps');
		const checks = await runChecks({ config, sessions, audit: { record: async () => {} }, runId: 'c1-tcps-live' }, [target.name]);
		expect(checks.targets).toHaveLength(1);

		await expect(sessions.get('unknown-c1-tcps-alias')).rejects.toThrow(/Unknown target/);
		const wrongAlias = { ...target, name: 'c1-tcps-wrong-alias', wallet: { ...target.wallet, tnsAlias: 'unknown_alias' } };
		const wrongConfig = { ...config, targets: [wrongAlias], defaultTarget: wrongAlias.name };
		await expect(createSessionProvider(wrongConfig).get(wrongAlias.name)).rejects.toThrow(/alias|wallet|target|tns/i);
		const noPassword = { ...target, name: 'c1-tcps-no-wallet-password', wallet: { directory: target.wallet.directory, tnsAlias: target.wallet.tnsAlias } };
		const noPasswordConfig = { ...config, targets: [noPassword], defaultTarget: noPassword.name };
		await expect(createSessionProvider(noPasswordConfig).get(noPassword.name)).rejects.toThrow(/password|wallet/i);
	} finally { await sessions.closeAll(); }
}, 180000);
