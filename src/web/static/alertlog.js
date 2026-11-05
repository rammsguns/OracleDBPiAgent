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
export function renderAlertEvidence(content, evidence) {
	const section = el('div', undefined, 'alert-evidence');
	section.append(el('h3', 'Alert log evidence'), el('p', `${evidence.status} · ${evidence.window.from} to ${evidence.window.to} (exclusive)`));
	if (evidence.grant) section.append(el('pre', evidence.grant));
	section.append(grid('Alert entries', ['First / last time', 'Level', 'Count', 'Codes / incidents', 'Message'], evidence.entries.map(row => {
		const metadata = el('div', row.codes.join(', '));
		for (const id of row.incidentIds || (row.incidentId ? [row.incidentId] : [])) metadata.append(el('span', `Incident ${id}`, 'incident-badge'));
		const message = [row.messageText, ...(row.problemKeys || [row.problemKey]).filter(Boolean), ...(row.traceFiles || [row.traceFile]).filter(Boolean), row.textTruncated ? '[text capped]' : '', row.metadataTruncated ? '[metadata capped]' : ''].filter(Boolean).join('\n');
		return [row.count > 1 ? row.firstTime + '\n' + row.lastTime : row.timestamp, level(row.level), `×${row.count}`, metadata, message];
	})));
	section.append(grid('ADR incidents', ['Created', 'Incident', 'Problem key', 'Status'], evidence.incidents.map(row => [row.createTime, row.incidentId, row.problemKey, row.status])));
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
