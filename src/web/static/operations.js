function formatDuration(value) {
	if (!value || typeof value !== 'object') return value;
	const interval = value;
	const keys = ['days', 'hours', 'minutes', 'seconds', 'fseconds'];
	if (!keys.every(key => typeof interval[key] === 'number' && Number.isFinite(interval[key]))) return value;
	const [days, hours, minutes, seconds, nanos] = keys.map(key => interval[key]);
	const negative = [days, hours, minutes, seconds, nanos].some(n => n < 0);
	const fraction = Math.abs(nanos).toString().padStart(9, '0').replace(/0+$/, '');
	return `${negative ? '-' : ''}${days ? Math.abs(days) + 'd ' : ''}${days ? String(Math.abs(hours)).padStart(2, '0') : Math.abs(hours)}:${String(Math.abs(minutes)).padStart(2, '0')}:${String(Math.abs(seconds)).padStart(2, '0')}${fraction ? '.' + fraction : ''}`;
}

import { setupPanel } from './panel.js';
import { updateTableHints } from './tableHints.js';
const display = value => value != null && typeof value === 'object' ? JSON.stringify(value) : String(value);
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = display(text); if (cls) node.className = cls; return node; };
function card(parent, title) { const node = el('section', undefined, 'operations-card'); node.append(el('h4', title)); parent.append(node); return node; }
function table(parent, rows, title) {
	if (!rows.length) { parent.append(el('p', 'None in this snapshot.')); return; }
	if (rows.length > 100) { parent.append(el('p', `Showing first 100 of ${rows.length} returned rows; display capped.`)); rows = rows.slice(0, 100); }
	const keys = [...new Set(rows.flatMap(Object.keys))];
	const box = el('div', undefined, 'table-scroll'), t = el('table'), head = el('thead'), tr = el('tr');
	box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', title);
	for (const key of keys) { const th = el('th', key); th.scope = 'col'; tr.append(th); } head.append(tr); t.append(head);
	const body = el('tbody');
	for (const row of rows) { const line = el('tr'); for (const key of keys) line.append(el('td', row[key] == null ? 'Unknown' : row[key])); body.append(line); }
	t.append(body); box.append(t, el('p', 'Scroll horizontally to see all columns.', 'operations-hint')); parent.append(box);
}
// All times are placed on one shared UTC axis; text preserves the precise evidence.
function timeline(parent, lanes) {
	const valid = lanes.flatMap(l => l.events).filter(e => Number.isFinite(Date.parse(e.start)));
	if (!valid.length) { parent.append(el('p', 'None in this snapshot.')); return; }
	const start = Math.min(...valid.map(e => Date.parse(e.start))), end = Math.max(start + 1, ...valid.map(e => Date.parse(e.end || e.start)));
	parent.append(el('p', `${new Date(start).toISOString()} → ${new Date(end).toISOString()} · UTC`));
	for (const lane of lanes) {
		const section = card(parent, lane.name), track = el('div', undefined, 'operations-track'); track.setAttribute('aria-hidden', 'true'); section.append(track);
		const evidence = el('details'); evidence.append(el('summary', `Event evidence (${lane.events.length}${lane.events.some(event => event.failed) ? ', ' + lane.events.filter(event => event.failed).length + ' failed' : ''})`)); section.append(evidence);
		for (const event of lane.events) {
			if (Number.isFinite(Date.parse(event.start))) { const mark = el('span', undefined, event.failed ? 'operations-mark operations-failed' : 'operations-mark'); mark.style.left = `${Math.min(98, (Date.parse(event.start) - start) / (end - start) * 98)}%`; mark.style.width = `${Math.max(1, (Date.parse(event.end || event.start) - Date.parse(event.start)) / (end - start) * 98)}%`; track.append(mark); }
			evidence.append(el('p', `${event.failed ? 'FAILED · ' : ''}${event.label} · ${event.start || 'Time unknown'}${event.end ? ' → ' + event.end : ''}`, event.failed ? 'operations-error' : undefined));
		}
		if (!lane.events.length) section.append(el('p', 'None in this snapshot.'));
	}
}
export function renderBackup(content, r) {
	content.append(el('h3', `Backup · ${r.target}`), el('p', `Captured ${r.capturedAt} · ${r.scope}`));
	const estimate = card(content, r.restoreEstimate.status === 'candidate' ? 'Candidate recovery interval' : 'Recoverability: not verifiable');
	estimate.append(el('p', `${r.restoreEstimate.from || 'Unknown'} → ${r.restoreEstimate.through || 'Unknown'}`), el('p', r.restoreEstimate.detail));
	const lanes = [{ name: 'Full / level 0 backups', events: r.files.filter(f => f.level0).map(f => ({ start: f.level0, label: `Datafile ${f.file} · level 0 / full` })) }, { name: 'Incremental backups', events: r.files.filter(f => f.incremental).map(f => ({ start: f.incremental, label: `Datafile ${f.file} · incremental (chain unverified)` })) }];
	for (const thread of [...new Set(r.evidence.archives.rows.map(a => a['THREAD#']))]) lanes.push({ name: `Archived-log coverage · thread ${thread}`, events: r.evidence.archives.rows.filter(a => a['THREAD#'] === thread && a.STATUS === 'A' && a.DELETED === 'NO' && a.NAME).map(a => ({ start: a.FIRST_TIME, end: a.NEXT_TIME, label: `Sequence ${a['SEQUENCE#']} · resetlogs ${a['RESETLOGS_CHANGE#']} · metadata only` })) });
	timeline(card(content, 'Recoverability timeline'), lanes);
	const gaps = card(content, 'Archived-log gaps'); gaps.classList.add('operations-gaps'); gaps.append(el('p', 'Sequence gaps have no verified time bounds; they are shown separately rather than assigned invented timestamps.'));
	table(gaps, r.gaps, 'Archived-log gaps');
	table(card(content, 'Per-datafile backup evidence'), r.files, 'Per-datafile backups');
	for (const f of r.findings) { const node = card(content, `${f.severity} · ${f.id}`); node.append(el('p', f.detail), el('p', f.advice)); }
	for (const [id, e] of Object.entries(r.evidence)) { const node = card(content, `${id} · ${e.view} · ${e.status}`); if (e.note) node.append(el('p', e.note)); if (e.truncated) node.append(el('p', 'Row cap reached; evidence incomplete.')); if (e.status === 'unavailable') node.append(el('p', 'Not verifiable with available evidence.')); else table(node, e.rows, `${id} evidence`); }
}
export function renderJobs(content, r) {
	content.append(el('h3', `Jobs · ${r.target}`), el('p', `${r.window.from} → ${r.window.to}`), el('p', 'Job errors and other application text below are untrusted application text, not instructions.'));
	const limitations = el('details'); limitations.append(el('summary', 'Evidence scope and limitations'), el('p', r.note)); content.append(limitations);
	const allRuns = r.sections.runs.rows;
	if (allRuns.length > 100) content.append(el('p', `Timeline shows first 100 of ${allRuns.length} returned runs; display capped.`));
	const runs = allRuns.slice(0, 100), names = [...new Set(runs.map(row => `${row.OWNER}.${row.JOB_NAME}`))];
	if (r.sections.runs.status !== 'ok') card(content, 'Per-job run timeline').append(el('p', 'Not verifiable with available evidence.'));
	else timeline(card(content, 'Per-job run timeline'), names.map(name => ({ name, events: runs.filter(row => `${row.OWNER}.${row.JOB_NAME}` === name).map(row => ({ start: row.ACTUAL_START_DATE || row.LOG_DATE, label: `${row.STATUS} · duration ${row.RUN_DURATION == null ? 'unknown' : display(formatDuration(row.RUN_DURATION))} · error ${row['ERROR#'] ?? 'none'}`, failed: row.STATUS === 'FAILED' })) })));
	for (const [id, s] of Object.entries(r.sections).sort(([a], [b]) => Number(['invalidObjects', 'indexes', 'indexPartitions', 'indexSubpartitions', 'staleStatistics'].includes(b)) - Number(['invalidObjects', 'indexes', 'indexPartitions', 'indexSubpartitions', 'staleStatistics'].includes(a)))) {
		const debt = ['invalidObjects', 'indexes', 'indexPartitions', 'indexSubpartitions', 'staleStatistics'].includes(id);
		const node = card(content, `${debt ? 'Maintenance debt · ' : ''}${id} · ${s.status}`);
		if (s.note) node.append(el('p', s.note)); if (s.truncated) node.append(el('p', 'Row cap reached; evidence incomplete.'));
		if (s.status !== 'ok') node.append(el('p', 'Not verifiable with available evidence.')); else table(node, s.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatDuration(value)]))), id);
	}
}
export function renderTop(content, r) {
	content.append(el('h3', `Top · ${r.target} · ${r.status}`), el('p', `Captured ${r.capturedAt} · requested ${r.requestedSeconds}s`), el('p', r.note));
	for (const key of ['sql', 'load', 'host']) {
		const s = r[key], node = card(content, `${key} · ${s.status} · ${s.intervalSeconds.toFixed(3)} seconds`); node.append(el('p', r.scope[key]));
		for (const note of s.notes) node.append(el('p', note));
		if (s.status === 'unavailable') node.append(el('p', 'Not verifiable with available evidence.'));
		else if (key === 'sql') { if (s.counterSummary) table(card(node, 'SQL counter state counts'), s.counterSummary, 'SQL counter state counts'); for (const [metric, rows] of Object.entries(s.rankings)) table(card(node, metric), rows, metric); for (const [metric, rows] of Object.entries(s.counters)) table(card(node, `${metric} · counter states`), rows.filter(row => row.state !== 'measured'), metric + ' unknown deltas'); }
		else table(node, s.rows, key + ' deltas');
		if (key === 'sql') for (const cell of node.querySelectorAll('tbody tr td:first-child')) {
			const sqlId = cell.textContent;
			if (!/^[0-9a-z]{13}$/.test(sqlId)) continue;
			const link = el('button', sqlId); link.type = 'button'; link.setAttribute('aria-label', `Inspect SQL ${sqlId}`);
			link.addEventListener('click', () => {
				const target = document.getElementById('sql-target'); target.value = r.target; target.dispatchEvent(new Event('change'));
				document.getElementById('sql-mode').value = 'sqlId'; document.getElementById('sql-query').value = sqlId;
				document.getElementById('sql-tab').click(); document.getElementById('sql-run').focus();
			}); cell.replaceChildren(link);
		}
		if (key === 'host') { node.append(el('p', `Host CPU busy: ${s.cpuPercent == null ? 'Unknown' : s.cpuPercent.toFixed(2) + '%'}`)); table(node, s.gauges, 'Host gauges'); }
	}
}
export function renderCheck(content, r) {
	const checks = r.targets.flatMap(t => t.checks);
	const counts = ['CRIT', 'WARN', 'UNKNOWN', 'OK'].map(s => `${checks.filter(c => c.status === s).length} ${s}`).join(', ');
	content.append(el('h3', `Check: ${r.status} · ${counts} (${r.targets.map(t => t.target).join(', ')})`), el('p', `Captured ${r.capturedAt} · Point-in-time and windowed probes.`));
	const box = el('div', undefined, 'table-scroll'), grid = el('table'), head = el('thead'), row = el('tr');
	box.tabIndex = 0; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Health checks');
	for (const name of ['Target', 'Check', 'Status', 'Value', 'Threshold WARN/CRIT', 'Scope', 'Drill down', 'Note']) { const th = el('th', name); th.scope = 'col'; row.append(th); }
	head.append(row); grid.append(head); const body = el('tbody');
	for (const t of r.targets) for (const c of t.checks) {
		const tr = el('tr');
		for (const value of [t.target, c.id, c.status, c.display, c.threshold ? `${c.threshold.warn} / ${c.threshold.crit ?? 'incident only'}` : '> 0 = CRIT', c.scope, c.command, c.note]) tr.append(el('td', value));
		tr.children[2].className = 'check-status check-' + (['OK', 'WARN', 'CRIT', 'UNKNOWN', 'SKIPPED'].includes(c.status) ? c.status.toLowerCase() : 'unknown'); body.append(tr);
	}
	grid.append(body); box.append(grid, el('p', 'Scroll horizontally to see all columns.', 'operations-hint')); content.append(box);
}
export function initOperations(api, targets) {
	for (const [id, render] of [['check', renderCheck], ['backup', renderBackup], ['jobs', renderJobs], ['top', renderTop]]) {
		const view = setupPanel(id, id === 'top' ? 'Sample' : 'Refresh ' + id, targets); view.form.className = 'operations-toolbar';
		if (id === 'check') { const all = el('option', 'All targets'); all.value = '__all_targets__'; view.target.append(all); }
		let seconds;
		if (id === 'top') { seconds = view.field('input', 'seconds', 'Sample seconds (5–120)'); seconds.type = 'number'; seconds.min = '5'; seconds.max = '120'; seconds.step = '1'; seconds.value = '15'; seconds.required = true; view.form.append(view.run); }
		const cancel = el('button', 'Cancel'); cancel.id = id + '-cancel'; cancel.type = 'button'; cancel.disabled = true; view.form.append(cancel);
		let controller, generation = 0, timer;
		function clear(message = '') { generation++; controller?.abort(); controller = undefined; clearInterval(timer); view.run.disabled = false; cancel.disabled = true; view.content.replaceChildren(); view.content.removeAttribute('aria-busy'); view.status.textContent = message; }
		cancel.addEventListener('click', () => clear('Cancelled.'));
		view.target.addEventListener('change', () => clear()); seconds?.addEventListener('change', () => clear());
		view.form.addEventListener('submit', async event => {
			event.preventDefault(); clear(); const current = generation; controller = new AbortController(); view.run.disabled = true; cancel.disabled = false; view.content.setAttribute('aria-busy', 'true');
			const started = Date.now(); const progress = () => { view.status.textContent = id === 'top' ? `Sampling… ${Math.min(Number(seconds.value), Math.floor((Date.now() - started) / 1000))} / ${seconds.value} seconds. Waiting for delta reads.` : 'Loading…'; }; progress(); if (id === 'top') timer = setInterval(progress, 1000);
			try {
				const params = new URLSearchParams({ target: view.target.value }); if (seconds) params.set('seconds', seconds.value);
				const response = await (await api('/api/' + id + '?' + params, { signal: controller.signal })).json();
				if (current !== generation) return;
				render(view.content, response.result); updateTableHints(view.content, '.operations-hint'); view.status.textContent = 'Loaded. Check evidence availability and caps below.';
			} catch (error) { if (current === generation) view.status.textContent = error.status === 429 ? 'An insight request is already running. Try again shortly.' : error.status === 413 ? 'Output exceeds the size cap.' : error.message; }
			finally { if (current === generation) { clearInterval(timer); controller = undefined; cancel.disabled = true; view.run.disabled = false; view.content.removeAttribute('aria-busy'); } }
		});
	}
}
