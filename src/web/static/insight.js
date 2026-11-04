const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const svgEl = (tag, attrs = {}, text) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text !== undefined) n.textContent = text; return n; };
/** Bounded relaxation gives a left-to-right layout even for cyclic dependencies. */
export function drawGraph(graph) {
	const wrap = el('div'); wrap.className = 'graph-scroll';
	const svg = svgEl('svg', { role: 'img', 'aria-label': 'Evidence dependency graph' });
	const levels = new Map(graph.nodes.map(n => [n.id, 0]));
	for (let pass = 0; pass < Math.min(graph.nodes.length, 8); pass++) {
		let changed = false;
		for (const e of graph.edges) if (levels.has(e.from) && levels.has(e.to)) {
			const next = Math.min(8, levels.get(e.from) + 1);
			if (next > levels.get(e.to)) { levels.set(e.to, next); changed = true; }
		}
		if (!changed) break;
	}
	const counts = new Map(), positions = new Map();
	for (const n of graph.nodes) {
		const level = levels.get(n.id), row = counts.get(level) || 0; counts.set(level, row + 1);
		positions.set(n.id, { x: 15 + level * 320, y: 30 + row * 120 });
	}
	const width = 300 + Math.max(0, ...levels.values()) * 320, height = Math.max(140, ...[...counts.values()].map(n => n * 120));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.style.width = width + 'px';
	for (const e of graph.edges) {
		const a = positions.get(e.from), b = positions.get(e.to); if (!a || !b) continue;
		const x1 = a.x + 255, y1 = a.y + 30, x2 = b.x, y2 = b.y + 30;
		svg.append(svgEl('path', { d: `M${x1} ${y1} C${x1 + 40} ${y1},${x2 - 40} ${y2},${x2} ${y2}`, fill: 'none', stroke: 'currentColor' }));
		svg.append(svgEl('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'font-size': 12 }, '→ ' + (e.label || e.kind || 'trace')));
	}
	for (const n of graph.nodes) {
		const p = positions.get(n.id), g = svgEl('g');
		g.append(svgEl('title', {}, n.label), svgEl('rect', { x: p.x, y: p.y, width: 255, height: 65, rx: 6, fill: 'var(--graph-fill, #edf5f6)', stroke: 'currentColor' }));
		const text = svgEl('text', { x: p.x + 8, y: p.y + 20, 'font-size': 13 });
		const label = String(n.label);
		for (let i = 0; i < Math.min(label.length, 90); i += 30) text.append(svgEl('tspan', { x: p.x + 8, dy: i ? 17 : 0 }, label.slice(i, i + 30)));
		g.append(text); svg.append(g);
	}
	wrap.append(svg); return wrap;
}
function table(section) {
	const wrap = el('div'); wrap.className = 'table-scroll';
	wrap.append(el('p', [section.status, section.view, section.truncated ? 'Cap reached (partial)' : '', ...(section.attempts || []).map(a => a.code)].filter(Boolean).join(' · ')));
	const rows = section.rows || [];
	if (!rows.length) { wrap.append(el('p', 'No rows returned in visible evidence.')); return wrap; }
	const columns = section.columns || Object.keys(rows[0]);
	const t = el('table'), head = el('tr'); for (const c of columns) head.append(el('th', c)); t.append(head);
	for (const row of rows) { const tr = el('tr'); for (const v of Array.isArray(row) ? row : columns.map(c => row[c])) tr.append(el('td', typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))); t.append(tr); }
	wrap.append(t); return wrap;
}
export function initInsight(api, targets) {
	function setup(id, title) {
		const panel = document.getElementById(id + '-panel'), form = el('form');
		const field = (tag, name, label) => { const input = el(tag); input.id = id + '-' + name; const l = el('label', label); l.htmlFor = input.id; form.append(l, input); return input; };
		const target = field('select', 'target', 'Target'); for (const t of targets.filter(t => ['d1-19c-lab', 'p1-19c-prod'].includes(t.name))) { const o = el('option', t.name); o.value = t.name; target.append(o); }
		const status = el('p'); status.id = id + '-status'; status.setAttribute('role', 'status');
		const content = el('div'); content.id = id + '-content'; const run = el('button', title); run.id = id + '-run'; form.append(run); panel.append(form, status, content);
		return { panel, form, field, target, status, content, run };
	}
	const p = setup('plsql', 'List objects'), owner = p.field('input', 'owner', 'Owner filter (optional)'), objects = p.field('select', 'object', 'PL/SQL object'); owner.maxLength = 128;
	const doc = el('button', 'Document object'); doc.type = 'button'; doc.id = 'plsql-doc'; p.form.append(doc);
	const execute = async (view, task) => { view.run.disabled = true; view.status.textContent = 'Running…'; view.content.replaceChildren(); try { await task(); view.status.textContent = 'Loaded. Check evidence availability and caps below.'; } catch (e) { view.status.textContent = e.status === 429 ? 'An insight request is already running. Try again shortly.' : e.status === 413 ? 'Input or output exceeds the size cap. Narrow the request.' : e.message; } finally { view.run.disabled = false; } };
	p.form.addEventListener('submit', event => { event.preventDefault(); void execute(p, async () => { const r = await (await api('/api/plsql/list?' + new URLSearchParams({ target: p.target.value, owner: owner.value }))).json(); objects.replaceChildren(); for (const o of r.rows) { const option = el('option', `${o.owner}.${o.name} · ${o.type} · ${o.status}`); option.value = o.owner + '.' + o.name; objects.append(option); } p.content.append(table(r)); }); });
	p.target.addEventListener('change', () => { objects.replaceChildren(); p.content.replaceChildren(); });
	doc.addEventListener('click', () => { if (!objects.value) return; void execute(p, async () => {
		const r = await (await api('/api/plsql/doc?' + new URLSearchParams({ target: p.target.value, object: objects.value }))).json();
		p.content.append(el('h3', r.owner + '.' + r.name), el('p', r.complete ? 'Complete dictionary evidence' : 'Incomplete dictionary evidence'), drawGraph(r.graph));
		for (const s of r.signatures) p.content.append(el('h4', s.signature), el('p', s.comments || s.declaration), el('pre', JSON.stringify(s.tables, null, 2)));
		for (const key of ['objects', 'errors', 'tables', 'callers', 'jobs', 'source', 'dependencies', 'arguments']) { const d = el('details'); d.append(el('summary', key), table(Array.isArray(r[key]) ? { rows: r[key] } : r[key])); p.content.append(d); }
	}); });
	const t = setup('triage', 'Run triage'), issue = t.field('textarea', 'issue', 'Issue text'), since = t.field('input', 'since', 'Since (m/h/d, at most 30d)'); issue.rows = 8; issue.required = true; since.value = '24h';
	const download = el('button', 'Download Markdown'); download.type = 'button'; download.id = 'triage-export'; download.disabled = true; t.panel.append(download); let markdown = '';
	download.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' })); const a = el('a'); a.href = url; a.download = 'triage.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
	t.form.addEventListener('submit', event => { event.preventDefault(); download.disabled = true; void execute(t, async () => {
		const r = await (await api('/api/triage', { method: 'POST', body: JSON.stringify({ target: t.target.value, issue: issue.value, since: since.value }) })).json(); markdown = r.markdown;
		for (const i of r.result.issues) {
			t.content.append(el('h3', 'Ranked hypotheses'));
			for (const h of i.hypotheses) { t.content.append(el('h4', h.rank + '. ' + h.title)); for (const e of h.evidence) t.content.append(el('p', e)); }
			t.content.append(el('h3', 'Suggested fixes (not executed)')); for (const s of i.suggestions) t.content.append(el('p', s));
			for (const s of [...i.limitations, ...i.concurrency]) t.content.append(el('p', s));
			for (const e of i.excerpts) t.content.append(el('h4', e.object + ' line ' + e.line + ' · ' + e.subprogram), el('pre', e.statement + '\n' + e.source.map(s => s.line + ': ' + s.text).join('')));
			t.content.append(el('h3', 'Debug checklist and evidence'));
			for (const [n, c] of i.checks.entries()) t.content.append(el('h4', (n + 1) + '. ' + c.label), el('pre', c.sql + '\nBinds: ' + JSON.stringify(c.binds)), table(c));
			t.content.append(drawGraph(i.graph));
		} download.disabled = false;
	}); });
}
