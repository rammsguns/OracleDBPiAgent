const value = n => n === null ? '—' : Number(n.toFixed(2)).toString();
function text(tag, content) {
	const node = document.createElement(tag); node.textContent = content; return node;
}
function sparkline(series) {
	const ns = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(ns, 'svg');
	svg.setAttribute('viewBox', '0 0 240 56'); svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', `${series.label}: oldest to newest; gaps indicate missing observations`);
	svg.classList.add('sparkline');
	const values = series.points.map(p => p.value).filter(n => n !== null);
	if (!values.length) {
		const title = document.createElementNS(ns, 'title'); title.textContent = 'No observations'; svg.append(title); return svg;
	}
	const min = Math.min(...values), range = Math.max(...values) - min;
	let previous = null;
	series.points.forEach((point, index) => {
		if (point.value === null) { previous = null; return; }
		const x = 4 + index * 232 / Math.max(1, series.points.length - 1);
		const y = range ? 52 - (point.value - min) * 48 / range : 28;
		// A source change is also a break: it cannot imply a comparable trend.
		if (previous && previous.source === point.source) {
			const line = document.createElementNS(ns, 'line');
			for (const [key, n] of Object.entries({ x1: previous.x, y1: previous.y, x2: x, y2: y })) line.setAttribute(key, String(n));
			svg.append(line);
		}
		const dot = document.createElementNS(ns, 'circle');
		dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '3');
		const title = document.createElementNS(ns, 'title'); title.textContent = `${point.generatedAt}: ${value(point.value)} ${series.unit}`;
		dot.append(title); svg.append(dot); previous = { x, y, source: point.source };
	});
	return svg;
}
export function renderHistory(container, data) {
	container.replaceChildren();
	for (const note of data.notes) container.append(text('p', note));
	if (!data.runs) return;
	container.append(text('p', 'Oldest → newest. Each sparkline uses its own scale. — means unavailable or not comparable.'));
	for (const series of data.series) {
		const card = document.createElement('article'); card.className = 'history-series';
		card.append(text('h4', series.label));
		const flag = text('p', series.worsening ? 'Worsening' : 'No worsening flagged');
		if (series.worsening) flag.className = 'unverified';
		card.append(flag, sparkline(series), text('p', `Unit: ${series.unit} · First: ${value(series.first)} · Last: ${value(series.last)} · Min: ${value(series.min)} · Max: ${value(series.max)} · Change: ${value(series.change)}`));
		container.append(card);
	}
	const details = document.createElement('details'); details.append(text('summary', 'Section availability by saved run'));
	for (const run of data.availability) details.append(text('p', `${run.generatedAt}: unavailable: ${run.unavailable.join(', ') || 'none'}; missing: ${run.missing.join(', ') || 'none'}`));
	container.append(details);
}
