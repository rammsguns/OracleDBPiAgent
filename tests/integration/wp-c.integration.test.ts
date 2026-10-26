import { afterAll, describe, expect, it, vi } from 'vitest';
import { access } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { productModule, DependencyUnavailable, requireStrata, runtime } from '../../evals/runtime.js';
import { targets } from '../../evals/ground-truth.js';
import type { AppConfig, SessionProvider } from '../../src/contracts.js';

async function available(host: string, port: number) {
	return new Promise<boolean>(resolve => {
		const socket = createConnection({ host, port });
		const finish = (ok: boolean) => { socket.destroy(); resolve(ok); };
		socket.setTimeout(2000, () => finish(false));
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
	});
}
async function dependencies(ctx: { skip: (message: string) => never }, port: number, passwordFile: string) {
	if (!process.env.PIAGENT_SECRET_DIR) ctx.skip('PIAGENT_SECRET_DIR unset; real DB credentials unavailable');
	try { await access(`${process.env.PIAGENT_SECRET_DIR}/${passwordFile}`); }
	catch { ctx.skip('Required secret file unavailable'); }
	if (!await available('localhost', port)) ctx.skip(`Oracle listener localhost:${port} unavailable`);
	try {
		const configModule = await productModule('src/config/index.ts');
		const oracleModule = await productModule('src/oracle/index.ts');
		return { config: await configModule.loadConfig(process.env) as AppConfig, oracleModule };
	} catch (error) {
		if (error instanceof DependencyUnavailable) ctx.skip(error.message);
		throw error;
	}
}
const providers: SessionProvider[] = [];
afterAll(async () => { for (const provider of providers) await provider.closeAll(); });

describe('WP-C real Oracle gates and policy', () => {
	for (const name of ['d1-19c-lab', 'p1-19c-prod']) {
		it(`accepts 19c and rejects INSERT before driver execution: ${name}`, async ctx => {
			const target = (await targets()).find(target => target.name === name)!;
			const { config, oracleModule } = await dependencies(ctx, target.port, target.passwordFile);
			const moduleName = 'oracledb';
			const oracle = (await import(moduleName)).default;
			const original = oracle.getConnection.bind(oracle);
			let attemptedWrite = false;
			// Safety tripwire: even a broken policy cannot send test INSERT to Oracle.
			const spy = vi.spyOn(oracle, 'getConnection').mockImplementation(async (...args: unknown[]) => {
				const connection = await original(...args);
				const execute = connection.execute.bind(connection);
				connection.execute = (sql: string, ...rest: unknown[]) => {
					if (/\bINSERT\b/i.test(sql)) { attemptedWrite = true; throw new Error('Safety tripwire: INSERT reached driver boundary'); }
					return execute(sql, ...rest);
				};
				return connection;
			});
			try {
				const provider: SessionProvider = await oracleModule.createSessionProvider(config);
				providers.push(provider);
				const session = await provider.get(name);
				expect(session.identity.versionFull).toMatch(/^19\./);
				expect((await session.query('SELECT 1 FROM DUAL')).rows).toEqual([[1]]);
				await expect(session.query('INSERT INTO WP_C_POLICY_SENTINEL (ID) VALUES (1)')).rejects.toMatchObject({ name: 'StatementRejectedError' });
				expect(attemptedWrite).toBe(false);
			} finally { spy.mockRestore(); }
		}, 30000);
	}
	it('refuses localhost:1521/FREEPDB1 as unsupported before any application query', async ctx => {
		const { config, oracleModule } = await dependencies(ctx, 1521, 'd2_lab.pw');
		const lab = config.targets.find(target => target.name === 'd1-19c-lab')!;
		// Sole permitted non-19c connection: never add this target to product config.
		const gateTarget = { ...lab, name: 'gate-only-non19c', host: 'localhost', port: 1521, serviceName: 'FREEPDB1', username: 'HARNESS_LAB', passwordFile: 'd2_lab.pw' };
		const provider: SessionProvider = await oracleModule.createSessionProvider({ ...config, targets: [gateTarget], defaultTarget: gateTarget.name }, [gateTarget]);
		providers.push(provider);
		await expect(provider.get(gateTarget.name)).rejects.toMatchObject({ name: 'UnsupportedVersionError' });
	}, 30000);
	it('answers one end-to-end ask through local Strata with real tool evidence', async ctx => {
		await dependencies(ctx, 1522, 'd1_lab.pw');
		try { await requireStrata(); }
		catch (error) { if (error instanceof DependencyUnavailable) ctx.skip(error.message); throw error; }
		let app;
		try { app = await runtime(); }
		catch (error) { if (error instanceof DependencyUnavailable) ctx.skip(error.message); throw error; }
		providers.push(app.sessions);
		const result = await app.ask('Use run_query to SELECT 42 AS ANSWER FROM DUAL and report the value with tool evidence.', 'd1-19c-lab');
		expect(result.answer).toMatch(/\b42\b/);
		expect(result.toolCalls).toContain('run_query');
	}, 300000);
});
