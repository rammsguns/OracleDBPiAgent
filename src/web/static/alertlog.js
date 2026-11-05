import { setupPanel, execute } from './panel.js';

function el(tag, text, className) {
	const node = document.createElement(tag);
	if (text !== undefined) node.textContent = String(text);
	if (className) node.className = className;
	return node;
}
function grid(title, columns, rows) {
	const wrap = el('div', undefined, 'table-scroll');
	const table = el('table');
	table.append(el('caption', title));
	const head = el('tr');
	for (const column of columns) {
		const cell = el('th', column); cell.scope = 'col'; head.append(cell);
	}
	table.append(head);
	for (const values of rows) {
		const row = el('tr');
		for (const value of values) {
			const cell = el('td');
			cell.append(value instanceof Node ? value : document.createTextNode(String(value ?? '')));
			row.append(cell);
		}
		table.append(row);
	}
	wrap.append(table);
	if (!rows.length) wrap.append(el('p', 'No rows returned in this window.'));
	return wrap;
}
function level(value) {
	const label = ({ 1: 'Critical', 2: 'Severe', 8: 'Important', 16: 'Normal', 32: 'Debug' })[value] || 'Unknown';
	return el('span', `${label} (${value ?? 'unknown'})`, 'alert-level ' + (value !== null && value <= 2 ? 'alert-critical' : value !== null && value <= 8 ? 'alert-important' : 'alert-normal'));
}
function compactTime(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}
// Recheck the rendered clamp when a hidden tab opens or its available width changes.
const messageObserver = new ResizeObserver(entries => {
	for (const { target: preview } of entries) {
		if (!preview.isConnected) { messageObserver.unobserve(preview); continue; }
		const full = preview.nextElementSibling;
		if (!full.open && preview.clientHeight) full.hidden = preview.scrollHeight <= preview.clientHeight + 1;
	}
});
function messageCell(row) {
	const cell = el('div', undefined, 'alert-message');
	const traces = [...new Set((row.traceFiles || [row.traceFile]).filter(Boolean))];
	// Extract trace paths from the message too; keep each path in its own disclosure.
	for (const match of row.messageText.matchAll(/[^\s'"<>]*\.trc\b/gi)) {
		if (!traces.includes(match[0])) traces.push(match[0]);
	}
	let text = row.messageText;
	for (const path of [...traces].sort((a, b) => b.length - a.length)) text = text.replaceAll(path, path.split(/[\\/]/).pop());
	text = text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
	const preview = el('div', text || '(Trace file reference)', 'alert-message-preview');
	cell.append(preview);
	const full = el('details', undefined, 'alert-full-message');
	full.hidden = true;
	full.append(el('summary', 'Show full message'), el('div', text, 'alert-message-text'));
	cell.append(full);
	messageObserver.observe(preview);
	if (row.codes.length) cell.append(el('div', row.codes.join(', '), 'alert-codes'));
	const ids = [...new Set(row.incidentIds || (row.incidentId ? [row.incidentId] : []))];
	const badges = el('div', undefined, 'incident-badges');
	for (const id of ids.slice(0, 5)) badges.append(el('span', `Incident ${id}`, 'incident-badge'));
	if (ids.length > 5) badges.append(el('span', `+${ids.length - 5} more`, 'incident-more'));
	cell.append(badges);
	for (const key of (row.problemKeys || [row.problemKey]).filter(Boolean)) cell.append(el('div', key));
	if (traces.length) {
		const details = el('details', undefined, 'alert-traces');
		details.append(el('summary', `Trace files (${traces.length})`));
		const list = el('ul');
		for (const path of traces) {
			const item = el('li', path.split(/[\\/]/).pop()); item.title = path; list.append(item);
		}
		details.append(list); cell.append(details);
	}
	for (const note of [row.textTruncated ? '[text capped]' : '', row.metadataTruncated ? '[metadata capped]' : ''].filter(Boolean)) cell.append(el('small', note));
	return cell;
}
export function renderAlertEvidence(content, evidence) {
	const section = el('div', undefined, 'alert-evidence');
	section.append(el('h3', 'Alert log evidence'), el('p', `${evidence.status} · ${evidence.window.from} to ${evidence.window.to} (exclusive)`));
	if (evidence.grant) section.append(el('pre', evidence.grant));
	const entries = grid('Alert entries', ['First / last time', 'Level', 'Count', 'Message'], evidence.entries.map(row => {
		const first = row.firstTime || row.timestamp, last = row.lastTime || row.timestamp;
		const time = el('span', compactTime(first) + (first !== last ? '\n' + compactTime(last) : ''));
		time.title = first + (first !== last ? ' / ' + last : '');
		return [time, level(row.level), `×${row.count}`, messageCell(row)];
	}));
	entries.querySelector('table').className = 'alert-entries';
	section.append(entries);
	section.append(grid('ADR incidents', ['Created', 'Incident', 'Problem key', 'Status'], evidence.incidents.map(row => [compactTime(row.createTime), row.incidentId, row.problemKey, `${row.statusName || ({ 1: 'Inflight', 2: 'Ready', 3: 'Tracked', 4: 'Closed', 5: 'Data removed', 6: 'Purged', 7: 'Incomplete' })[row.status] || 'Unknown'} (${row.status ?? 'null'})`])));
	if (evidence.correlations?.length) {
		section.append(el('h4', 'Correlations'));
		for (const item of evidence.correlations) section.append(el('p', `${item.kind === 'jobRun' ? 'Job run' : 'Code'}: ${item.label}${item.at ? ' · ' + item.at : ''} · Alert entries ${item.entryIndexes.map(index => index + 1).join(', ') || 'none'}`));
	}
	content.append(section);
}
export function initAlertLog(api, targets) {
	const view = setupPanel('alertlog', 'Read alert log', targets);
	const since = view.field('input', 'since', 'Since (m/h/d, at most 30d)');
	since.value = '24h';
	const codes = view.field('input', 'codes', 'Codes (comma-separated ORA-/TNS-)');
	codes.maxLength = 220;
	const text = view.field('input', 'text', 'Message contains');
	text.maxLength = 2048;
	view.form.append(view.run);
	const download = el('button', 'Download Markdown');
	download.id = 'alertlog-export'; download.type = 'button'; download.disabled = true;
	view.panel.append(download);
	let markdown = '';
	download.addEventListener('click', () => {
		const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
		const link = el('a'); link.href = url; link.download = 'alertlog.md'; link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});
	view.form.addEventListener('submit', event => {
		event.preventDefault(); download.disabled = true;
		void execute(view, async () => {
			const params = new URLSearchParams({ target: view.target.value, since: since.value, codes: codes.value, text: text.value });
			const result = await (await api('/api/alertlog?' + params)).json();
			const { entries, incidents } = result;
			renderAlertEvidence(view.content, { status: entries.status, window: entries.window, entries: entries.rows, incidents: incidents.rows, grant: [...new Set([...entries.grants, ...incidents.grants])].join('\n') });
			view.content.append(el('p', `ADR incidents: ${incidents.status}`));
			if (entries.truncated || incidents.truncated) view.content.append(el('p', 'Row cap reached; partial result. Folding covers only fetched rows.'));
			markdown = result.markdown; download.disabled = false;
		});
	});
	view.target.addEventListener('change', () => { view.content.replaceChildren(); download.disabled = true; });
}
