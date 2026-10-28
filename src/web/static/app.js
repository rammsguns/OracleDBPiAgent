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
function tab(auditSelected) {
	for (const [id, selected] of [['audit', auditSelected], ['trace', !auditSelected]]) {
		$(`${id}-tab`).setAttribute('aria-selected', String(selected));
		$(`${id}-tab`).tabIndex = selected ? 0 : -1; $(`${id}-panel`).hidden = !selected;
	}
	if (auditSelected) void audit();
}
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
$('trace-tab').addEventListener('click', () => tab(false));
$('audit-tab').addEventListener('click', () => tab(true));
for (const id of ['trace-tab', 'audit-tab']) $(id).addEventListener('keydown', event => {
	if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
		event.preventDefault(); const selected = event.key === 'End' || (event.key !== 'Home' && id === 'trace-tab');
		tab(selected); $(selected ? 'audit-tab' : 'trace-tab').focus();
	}
});
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
