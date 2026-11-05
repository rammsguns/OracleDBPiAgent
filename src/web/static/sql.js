import { setupPanel, execute } from './panel.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
const label = key => ({child: 'Child', CHILD_NUMBER: 'Child', DATATYPE_STRING: 'Type', WAS_CAPTURED: 'Captured', elapsedPerExec: 'Elapsed / Exec (ms)', cpuPerExec: 'CPU / Exec (ms)', execs: 'Executions'}[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
const displayTime = v => v == null ? '—' : (v / 1000).toPrecision(3);
const metric = value => typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(3)) : value;
function chip(text, kind = '') { return el('span', text, 'sql-chip ' + kind); }
function grid(parent, columns, rows, findings = false) {
	const box = el('div', undefined, 'table-scroll sql-table' + (findings ? ' sql-findings' : '')), table = el('table'), head = el('tr');
	for (const c of columns) { const th = el('th', c); th.scope = 'col'; head.append(th); } table.append(head);
	for (const values of rows) { const tr = el('tr'); for (const value of values) { const td = el('td'); td.append(value instanceof Node ? value : document.createTextNode(String(metric(value) ?? '—'))); tr.append(td); } table.append(tr); }
	box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'SQL evidence table'); box.append(table); parent.append(box); if (!rows.length) parent.append(el('p', 'No rows returned.'));
}
export function renderSqlInsight(content, result) {
	if (!result) return;
	const root = el('div', undefined, 'sql-evidence'); content.append(root);
	root.append(el('h3', `SQL ${result.sqlId} · ${result.target}`), el('p', 'Cursor cache only · all times UTC · time per execution in ms (3 significant digits)'), el('p', result.text));
	root.append(el('h4', 'Findings'));
	if (!result.findings?.length) root.append(el('p', 'No findings in available evidence.'));
	if (result.findings?.length) grid(root, ['Finding', 'Evidence', 'Verify Next (Shown, Never Run)'], result.findings.map(f => [f.label, f.view + ': ' + f.rows.map(r => f.columns.map((c, i) => label(c) + ': ' + (/^(elapsedPerExec|cpuPerExec)$/.test(c) ? displayTime(r[i]) : typeof r[i] === 'object' ? JSON.stringify(r[i]) : r[i])).join('; ')).join(' / '),  /statistics/i.test(f.label) ? `SELECT STALE_STATS, LAST_ANALYZED FROM ${f.view} WHERE OWNER = '${String(f.rows[0]?.[0]).replace(/'/g, "''")}' AND ${f.view.includes('IND_STATISTICS') ? 'INDEX_NAME' : 'TABLE_NAME'} = '${String(f.rows[0]?.[1]).replace(/'/g, "''")}';` : `SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS, ELAPSED_TIME FROM V$SQL WHERE SQL_ID = '${result.sqlId}';`]), true);
	if (!result.children?.length) root.append(el('p', result.status === 'unavailable' ? 'Cursor evidence unavailable.' : 'SQL not in cursor cache.'));
	const summary = el('p', undefined, 'sql-section-summary'); root.append(summary);
	for (const [key, section] of Object.entries(result.sections || {})) {
		const line = el('span'); line.append(chip(`${label(key)}: ${section.status}${section.status !== 'ok' ? ' · ' + (section.view || 'no referenced objects') : ''}`, section.status));
		if (section.truncated) line.append(chip('Cap reached · partial', 'warning'));
		if (section.status !== 'ok' && section.attempts?.length) line.append(el('small', ' Attempts: ' + section.attempts.map(a => `${a.view} ${a.code}`).join(', ')));
		summary.append(line);
	}
	root.append(el('h4', 'Plans'));
	for (const plan of result.plans || []) {
		root.append(el('h5', `Plan ${plan.planHashValue} · ${plan.source}`));
		const tree = el('div', undefined, 'sql-plan-tree'); tree.tabIndex = 0; tree.setAttribute('role', 'region'); tree.setAttribute('aria-label', 'Plan tree ' + plan.planHashValue);
		// Follow parent IDs, not row order or numeric ID distance. Guard malformed cycles.
		function branch(line, seen = new Set()) {
			const item = el('li'); item.append(el('span', `${line.id} · ${line.operation} ${line.options || ''} ${[line.owner, line.name].filter(Boolean).join('.')}`));
			const next = new Set(seen); next.add(line.id);
			const children = plan.lines.filter(l => l.parentId === line.id && !next.has(l.id));
			if (children.length) { const list = el('ul'); for (const child of children) list.append(branch(child, next)); item.append(list); } return item;
		}
		const list = el('ul'); const starts = plan.lines.filter(l => l.parentId === null || !plan.lines.some(p => p.id === l.parentId));
		for (const line of starts) list.append(branch(line)); tree.append(list); root.append(tree);
		const display = el('details'); display.append(el('summary', 'DISPLAY_CURSOR text'));
		display.append(el('pre', plan.text?.join('\n') || 'DISPLAY_CURSOR text unavailable; showing V$SQL_PLAN tree.')); root.append(display);
	}
	root.append(el('h4', 'Plan Changes'));
	const times = (result.planChanges || []).map(p => p.elapsedPerExec).filter(v => v !== null);
	grid(root, ['Plan Hash', 'Executions', 'Elapsed / Exec (ms)', 'First Load UTC', 'Last Active UTC'], (result.planChanges || []).map(p => {
		const time = el('span', displayTime(p.elapsedPerExec) ?? '—');
		if (times.length > 1 && Math.min(...times) !== Math.max(...times)) { if (p.elapsedPerExec === Math.min(...times)) time.append(chip('Best', 'best')); if (p.elapsedPerExec === Math.max(...times)) time.append(chip('Worst', 'warning')); }
		return [p.planHashValue, p.execs, time, p.firstLoad, p.lastActive];
	}));
	for (const key of ['tables', 'indexes']) {
		root.append(el('h4', key === 'tables' ? 'Table Statistics' : 'Index Statistics'));
		grid(root, ['Object', 'Statistics', 'Last Analyzed UTC', 'Rows', 'Source'], (result[key] || []).map(t => [t.owner + '.' + t.name, chip(t.status === 'unavailable' ? 'Unavailable' : !t.lastAnalyzed ? 'Missing' : t.stale ? 'Stale' : t.stale === null ? 'Unknown' : 'Current', t.status === 'unavailable' ? 'unavailable' : !t.lastAnalyzed || t.stale ? 'warning' : 'ok'), t.lastAnalyzed || '—', t.numRows, t.view]));
	}
	root.append(el('h4', 'Cursor Children'));
	const fields = ['child', 'planHashValue', 'execs', 'elapsedPerExec', 'cpuPerExec', 'bufferGetsPerExec', 'diskReadsPerExec', 'rowsPerExec', 'firstLoad', 'lastActive'];
	grid(root, fields.map(label), (result.children || []).map(r => fields.map(k => /^(elapsedPerExec|cpuPerExec)$/.test(k) ? displayTime(r[k]) : /PerExec$/.test(k) && typeof r[k] === 'number' ? Number(r[k].toPrecision(3)) : r[k])));
	if (['baselines', 'profiles', 'binds', 'mismatches'].every(k => !result[k]?.length)) root.append(el('p', 'No baselines, profiles, binds or mismatches.'));
	for (const key of ['baselines', 'profiles', 'binds', 'mismatches']) { const rows = result[key] || []; if (!rows.length) continue; root.append(el('h4', label(key))); const cols = [...new Set(rows.flatMap(Object.keys))]; grid(root, cols.map(label), rows.map(r => cols.map(c => r[c]))); }
}
export function initSql(api, targets) {
	const view = setupPanel('sql', 'Read SQL insight', targets);
	const mode = view.field('select', 'mode', 'Find by');
	for (const [value, label] of [['sqlId', 'SQL_ID'], ['text', 'Text fragment']]) { const option = el('option', label); option.value = value; mode.append(option); }
	const input = view.field('input', 'query', 'SQL_ID or text fragment'); input.maxLength = 2048;
	view.form.append(view.run);
	const download = el('button', 'Download Markdown'); download.id = 'sql-export'; download.type = 'button'; download.disabled = true; view.panel.append(download);
	let markdown = '', generation = 0;
	download.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' })); const a = el('a'); a.href = url; a.download = 'sql.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
	function load(key, value) {
		const current = ++generation, target = view.target.value; download.disabled = true;
		void execute(view, async () => {
			const response = await (await api('/api/sql?' + new URLSearchParams({ target, [key]: value }))).json();
			if (current !== generation) return;
			if (response.candidates) {
				view.content.append(el('p', response.candidates.length ? 'Choose a cached statement. No candidate was selected automatically.' : 'No cached SQL matched.'));
				if (response.truncated) view.content.append(el('p', 'Candidate cap reached; narrow the text fragment.'));
				for (const c of response.candidates) { const b = el('button', c.sqlId + ' · ' + c.text, 'sql-candidate'); b.type = 'button'; b.addEventListener('click', () => { mode.value = 'sqlId'; input.value = c.sqlId; load('sqlId', c.sqlId); }); view.content.append(b); }
			} else { renderSqlInsight(view.content, response.result); markdown = response.markdown; download.disabled = false; }
		});
	}
	view.form.addEventListener('submit', e => { e.preventDefault(); load(mode.value, input.value.trim()); });
	view.target.addEventListener('change', () => { generation++; view.content.replaceChildren(); download.disabled = true; });
}
