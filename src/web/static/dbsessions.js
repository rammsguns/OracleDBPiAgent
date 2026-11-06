import { updateTableHints } from './tableHints.js';
import { setupPanel, execute } from './panel.js';
import { layoutGraph } from './graphLayout.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
function sqlLink(sqlId, target) {
	if (!sqlId) return '—';
	const link = el('a', sqlId); link.href = '#sql';
	link.addEventListener('click', event => { event.preventDefault(); document.getElementById('sql-tab').click(); const select = document.getElementById('sql-target'); select.value = target; select.dispatchEvent(new Event('change')); document.getElementById('sql-mode').value = 'sqlId'; document.getElementById('sql-query').value = sqlId; document.getElementById('sql-query').focus(); }); return link;
}
function table(parent, labels, rows, name) {
	if (!rows.length) { parent.append(el('p', 'No rows in this snapshot.')); return; }
	const box = el('div', undefined, 'table-scroll dbsessions-table'), table = el('table'), head = el('thead'), tr = el('tr');
	for (const label of labels) { const th = el('th', label); th.scope = 'col'; tr.append(th); } head.append(tr); table.append(head);
	const body = el('tbody'); for (const values of rows) { const row = el('tr'); for (const value of values) { const td = el('td'); td.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—'))); row.append(td); } body.append(row); }
	table.append(body); box.append(table);
	if (labels.length === 2) box.classList.add('dbsessions-narrow-table');
	const hint = el('p', 'Scroll the table horizontally to see all columns.', 'dbsessions-scroll-hint'); box.append(hint); box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', name); parent.append(box);
}
export function blockingGraph(roots) {
	const nodes = new Map(), edges = [];
	function walk(n, parent, depth = 0) {
		if (depth > 10) return;
		const id = String(n.sid);
		if (!nodes.has(id)) nodes.set(id, { id, label: `SID ${id} ${n.session?.username || ''}`, kind: 'object', displayKind: n.vanished ? 'Vanished blocker' : n.session?.status || 'Session' });
		if (parent !== undefined) edges.push({ from: String(parent), to: id, label: [n.session?.lockType, n.session?.lockMode, n.session?.event].filter(Boolean).join(' · ') || 'Blocks' });
		if (!n.cycle && !n.depthLimited) for (const child of n.children) walk(child, n.sid, depth + 1);
	}
	for (const root of roots) walk(root); return { nodes: [...nodes.values()], edges };
}
function drawBlocking(roots) {
	const graph = blockingGraph(roots), box = el('div', undefined, 'dbsessions-graph table-scroll'); box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Blocking graph, roots on the left');
	// Keep large snapshots usable; the complete tree remains in the list.
	if (graph.nodes.length > 80) { box.append(el('p', 'Graph exceeds 80 sessions; use the complete blocking list below.')); return box; }
	const layout = layoutGraph(graph), ns = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', layout.width); svg.setAttribute('height', layout.height); svg.setAttribute('aria-label', 'Blocker to waiter');
	const make = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); return n; };
	for (const edge of graph.edges) {
		const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to), y = layout.outgoing.get(edge), end = layout.incoming.get(edge);
		make('path', { d: `M${a.x+a.width} ${y} C${a.x+a.width+70} ${y},${b.x-70} ${end},${b.x} ${end}`, fill: 'none', stroke: 'currentColor' });
		const text = make('text', { x: a.x+a.width+8, y: y-8, fill: 'currentColor', 'font-size': 12 }, edge.label.length > 22 ? edge.label.slice(0, 21)+'…' : edge.label); const title = document.createElementNS(ns, 'title'); title.textContent = edge.label; text.append(title);
	}
	for (const p of layout.positions.values()) { make('rect', { x:p.x, y:p.y, width:p.width, height:p.height, rx:6, fill:'var(--graph-node-fill)', stroke:'var(--graph-node-stroke)' }); for (const [i,line] of [...p.lines,p.kind].entries()) make('text', { x:p.x+12, y:p.y+25+i*24, fill:'currentColor', 'font-size':16 }, line); }
	box.append(svg); return box;
}
export function renderDbSessions(content, result, filters = { status: 'all', waitClass: 'all' }, controls) {
	content.replaceChildren(el('h3', `Sessions · ${result.target}`), el('p', `Captured at ${result.capturedAt} (UTC) · ${result.status}`), el('p', 'Snapshot is a short sequence of queries, not one consistent read. Sessions may vanish between queries.'));
	content.append(el('h4', 'Findings'));
	if (!result.findings.length) content.append(el('p', 'No findings in available evidence.'));
	for (const f of result.findings) { const item = el('div', undefined, 'dbsessions-finding'); item.append(el('strong', `${f.severity.toUpperCase()} · ${f.subject}`), el('p', f.detail), el('p', f.advice)); if (f.sqlId) item.append(sqlLink(f.sqlId, result.target)); content.append(item); }
	function section(key, title) { const s = result.sections[key]; content.append(el('h4', title)); if (s.status !== 'ok' || s.note) content.append(el('p', `${s.status}: ${s.note || 'Evidence unavailable or not requested.'}`)); for (const e of [s.evidence, ...(s.supportingEvidence || [])]) { if (e.truncated) content.append(el('p', 'Row cap reached; evidence is partial.')); if (e.status === 'unavailable') content.append(el('p', `${e.view}: unavailable ${e.attempts?.map(a => a.code).join(', ') || ''}`)); } return s.rows; }
	const roots = section('blocking', 'Blocking Tree');
	if (roots.length) content.append(drawBlocking(roots)); else content.append(el('p', 'No blocking in available evidence.'));
	function branch(n, depth = 0) { const item = el('li', `SID ${n.sid} · ${n.session?.username || ''}${n.vanished ? ' · Vanished blocker' : ''}${n.cycle ? ' · DEADLOCK CYCLE' : ''}${n.depthLimited ? ' · Depth limit 10' : ''}`); if (n.session) { item.append(document.createTextNode(` · ${[n.session.object, n.session.lockType, n.session.lockMode, n.session.event].filter(Boolean).join(' · ')} `), sqlLink(n.session.sqlId, result.target)); } if (depth < 10 && !n.cycle && n.children.length) { const list = el('ul'); for (const child of n.children) list.append(branch(child, depth+1)); item.append(list); } return item; }
	const list = el('ul', undefined, 'dbsessions-tree'); for (const root of roots) list.append(branch(root)); content.append(list);
	const waits = section('waits', 'Waits Since Instance Startup'); content.append(el('p', 'Cumulative non-idle wait time since instance startup, not current activity.'));
	for (const g of waits) { const row = el('div', undefined, 'dbsessions-wait'); const meter = el('meter'); meter.min = 0; meter.max = 100; meter.value = g.percent; meter.setAttribute('aria-label', g.waitClass); row.append(el('span', `${g.waitClass} · ${g.percent.toFixed(1)}% · ${g.seconds.toFixed(1)} s`), meter); content.append(row); }
	table(content, ['Event', 'Class', 'Waits', 'Seconds', '% Non-idle', 'Average ms'], waits.flatMap(g => g.events.map(e => [e.event,e.waitClass,e.totalWaits,e.seconds.toFixed(2),e.percent.toFixed(1),e.averageMs.toFixed(2)])), 'Wait events');
	const time = section('timeModel', 'Time Model Since Instance Startup'); table(content, ['Statistic', 'Seconds'], time.map(r => [r.name,r.seconds.toFixed(2)]), 'Time model');
	const tx = section('transactions', 'Long Transactions'); table(content, ['SID', 'User', 'SQL_ID', 'Start UTC', 'Age (s)', 'Undo Blocks', 'Undo Records'], tx.map(r => [r.sid,r.username,sqlLink(r.sqlId,result.target),r.startTime,r.ageSeconds,r.undoBlocks,r.undoRecords]), 'Long transactions');
	const activeRows = section('active', 'Active Sessions');
	if (controls) { controls.hidden = false; content.append(controls); }
	const active = activeRows.filter(r => (filters.status === 'all' || r.status === filters.status) && (filters.waitClass === 'all' || r.waitClass === filters.waitClass)); table(content, ['SID', 'User', 'Status', 'SQL_ID', 'Event', 'Wait Class', 'Wait (s)', 'Blocker'], active.map(r => [r.sid,r.username,r.status,sqlLink(r.sqlId,result.target),r.event,r.waitClass,r.secondsInWait,r.blockerSid]), 'Active sessions');
	updateTableHints(content, '.dbsessions-scroll-hint');
}
export function initDbSessions(api, targets) {
	const view = setupPanel('dbsessions', 'Refresh Sessions', targets);
	view.form.className = 'dbsessions-toolbar';
	const background = view.field('select', 'background', 'Include Idle / Background');
	for (const [value, text] of [['false', 'No'], ['true', 'Yes']]) { const option = el('option', text); option.value = value; background.append(option); }
	const min = view.field('input', 'min-tx', 'Min Tx Age (s)'); min.type = 'number'; min.min = '0'; min.max = '86400'; min.value = '300';
	const top = view.field('input', 'top', 'Top N Waits'); top.type = 'number'; top.min = '1'; top.max = '50'; top.value = '10';
	for (const input of [view.target, background, min, top]) {
		const caption = view.form.querySelector(`label[for="${input.id}"]`), field = el('div', undefined, 'dbsessions-field');
		field.append(caption, input); view.form.append(field);
	}
	view.form.append(view.run);
	const controls = el('div', undefined, 'dbsessions-toolbar dbsessions-filters');
	controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Active session filters and export');
	const filters = {};
	for (const [key, label] of [['status', 'Status'], ['waitClass', 'Wait Class']]) {
		const field = el('div', undefined, 'dbsessions-field'), caption = el('label', label), select = el('select');
		select.id = 'dbsessions-filter-' + key; caption.htmlFor = select.id; field.append(caption, select); controls.append(field); filters[key] = select; select.addEventListener('change', render);
	}
	const download = el('button', 'Download Markdown'); download.id = 'dbsessions-export'; download.type = 'button'; download.disabled = true; controls.append(download); controls.hidden = true; view.panel.append(controls);
	let result, markdown='', generation=0;
	function render() { if (result) renderDbSessions(view.content,result,{status:filters.status.value,waitClass:filters.waitClass.value},controls); }
	function clear() { generation++; result=undefined; markdown=''; download.disabled=true; controls.hidden=true; view.panel.append(controls); view.content.replaceChildren(); view.status.textContent=''; }
	for (const input of [view.target,background,min,top]) input.addEventListener('change',clear);
	view.form.addEventListener('submit', event => { event.preventDefault(); clear(); const current=generation; void execute(view,async () => { const response=await (await api('/api/db-sessions?'+new URLSearchParams({target:view.target.value,includeBackground:background.value,minTxSeconds:min.value,topWaits:top.value}))).json(); if(current!==generation)return; result=response.result; markdown=response.markdown; for(const key of ['status','waitClass']) { filters[key].replaceChildren(); for(const v of ['all',...new Set(result.sections.active.rows.map(r=>r[key]))]) { const o=el('option',v==='all'?'All':v); o.value=v; filters[key].append(o); } } render(); download.disabled=false; }).then(()=>{if(current!==generation)view.status.textContent=''; else if(result) view.status.textContent = Object.values(result.sections).some(s => s.status === 'unavailable') ? 'Loaded. Some sections are unavailable.' : 'Loaded.';}); });
	download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'})),link=el('a');link.href=url;link.download='sessions.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
