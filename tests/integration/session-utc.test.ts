import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readIncidents } from '../../src/alertlog/index.js';
import { boundedResult } from '../../src/tools/index.js';

for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
	it(`UTC session, thin Date binds/fetches and wall clocks: ${target}`, async context => {
		if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
		const config = loadConfig();
		const provider = createSessionProvider(config);
		try {
			let session;
			try { session = await provider.get(target); }
			catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
			const zone = await session.query("SELECT SESSIONTIMEZONE, TO_CHAR(CURRENT_TIMESTAMP, 'TZH:TZM') FROM dual");
			expect(zone.rows).toEqual([['+00:00', '+00:00']]);
			// DATE/plain TIMESTAMP use client-local wall clocks even with a UTC session.
			const wall = new Date(2026, 9, 6, 4, 30, 56, 298);
			const result = await session.query(`SELECT
				CAST(:wall AS TIMESTAMP) B,
				DATE '2026-10-06' D,
				TIMESTAMP '2026-10-06 04:30:56.298' T,
				TO_TIMESTAMP_TZ(:instant, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') TZ,
				CAST(TO_TIMESTAMP_TZ(:instant, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AS TIMESTAMP WITH LOCAL TIME ZONE) LTZ
				FROM dual`, { wall, instant: '2026-10-06T04:30:56.298+00:00' });
			const row = result.rows[0] as Date[];
			expect(row[0]!.getTime()).toBe(Date.parse('2026-10-06T04:30:56.298Z'));
			expect(row[1]!.getTime()).toBe(Date.parse('2026-10-06T00:00:00Z'));
			expect(row[2]!.getTime()).toBe(Date.parse('2026-10-06T04:30:56.298Z'));
			for (const index of [3, 4]) expect(row[index]!.toISOString()).toBe('2026-10-06T04:30:56.298Z');
			expect(boundedResult(result, 16000).content[0]!.text.split('\n')[1]).toBe(
				'2026-10-06T04:30:56.298Z | 2026-10-06T00:00:00.000Z | 2026-10-06T04:30:56.298Z | 2026-10-06T04:30:56.298Z | 2026-10-06T04:30:56.298Z');
			if (target === 'd1-19c-lab') {
				const bare = await session.query(`SELECT incident_id FROM v$diag_incident
					WHERE create_time >= TIMESTAMP '2026-10-06 00:00:00'
					AND create_time < TIMESTAMP '2026-11-04 00:00:00' ORDER BY incident_id`);
				const utc = await session.query(`SELECT incident_id FROM v$diag_incident
					WHERE create_time >= TO_TIMESTAMP_TZ('2026-10-06 00:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM')
					AND create_time < TO_TIMESTAMP_TZ('2026-11-04 00:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM') ORDER BY incident_id`);
				expect(bare.rows).toEqual(utc.rows);
				expect(bare.rows).toHaveLength(6);
				expect(bare.truncated).toBe(false);
				const incidents = await readIncidents({ config, sessions: provider, audit: { record: async () => {} }, runId: 'session-utc' },
					target, { from: '2026-10-06T00:00:00Z', to: '2026-11-04T00:00:00Z', limit: 100 });
				expect(incidents.status).toBe('ok');
				expect(incidents.rows.map(row => Number(row.incidentId)).sort((a, b) => a - b))
					.toEqual(bare.rows.map(row => Number(row[0])).sort((a, b) => a - b));
			}
		} finally { await provider.closeAll(); }
	}, 30000);
}
