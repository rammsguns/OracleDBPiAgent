import { createSseParser, updateTrace } from './lib.js';

const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
history.replaceState(null, '', location.pathname + location.search);
let sessionId = null, controller = null, running = false, rows = [];

function status(message) { $('status').textContent = message; }
function busy(value) {
	running = value;
	$('question').disabled = value || !sessionId;
	$('send').disabled = value || !sessionId;
	$('target').disabled = value;
	$('stop').disabled = !value;
}
async function api(path, options = {}) {
	const response = await fetch(path, { ...options, headers: {
		'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${token}`,
	} });
	if (!response.ok) {
		const error = new Error(response.status === 409 ? 'The server is busy. Try again shortly.' :
			response.status === 401 ? 'Authorization failed. Open the token URL printed by piagent web.' : 'Request failed. Please try again.');
		error.status = response.status;
		throw error;
	}
	return response;
}
function sessionPath(suffix = '') { return `/api/sessions/${encodeURIComponent(sessionId)}${suffix}`; }
function clearSessionView() {
	$('messages').replaceChildren(); $('trace').replaceChildren(); $('audit').replaceChildren();
	$('report-save').disabled = true; $('report-content').replaceChildren(); $('report-status').textContent = '';
	rows = []; $('audit-status').textContent = '';
}
async function newSession() {
	const previous = sessionId;
	sessionId = null; busy(true);
	if (previous) {
		try { await api(`/api/sessions/${encodeURIComponent(previous)}`, { method: 'DELETE' }); }
		catch (error) { if (![404, 410].includes(error.status)) throw error; }
	}
	const target = $('target').value;
	const response = await api('/api/sessions', { method: 'POST', body: JSON.stringify(target ? { target } : {}) });
	const data = await response.json();
	if (typeof data.sessionId !== 'string' || !data.sessionId) throw new Error('Invalid session response.');
	sessionId = data.sessionId; clearSessionView();
	status('Ready. Ask a read-only database question.');
}
function message(label, className, content = '') {
	const article = document.createElement('article'); article.className = 'message';
	const heading = document.createElement('h3'); heading.textContent = label;
	const body = document.createElement('pre'); body.className = className; body.textContent = content;
	if (className === 'answer') { body.setAttribute('aria-live', 'polite'); body.setAttribute('aria-atomic', 'false'); }
	article.append(heading, body); $('messages').append(article); return body;
}
function tableRow(values) {
	const tr = document.createElement('tr');
	for (const value of values) { const td = document.createElement('td'); td.textContent = String(value ?? '—'); tr.append(td); }
	return tr;
}
function renderTrace() {
	$('trace').replaceChildren(...rows.map(row => tableRow([
		row.name, row.args, row.status + (row.error ? `: ${row.error}` : ''), row.resultBytes,
	])));
}
async function ask(question, retry = true) {
	const answer = message('Assistant', 'answer');
	controller = new AbortController(); busy(true); status('Working…');
	let completed = false;
	try {
		const response = await api(sessionPath('/ask'), {
			method: 'POST', body: JSON.stringify({ question }), signal: controller.signal,
		});
		if (!response.body) throw new Error('Streaming is unavailable.');
		const parser = createSseParser(({ event, data }) => {
			const payload = JSON.parse(data);
			if (event === 'text') answer.append(document.createTextNode(typeof payload === 'string' ? payload : payload.delta ?? ''));
			if (event === 'tool_start' || event === 'tool_end') { rows = updateTrace(rows, event, payload); renderTrace(); }
			if (event === 'done') {
				if (typeof payload.answer === 'string') answer.textContent = payload.answer;
				if (Array.isArray(payload.unverified) && payload.unverified.length) {
					const note = document.createElement('p'); note.className = 'unverified';
					note.textContent = 'Unverified: ' + payload.unverified.join(', '); answer.parentElement.append(note);
				}
				completed = true; status('Answer complete.');
			}
			if (event === 'error') throw new Error('The assistant could not complete this request. Please try again.');
		});
		const reader = response.body.getReader(), decoder = new TextDecoder();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				parser.feed(decoder.decode(value, { stream: true }));
			}
			parser.feed(decoder.decode()); parser.end();
			if (!completed) throw new Error('The connection ended before the answer completed. Please try again.');
		} finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
	} catch (error) {
		if ([404, 410].includes(error.status) && retry && !controller.signal.aborted) {
			try {
				await newSession();
				message('You', 'question', question);
				status('Session expired. Started a new conversation.');
				return await ask(question, false);
			} catch { status('Could not renew the session. Reopen the original token URL to reconnect.'); return; }
		}
		status(error.name === 'AbortError' ? 'Stopped. Partial answer retained.' :
			error instanceof TypeError ? 'Network error. Check that piagent web is running and try again.' : error.message);
	} finally { controller = null; busy(false); }
}
async function health() {
	$('refresh').disabled = true;
	try {
		const checks = await (await api('/api/health')).json();
		$('health').textContent = 'Health: ' + checks.map(check => `${check.name}: ${check.status}`).join(' · ');
	}
	catch { $('health').textContent = 'Health check unavailable'; }
	finally { $('refresh').disabled = false; }
}
async function audit() {
	if (!sessionId) return;
	const requestedSession = sessionId;
	$('audit-status').textContent = 'Loading audit…';
	try {
		const records = await (await api(sessionPath('/audit'))).json();
		if (requestedSession !== sessionId) return;
		$('audit').replaceChildren(...records.map(record => tableRow([
			record.kind, record.tool, record.target, record.sqlSha256, record.rows, record.elapsedMs,
		])));
		$('audit-status').textContent = records.length ? `${records.length} records` : 'No audit records yet.';
	} catch (error) {
		if (requestedSession !== sessionId) return;
		$('audit-status').textContent = [404, 410].includes(error.status) ? 'Session expired. Send a question to start a new session.' : 'Could not load audit records.';
	}
}
function tab(selected) {
	for (const id of ['audit', 'trace', 'report']) {
		$(`${id}-tab`).setAttribute('aria-selected', String(id === selected));
		$(`${id}-tab`).tabIndex = id === selected ? 0 : -1; $(`${id}-panel`).hidden = id !== selected;
	}
	if (selected === 'audit') void audit();
}
async function runReport(saving = false) {
	const target = $('target').value;
	const params = new URLSearchParams(target ? { target } : {});
	if ($('report-summarize').checked) params.set('summarize', '1');
	$('report-run').disabled = true; $('report-save').disabled = true; $('target').disabled = true; $('report-status').textContent = 'Running report…';
	try {
		const data = await (await api('/api/report' + (saving ? '/save' : '') + '?' + params, saving ? { method: 'POST' } : {})).json();
		$('report-content').replaceChildren();
		if (typeof data.summary === 'string') {
			const summary = document.createElement('pre'); summary.className = 'answer'; summary.textContent = data.summary; $('report-content').append(summary);
			if (Array.isArray(data.unverified) && data.unverified.length) {
				const note = document.createElement('p'); note.className = 'unverified';
				note.textContent = 'Unverified: ' + data.unverified.join(', '); $('report-content').append(note);
			}
		}
		for (const section of data.report.sections) {
			const heading = document.createElement('h3'); heading.textContent = section.name;
			const note = document.createElement('p'); note.textContent = section.note;
			$('report-content').append(heading, note);
			if (section.status !== 'ok') continue;
			const wrap = document.createElement('div'); wrap.className = 'table-scroll';
			const table = document.createElement('table'); const head = document.createElement('thead');
			const tr = document.createElement('tr');
			for (const column of section.columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = column; tr.append(th); }
			head.append(tr); const body = document.createElement('tbody'); body.append(...section.rows.map(tableRow));
			table.append(head, body); wrap.append(table); $('report-content').append(wrap);
		}
		const panel = document.createElement('section'); panel.id = 'report-changes';
		const heading = document.createElement('h3');
		heading.textContent = 'Changes since last saved run' + (data.diff.previousGeneratedAt ? ' (' + data.diff.previousGeneratedAt + ')' : ''); panel.append(heading);
		if (!data.diff.previousGeneratedAt || !data.diff.changes.length) {
			const note = document.createElement('p'); note.textContent = data.diff.previousGeneratedAt ? 'No changes.' : 'No saved run yet.'; panel.append(note);
		} else {
			const list = document.createElement('ul');
			for (const change of data.diff.changes) {
				const item = document.createElement('li'); item.textContent = change.rule + ' — ' + change.key + ': ' + change.before + ' → ' + change.after; list.append(item);
			}
			panel.append(list);
		}
		for (const text of data.diff.notes) { const note = document.createElement('p'); note.textContent = text; panel.append(note); }
		$('report-content').append(panel); $('report-save').disabled = false;
		$('report-status').textContent = saving ? 'Report saved (' + data.savedAt + ').' : 'Report complete.';
	} catch (error) { $('report-status').textContent = error.message; }
	finally { $('report-run').disabled = false; $('target').disabled = running; }
}
$('report-run').addEventListener('click', () => runReport());
$('report-save').addEventListener('click', () => runReport(true));
$('export').addEventListener('click', () => {
	const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;');
	const conversation = [...$('messages').children].map(article => '### ' + escape(article.querySelector('h3').textContent) + '\n\n' + [...article.children].slice(1).map(node => escape(node.textContent)).join('\n\n')).join('\n\n');
	const trace = [...$('trace').rows].map(row => '| ' + [...row.cells].map(cell => escape(cell.textContent).replace(/[\r\n]+/g, ' ')).join(' | ') + ' |').join('\n');
	const text = '# Conversation\n\n' + conversation + '\n\n## Tool trace\n\n| Name | Arguments | Status | Result bytes |\n| --- | --- | --- | --- |\n' + trace + '\n';
	const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
	const link = document.createElement('a'); link.href = url; link.download = 'piagent-conversation-' + new Date().toISOString().replace(/[:.]/g, '-') + '.md';
	link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('ask').addEventListener('submit', event => {
	event.preventDefault(); const question = $('question').value.trim();
	if (!question || running || !sessionId) return;
	$('question').value = ''; message('You', 'question', question); void ask(question);
});
$('question').addEventListener('keydown', event => {
	if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('ask').requestSubmit(); }
});
$('stop').addEventListener('click', () => controller?.abort());
$('target').addEventListener('change', async () => {
	try { await newSession(); } catch (error) { status(error.message); } finally { busy(false); }
});
$('refresh').addEventListener('click', health);
$('audit-refresh').addEventListener('click', audit);
const tabs = ['trace', 'audit', 'report'];
for (const [index, id] of tabs.entries()) {
	$(`${id}-tab`).addEventListener('click', () => tab(id));
	$(`${id}-tab`).addEventListener('keydown', event => {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
		tab(tabs[next]); $(`${tabs[next]}-tab`).focus();
	});
}
async function init() {
	if (!token) { status('Open the token URL printed by piagent web to connect.'); return; }
	try {
		const targets = await (await api('/api/targets')).json();
		for (const target of targets) {
			const option = document.createElement('option'); option.value = target.name;
			option.textContent = `${target.name} · ${target.environment} — ${target.description}`;
			$('target').append(option);
		}
		await newSession(); await health();
	} catch (error) { status(error.message); } finally { busy(false); }
}
void init();
