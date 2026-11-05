import { setupPanel, execute } from './panel.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
function chip(text, kind = '') { return el('span', text, 'sql-chip ' + kind); }
function grid(parent, columns, rows) {
	const box = el('div', undefined, 'table-scroll'), table = el('table'), head = el('tr');
	for (const c of columns) { const th = el('th', c); th.scope = 'col'; head.append(th); } table.append(head);
	for (const values of rows) { const tr = el('tr'); for (const value of values) { const td = el('td'); td.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—'))); tr.append(td); } table.append(tr); }
	box.append(table); parent.append(box); if (!rows.length) parent.append(el('p', 'No rows returned.'));
}
export function renderSqlInsight(content, result) {
	if (!result) return;
	const root = el('div', undefined, 'sql-evidence'); content.append(root);
	root.append(el('h3', `SQL ${result.sqlId} · ${result.target}`), el('p', 'Cursor cache only · all times UTC · elapsed and CPU in microseconds'), el('p', result.text));
	root.append(el('h4', 'Findings'));
	if (!result.findings?.length) root.append(el('p', 'No findings in available evidence.'));
	for (const f of result.findings || []) { root.append(el('p', f.label)); grid(root, f.columns, f.rows.map(r => r.map(v => typeof v === 'object' ? JSON.stringify(v) : v))); }
	if (!result.children?.length) root.append(el('p', result.status === 'unavailable' ? 'Cursor evidence unavailable.' : 'SQL not in cursor cache.'));
	for (const [key, section] of Object.entries(result.sections || {})) {
		const line = el('p'); line.append(chip(`${key}: ${section.status} · ${section.view || 'no referenced objects'}`, section.status));
		if (section.truncated) line.append(chip('Cap reached · partial', 'warning'));
		if (section.attempts?.length) line.append(el('small', ' Attempts: ' + section.attempts.map(a => `${a.view} ${a.code}`).join(', ')));
		root.append(line);
	}
	root.append(el('h4', 'Plans'));
	for (const plan of result.plans || []) {
		root.append(el('h5', `Plan ${plan.planHashValue} · ${plan.source}`));
		const tree = el('div', undefined, 'sql-plan-tree');
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
	root.append(el('h4', 'Plan changes'));
	const times = (result.planChanges || []).map(p => p.elapsedPerExec).filter(v => v !== null);
	grid(root, ['Plan hash', 'Executions', 'Elapsed / exec (µs)', 'First load UTC', 'Last active UTC'], (result.planChanges || []).map(p => {
		const time = el('span', p.elapsedPerExec ?? '—');
		if (times.length > 1 && Math.min(...times) !== Math.max(...times)) { if (p.elapsedPerExec === Math.min(...times)) time.append(chip('Best', 'best')); if (p.elapsedPerExec === Math.max(...times)) time.append(chip('Worst', 'warning')); }
		return [p.planHashValue, p.execs, time, p.firstLoad, p.lastActive];
	}));
	for (const key of ['tables', 'indexes']) {
		root.append(el('h4', key === 'tables' ? 'Table statistics' : 'Index statistics'));
		grid(root, ['Object', 'Statistics', 'Last analyzed UTC', 'Rows', 'Source'], (result[key] || []).map(t => [t.owner + '.' + t.name, chip(t.status === 'unavailable' ? 'Unavailable' : !t.lastAnalyzed ? 'Missing' : t.stale ? 'Stale' : t.stale === null ? 'Unknown' : 'Current', t.status === 'unavailable' ? 'unavailable' : !t.lastAnalyzed || t.stale ? 'warning' : 'ok'), t.lastAnalyzed || '—', t.numRows, t.view]));
	}
	root.append(el('h4', 'Cursor children'));
	const fields = ['child', 'planHashValue', 'execs', 'elapsedPerExec', 'cpuPerExec', 'bufferGetsPerExec', 'diskReadsPerExec', 'rowsPerExec', 'firstLoad', 'lastActive'];
	grid(root, fields, (result.children || []).map(r => fields.map(k => r[k])));
	for (const key of ['baselines', 'profiles', 'binds', 'mismatches']) { root.append(el('h4', key)); const rows = result[key] || [], cols = [...new Set(rows.flatMap(Object.keys))]; grid(root, cols, rows.map(r => cols.map(c => r[c]))); }
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
