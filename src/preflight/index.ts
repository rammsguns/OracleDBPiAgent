import type { SessionProvider } from '../contracts.js';
import { FEATURE_VIEWS } from './views.js';
export async function checkTarget(sessions: SessionProvider, target: string) {
	const session = await sessions.get(target);
	try {
		const views = [];
		const probed = new Map<string, 'readable' | 'missing' | 'not-applicable'>();
		for (const [feature, names] of Object.entries(FEATURE_VIEWS)) for (const view of names) {
			let status: 'readable' | 'missing' | 'not-applicable' = probed.get(view) ?? 'readable';
			if (probed.has(view)) { views.push({ feature, view, status }); continue; }
			if (session.identity.isCdb && ['V$LOG','V$LOGFILE','V$ARCHIVED_LOG','V$RECOVERY_FILE_DEST','V$FLASH_RECOVERY_AREA_USAGE','V$UNDOSTAT','DBA_UNDO_EXTENTS'].includes(view)) status = 'not-applicable';
			else try { await session.query(`SELECT 1 FROM ${view} WHERE ROWNUM = 0`); }
			catch (error) {
				if (/ORA-65040/.test(error instanceof Error ? error.message : '')) status = 'not-applicable';
				else if (!/ORA-00942|ORA-01031/.test(error instanceof Error ? error.message : '')) throw new Error(`Preflight probe failed: ${view}`);
				else status = 'missing';
			}
			probed.set(view, status);
			views.push({ feature, view, status });
		}
		const grantsSql = [...new Set(views.filter(v => v.status === 'missing').map(v => `GRANT SELECT ON SYS.${v.view.replace(/^V\$/, 'V_$')} TO "${session.target.username.toUpperCase()}";`))];
		return { identity: session.identity, accountCheck: 'passed', views, grantsSql };
	} finally { await session.close(); }
}
