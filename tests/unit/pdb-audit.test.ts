import { it, expect, vi } from 'vitest';
import type { OracleSession, ToolContext } from '../../src/contracts.js';
import { readSpaceUsage, renderSpaceMarkdown } from '../../src/space/index.js';
import { generateReport } from '../../src/report/index.js';

function session(isCdb = true, containerName: string | undefined = 'SALES'): OracleSession {
	return { target: { name: 'lab' }, identity: { isCdb, containerName }, query: vi.fn().mockResolvedValue({ columns: [], rows: [], truncated: false, elapsedMs: 0 }), close: vi.fn() } as unknown as OracleSession;
}
it.each(['SALES', undefined])('shows CDB infrastructure without empty-row findings in PDB %s, including older identities', async name => {
	const s = session(true, name);
	const result = await readSpaceUsage(s, { sections: ['undo', 'redo', 'recovery'] });
	expect(s.query).toHaveBeenCalled();
	expect(result.findings).toEqual([]);
	expect(result.status).toBe('partial');
	expect(renderSpaceMarkdown(result)).toContain('CDB-wide (shared by all PDBs in this CDB)');
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

import { SQL as spaceSql } from '../../src/space/sql.js';
import { readPdbOverview } from '../../src/tools/overview.js';
it.each(['TRUE', 'FALSE'])('labels undo according to LOCAL_UNDO_ENABLED=%s and retains data', async mode => {
	const s = session();
	vi.mocked(s.query).mockImplementation(async sql => ({ columns: [], rows: sql===spaceSql.localUndo?[[mode]]:sql===spaceSql.undo?[[300,1,0,10,20]]:sql===spaceSql.redo?[[1,1,1024,1,'CURRENT','NO']]:sql===spaceSql.recovery?[['/fra',100,90,0,1]]:[], truncated: false, elapsedMs: 0 }));
	const result = await readSpaceUsage(s, { sections: ['undo','redo','recovery'] });
	expect(result.sections.undo.note).toContain(mode==='TRUE'?'PDB-local (local undo)':'CDB-wide (shared undo');
	expect(result.sections.undo.rows.length).toBeGreaterThan(0);
	expect(result.sections.redo.rows).toHaveLength(1);
	expect(result.sections.recovery.rows).toHaveLength(1);
	expect(result.sections.redo.note).toContain('CDB-wide');
	expect(result.findings.find(f=>f.id==='undo-01555')?.detail).toContain(mode==='TRUE'?'PDB-local':'CDB-wide');
});
it.each(['ORA-00942','ORA-01031','ORA-65040'])('retains undo evidence with unknown scope on %s', async code => {
	const s=session();
	vi.mocked(s.query).mockImplementation(async sql=> { if(sql===spaceSql.localUndo) throw new Error(code); return {columns:[],rows:sql===spaceSql.undo?[[300,1,1,10,20]]:[],truncated:false,elapsedMs:0}; });
	const result=await readSpaceUsage(s,{sections:['undo','redo']});
	expect(result.sections.undo.status).toBe('unavailable');
	expect(result.sections.undo.note).toContain('Undo scope unknown');
	expect(result.sections.undo.rows.length).toBeGreaterThan(0);
	expect(result.findings).toEqual([]);
});
it.each(['ORA-00942','ORA-01031','ORA-65040'])('overview loses only inaccessible view facts on %s', async code=> {
	const s=session();
	vi.mocked(s.query).mockImplementation(async sql=> { if(sql.includes('v$sga')) throw new Error(code); return {columns:[],rows:sql.includes('v$pgastat')?[[42]]:[],truncated:false,elapsedMs:0}; });
	const result=await readPdbOverview(s,context(s));
	expect(result.rows[0]?.[8]).toBeNull();
	expect(result.rows[0]?.[9]).toBe(42);
	expect(result.rows[0]?.[10]).toBe('SALES');
	expect(result.sourceNote).toContain(`V$SGA: not available in this PDB / not granted (${code})`);
	expect(result.scopes.sga).toContain('CDB-wide');
});
it('keeps non-CDB space JSON and Markdown byte-identical to legacy identities', async ()=> {
	const legacy=session(false), current=session(false);
	Object.assign(legacy,{identity:undefined});
	const left=await readSpaceUsage(legacy),right=await readSpaceUsage(current);
	right.capturedAt=left.capturedAt;
	expect(JSON.stringify(right)).toBe(JSON.stringify(left));
	expect(renderSpaceMarkdown(right)).toBe(renderSpaceMarkdown(left));
	expect(vi.mocked(current.query).mock.calls.map(c=>c[0])).not.toContain(spaceSql.localUndo);
});
