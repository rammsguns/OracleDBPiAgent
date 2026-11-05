import { setupPanel, execute } from './panel.js';
import { drawGraph } from './insight.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
const title = text => String(text).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const chip = (text, kind = '') => el('span', text, 'sql-chip ' + kind);
const severities = ['high', 'medium', 'low', 'info'];
function table(parent, columns, rows, name) {
	const box = el('div', undefined, 'table-scroll security-table'), table = el('table'), head = el('thead'), tr = el('tr');
	for (const c of columns) { const th = el('th', c); th.scope = 'col'; tr.append(th); } head.append(tr); table.append(head);
	const body = el('tbody');
	for (const values of rows) { const row = el('tr'); for (const value of values) row.append(el('td', value ?? '—')); body.append(row); }
	table.append(body); box.append(table); box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', name); parent.append(box);
}
export function privilegeGraph(paths) {
	// Retain individual privilege/source routes, including repeated names in cycles.
	// Separate routes avoid implying combinations of unrelated grants.
	const nodes = [], edges = [];
	paths.forEach((path, index) => {
		path.path.forEach((label, step) => {
			const id = `${index}:${step}`;
			nodes.push({ id, label, kind: 'object', displayKind: step === path.path.length - 1 ? path.privilege : step === 0 ? title(path.source) : 'Role' });
			if (step) edges.push({ from: `${index}:${step - 1}`, to: id, kind: 'privilege', label: path.privilege });
		});
	});
	return { nodes, edges };
}
function paths(content, result) {
	if (!result.whoCan) return;
	content.append(el('h4', 'Who Can Access the Object'));
	if (!result.whoCan.length) { content.append(el('p', 'No paths found in available evidence. Check availability and limitations below.')); return; }
	content.append(el('p', 'Paths run left to right. The final node names the privilege; the first names its source. PUBLIC applies to everyone.'));
	// Large graphs remain bounded; the complete list is always available.
	const shown = result.whoCan.slice(0, 60);
	if (shown.length !== result.whoCan.length) content.append(el('p', `Graph shows ${shown.length} of ${result.whoCan.length} paths; the list below includes all paths.`));
	content.append(drawGraph(privilegeGraph(shown), { collapseOracle: false, legend: false, scale: 0.75, label: 'Privilege paths, left to right; scroll horizontally when needed' }));
	const list = el('ol', undefined, 'security-paths');
	for (const p of result.whoCan) { const item = el('li'); item.append(el('strong', p.privilege + ' · ' + title(p.source)), el('p', p.path.join(' → '))); list.append(item); }
	content.append(el('h5', 'Privilege Path List'), list);
}
export function renderSecurity(content, result, severity = 'all') {
	content.replaceChildren();
	content.append(el('h3', `Security Posture · ${result.target}`));
	const summary = el('p'); summary.append(chip(title(result.status), result.status), document.createTextNode('Read-only findings · evidence read successfully does not mean secure.')); content.append(summary);
	for (const level of severities) {
		if (severity !== 'all' && severity !== level) continue;
		const checks = result.checks.filter(c => c.severity === level && c.findings.length);
		if (!checks.length) continue;
		content.append(el('h4', title(level) + ' Severity'));
		for (const c of checks) {
			content.append(el('h5', c.title));
			table(content, ['Subject', 'Finding', 'Evidence'], c.findings.map(f => [f.subject, f.detail, f.evidence.view]), c.title + ' findings');
			content.append(el('p', c.advice, 'security-advice'));
		}
	}
	if (!result.checks.some(c => c.findings.length && (severity === 'all' || c.severity === severity))) content.append(el('p', 'No findings for this severity in available evidence.'));
	paths(content, result);
	content.append(el('h4', 'Check Status and Evidence'));
	for (const c of result.checks.filter(c => severity === 'all' || c.severity === severity)) {
		const section = el('details', undefined, 'security-check'); section.open = c.status !== 'ok';
		const heading = el('summary'); heading.append(document.createTextNode(c.title + ' '), chip(title(c.status), c.status), chip(`${c.findings.length} Findings`)); section.append(heading);
		if (!c.findings.length) section.append(el('p', c.status === 'ok' ? 'No findings in available evidence.' : 'Evidence incomplete or not requested.'));
		for (const note of c.notes || []) section.append(el('p', note));
		for (const evidence of c.evidence || []) {
			const line = el('p'); line.append(chip(title(evidence.status), evidence.status), document.createTextNode(evidence.view || 'No source'));
			if (evidence.truncated) line.append(chip('Cap Reached · Partial', 'warning'));
			section.append(line);
			for (const attempt of evidence.attempts || []) section.append(el('p', `${attempt.view}: ${attempt.code}`));
			if (evidence.rows?.length) table(section, evidence.columns.map(title), evidence.rows.map(r => r.map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v)), c.title + ' evidence');
		}
		section.append(el('p', c.advice, 'security-advice')); content.append(section);
	}
}
export function initSecurity(api, targets) {
	const view = setupPanel('security', 'Read Security Posture', targets);
	const object = view.field('input', 'object', 'Who Can Access (Optional OWNER.OBJECT)'); object.maxLength = 257; object.placeholder = 'e.g. HR.EMPLOYEES';
	view.form.append(view.run);
	const caption = el('label', 'Severity'); caption.htmlFor = 'security-severity';
	const severity = el('select'); severity.id = 'security-severity';
	for (const value of ['all', ...severities]) { const option = el('option', value === 'all' ? 'All Severities' : title(value)); option.value = value; severity.append(option); }
	view.panel.insertBefore(caption, view.status); view.panel.insertBefore(severity, view.status);
	const download = el('button', 'Download Markdown'); download.id = 'security-export'; download.type = 'button'; download.disabled = true; view.panel.insertBefore(download, view.status);
	let result, markdown = '', generation = 0;
	function clear() { generation++; result = undefined; markdown = ''; view.content.replaceChildren(); view.status.textContent = ''; download.disabled = true; }
	view.target.addEventListener('change', clear);
	object.addEventListener('input', clear);
	severity.addEventListener('change', () => { if (result) renderSecurity(view.content, result, severity.value); });
	view.form.addEventListener('submit', event => {
		event.preventDefault(); clear(); const current = generation;
		const params = new URLSearchParams({ target: view.target.value }); if (object.value.trim()) params.set('whoCan', object.value.trim());
		void execute(view, async () => {
			const response = await (await api('/api/security?' + params)).json();
			if (current !== generation) return;
			result = response.result; markdown = response.markdown; renderSecurity(view.content, result, severity.value); download.disabled = false;
		}).then(() => { if (current !== generation) view.status.textContent = ''; });
	});
	download.addEventListener('click', () => {
		const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' })), link = el('a'); link.href = url; link.download = 'security.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	});
}
