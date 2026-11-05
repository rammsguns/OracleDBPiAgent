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
			const incidents = await readIncidents(ctx, target.name, options);
			if (incidents.status !== 'ok' || incidents.truncated) throw new Error(`Unavailable or capped incident evidence on ${target.name}`);
			for (const test of cases.filter(test => test.target === target.name)) {
				const rows = await groundTruth(target, test.groundTruth!.sql);
				if (!rows.length || rows.length >= 100 || rows.some(row => row.some(cell => cell == null || cell === ''))) throw new Error(`Missing or capped challenge truth: ${test.id}`);
				if (test.id.endsWith('incident-count')) {
					const counts = new Map<string, number>();
					for (const incident of incidents.rows as IncidentRow[]) counts.set(incident.problemKey, (counts.get(incident.problemKey) ?? 0) + 1);
					const expected = [...counts].sort(([a], [b]) => a.localeCompare(b));
					if (JSON.stringify(rows) !== JSON.stringify(expected)) throw new Error(`API/count mismatch: ${test.id}`);
				} else if (test.id.endsWith('critical-incident')) {
					const alerts = await readAlertLog(ctx, target.name, { ...options, level: 1, limit: 1 });
					const alert: AlertRow | undefined = alerts.rows[0];
					if (alerts.status !== 'ok' || rows[0]![0] !== alert?.codes[0] || String(rows[0]![1]) !== alert?.incidentId) throw new Error(`API/critical alert mismatch: ${test.id}`);
				} else if (test.id.endsWith('failed-job')) {
					const alerts = await readAlertLog(ctx, target.name, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z', codes: ['ORA-12012'], level: 'all', limit: 100 });
					if (alerts.status !== 'ok' || alerts.truncated) throw new Error('Unavailable or capped job alert evidence');
					for (const row of rows) if (!alerts.rows.some(alert => alert.messageText.replace(/"/g, '').includes(String(row[0])) && alert.messageText.includes(String(row[1])))) throw new Error('API/job evidence mismatch');
				} else {
					// Independent raw-message scan: API folding merges repeated messages and is
					// deliberately unsuitable for whole-window frequency counts.
					const counts = new Map<string, number>();
					for (let offset = 0; ; offset += 99) {
						if (offset > 100000) throw new Error('Frequency scan safety cap reached');
						const messages = await groundTruth(target, `SELECT MESSAGE_TEXT FROM V$DIAG_ALERT_EXT WHERE ORIGINATING_TIMESTAMP >= TO_TIMESTAMP_TZ('2026-10-06 00:00:00 +00:00','YYYY-MM-DD HH24:MI:SS TZH:TZM') AND ORIGINATING_TIMESTAMP < TO_TIMESTAMP_TZ('2026-11-04 00:00:00 +00:00','YYYY-MM-DD HH24:MI:SS TZH:TZM') AND REGEXP_LIKE(UPPER(MESSAGE_TEXT),'ORA-[0-9]{1,5}([^0-9]|$)') ORDER BY ORIGINATING_TIMESTAMP, RECORD_ID OFFSET ${offset} ROWS FETCH NEXT 99 ROWS ONLY`);
						for (const [text] of messages) {
							const digits = /ORA-(\d{1,5})(?!\d)/i.exec(String(text))?.[1];
							if (digits && Number(digits)) { const code = `ORA-${digits.padStart(5, '0')}`; counts.set(code, (counts.get(code) ?? 0) + 1); }
						}
						if (messages.length < 99) break;
					}
					const max = Math.max(...counts.values()), expected = [...counts].filter(([, n]) => n === max).map(([code]) => [code]).sort();
					if (JSON.stringify(rows) !== JSON.stringify(expected)) throw new Error(`Frequency mismatch: ${test.id}`);
				}
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
