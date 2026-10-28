import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createDbTools } from '../../src/tools/index.js';

for (const [target, schema, name] of [['d1-19c-lab', 'SH', 'SALES'], ['d1-19c-lab', 'SH', 'CUSTOMERS'], ['p1-19c-prod', 'SHOPAPP', 'ORDERS']]) {
	it(`compact describe preserves dictionary facts: ${target} ${schema}.${name}`, async context => {
		if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
		const config = loadConfig();
		const provider = createSessionProvider(config);
		try {
			let session;
			try { session = await provider.get(target); }
			catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541|ENOENT/.test(String(error))) { context.skip('Oracle dependency unavailable'); return; } throw error; }
			const binds = { owner: schema, name };
			const columns = await session.query('SELECT column_name, data_type, data_length, column_id FROM all_tab_columns WHERE owner=:owner AND table_name=:name', binds);
			const constraints = await session.query("SELECT c.constraint_name, c.constraint_type, c.status, cc.column_name, cc.position FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name AND cc.table_name=c.table_name WHERE c.owner=:owner AND c.table_name=:name AND c.constraint_type IN ('P','R') ORDER BY cc.position", binds);
			const indexes = await session.query('SELECT i.index_name, i.uniqueness, i.status, ic.column_name, ic.column_position FROM all_indexes i JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name WHERE i.table_owner=:owner AND i.table_name=:name ORDER BY ic.column_position', binds);
			await session.close();
			const tool = createDbTools({ config, sessions: provider, audit: { record: async () => {} }, runId: 'compact-describe' }).find(t => t.name === 'describe_object')!;
			const output = await tool.execute('1', { target, schema, name });
			const text = output.content.map(c => c.type === 'text' ? c.text : '').join('\n');
			expect(output.details.truncated).toBe(false);
			expect(columns.rows.length).toBeGreaterThan(0);
			for (const [column, type, length, position] of columns.rows) expect(text).toContain(`${position}|${column}|${type}|${length}`);
			for (const metadata of [constraints, indexes]) {
				expect(metadata.rows.length).toBeGreaterThan(0);
				for (const [parent, type, status, column, position] of metadata.rows) {
					const line = text.split('\n').find(line => line.startsWith(`${parent}|${type}|${status}|`));
					expect(line).toContain(`${position}:${column}`);
				}
			}
			// SH.SALES has foreign keys but no primary key in this read-only fixture.
			if (name !== 'SALES') expect(constraints.rows.some(row => row[1] === 'P')).toBe(true);
			expect(constraints.rows.some(row => row[1] === 'R')).toBe(true);
		} finally { await provider.closeAll(); }
	}, 60000);
}
