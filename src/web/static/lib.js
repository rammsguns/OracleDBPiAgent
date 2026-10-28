// Incremental SSE framing. Feed decoded chunks; only a blank line dispatches.
export function createSseParser(onEvent) {
	let buffer = '', event = '', data = [];
	function line(value) {
		if (value === '') {
			if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
			event = ''; data = [];
			return;
		}
		if (value.startsWith(':')) return;
		const colon = value.indexOf(':');
		const field = colon < 0 ? value : value.slice(0, colon);
		let content = colon < 0 ? '' : value.slice(colon + 1);
		if (content.startsWith(' ')) content = content.slice(1);
		if (field === 'event') event = content;
		if (field === 'data') data.push(content);
	}
	return {
		feed(chunk) {
			buffer += chunk;
			let start = 0;
			for (let i = 0; i < buffer.length; i++) {
				if (buffer[i] !== '\r' && buffer[i] !== '\n') continue;
				if (buffer[i] === '\r' && i === buffer.length - 1) break;
				line(buffer.slice(start, i));
				if (buffer[i] === '\r' && buffer[i + 1] === '\n') i++;
				start = i + 1;
			}
			buffer = buffer.slice(start);
		},
		end() {
			if (buffer.endsWith('\r')) this.feed('\n');
			buffer = ''; event = ''; data = [];
		},
	};
}

export function truncateArgs(args, limit = 300) {
	const text = typeof args === 'string' ? args : JSON.stringify(args) ?? '';
	if (limit <= 0) return '';
	return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

// Sequential tools allow matching each end to the earliest pending start.
export function updateTrace(rows, event, data) {
	if (event === 'tool_start') return [...rows, {
		name: String(data.name ?? ''), args: truncateArgs(data.args), status: 'running',
		error: '', resultBytes: null,
	}];
	if (event !== 'tool_end') return rows;
	const index = rows.findIndex(row => row.name === data.name && row.status === 'running');
	const next = rows.map(row => ({ ...row }));
	const row = { name: String(data.name ?? ''), args: '', status: data.isError ? 'error' : 'ok',
		error: String(data.error ?? '').split(/\r?\n/)[0], resultBytes: data.resultBytes ?? null };
	if (index < 0) next.push(row);
	else next[index] = { ...next[index], ...row, args: next[index].args };
	return next;
}
