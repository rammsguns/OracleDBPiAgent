import { it, expect, vi } from 'vitest';
import type { OracleSession, ToolContext } from '../../src/contracts.js';
import { readSpaceUsage, renderSpaceMarkdown } from '../../src/space/index.js';
import { generateReport } from '../../src/report/index.js';

function session(isCdb = true, containerName: string | undefined = 'SALES'): OracleSession {
	return { target: { name: 'lab' }, identity: { isCdb, containerName }, query: vi.fn().mockResolvedValue({ columns: [], rows: [], truncated: false, elapsedMs: 0 }), close: vi.fn() } as unknown as OracleSession;
}
it.each(['SALES', undefined])('withholds CDB infrastructure findings in PDB %s, including older identities', async name => {
	const s = session(true, name);
	const result = await readSpaceUsage(s, { sections: ['undo', 'redo', 'recovery'] });
	expect(s.query).not.toHaveBeenCalled();
	expect(result.findings).toEqual([]);
	expect(result.status).toBe('failed');
	expect(renderSpaceMarkdown(result)).toContain('Not available in a PDB');
});
it('preserves non-CDB empty recovery behavior', async () => {
	const result = await readSpaceUsage(session(false), { sections: ['recovery'] });
	expect(result.sections.recovery.note).toBe('no recovery area configured');
});
function context(s: OracleSession): ToolContext {
	return { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'APP' }], limits: { maxRows: 100, statementTimeoutSeconds: 10 } }, sessions: { get: async () => s }, audit: { record: async () => {} }, runId: 'pdb-test' } as unknown as ToolContext;
}
it('labels CDB-wide report evidence and reports the PDB container', async () => {
	const result = await generateReport(context(session()), { sections: ['archive_switches'] });
	expect(result.sections[0]?.note).toContain('CDB-wide');
	expect(result.sections[0]?.note).toContain('Container: SALES');
});
it.each(['ORA-00942', 'ORA-01031', 'ORA-65040'])('isolates %s from remaining report sections', async code => {
	const s = session(); vi.mocked(s.query).mockRejectedValueOnce(new Error(code));
	const result = await generateReport(context(s), { sections: ['identity', 'parameters'] });
	expect(result.sections.map(s => s.status)).toEqual(['unavailable', 'ok']);
	expect(result.sections[0]?.note).toMatch(/needs SELECT|not available in a PDB/);
});
it('isolates PDB-inapplicable space views', async () => {
	const s = session(); vi.mocked(s.query).mockRejectedValue(new Error('ORA-65040'));
	const result = await readSpaceUsage(s, { sections: ['tablespaces'] });
	expect(result.sections.tablespaces.status).toBe('unavailable');
});

import { readSessionActivity } from '../../src/sessions/index.js';
import { readSecurityPosture } from '../../src/security/index.js';
import { readAlertLog, renderAlertLogMarkdown } from '../../src/alertlog/index.js';
it.each(['ORA-00942', 'ORA-01031', 'ORA-65040'])('degrades PDB sessions, security and ADR on %s', async code => {
	const s = session(); vi.mocked(s.query).mockRejectedValue(new Error(code));
	const activity = await readSessionActivity(s, { sections: ['waits'] });
	expect(activity.sections.waits.status).toBe('unavailable');
	expect(activity.sections.waits.note).toContain('PDB');
	const security = await readSecurityPosture(s, { checks: ['parameters'] });
	expect(security.checks[0]?.status).toBe('unavailable');
	expect(security.checks[0]?.notes.join(' ')).toContain('CDB-wide');
	const alerts = await readAlertLog(context(s), 'lab');
	expect(alerts.status).toBe('unavailable');
	expect(renderAlertLogMarkdown(alerts)).toContain('Current PDB ADR visibility only');
});
