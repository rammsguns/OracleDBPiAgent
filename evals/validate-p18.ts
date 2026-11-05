import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { createSessionProvider } from '../src/oracle/index.js';
import { readAlertLog, readIncidents, type AlertRow, type IncidentRow } from '../src/alertlog/index.js';
import { groundTruth } from './ground-truth.js';
import { loadHardCases } from './validate-hard.js';

/** No agent/provider/health calls: independent runtime SQL checked against 18A's API. */
export async function validateP18() {
	const cases = (await loadHardCases()).filter(test => test.id.startsWith('hard-p18-'));
	if (cases.length !== 6) throw new Error('Expected six p18 cases');
	const config = loadConfig(), sessions = createSessionProvider(config), records = [];
	const options = { from: '2026-10-06T00:00:00Z', to: '2026-11-04T00:00:00Z', limit: 100 };
	try {
		for (const target of config.targets) {
			const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'p18-ground-truth' };
			const alerts = await readAlertLog(ctx, target.name, { ...options, text: 'ORA-', level: 'all' });
			const incidents = await readIncidents(ctx, target.name, options);
			if (alerts.status !== 'ok' || incidents.status !== 'ok' || incidents.truncated) throw new Error(`Unavailable or capped incident evidence on ${target.name}`);
			const alert: AlertRow | undefined = alerts.rows[0];
			const incident: IncidentRow | undefined = incidents.rows[0];
			if (!alert?.codes.length || !incident?.problemKey) throw new Error(`Missing challenge evidence on ${target.name}`);
			for (const test of cases.filter(test => test.target === target.name)) {
				const rows = await groundTruth(target, test.groundTruth!.sql);
				const expected = test.id.endsWith('latest-code') ? [[alert.codes[0]]] : test.id.endsWith('incident-count') ? [[incidents.rows.length]] : [[incident.incidentId, incident.problemKey]];
				if (JSON.stringify(rows.map(row => row.map(String))) !== JSON.stringify(expected.map(row => row.map(String)))) throw new Error(`API/SQL truth mismatch: ${test.id}: ${JSON.stringify({rows, expected})}`);
				records.push({ id: test.id, target: target.name, sql: test.groundTruth!.sql, mode: test.groundTruth!.mode, rows });
			}
		}
	} finally { await sessions.closeAll(); }
	return { validatedAt: new Date().toISOString(), caseCount: cases.length, records };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateP18();
	await writeFile(new URL('./p18-ground-truth-validation.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(`Validated ${report.caseCount} p18 runtime SQL truths against readAlertLog/readIncidents; no LLM calls.`);
}
