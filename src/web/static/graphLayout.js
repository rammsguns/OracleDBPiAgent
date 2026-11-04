export const nodeWidth = 190;
export const columnGap = 160;

export function wrapLabel(text, measure, width = nodeWidth - 24) {
	const lines = [];
	let line = "";
	const tokens = String(text).match(/[^._\s]+[._]?|[._]|\s+/gu) || [];
	for (const token of tokens) {
		if (line && measure(line + token) > width) {
			lines.push(line);
			line = "";
		}
		for (const character of token) {
			if (line && measure(line + character) > width) {
				lines.push(line);
				line = "";
			}
			line += character;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function nodeText(node, measure, width) {
	const qualified = /^([A-Za-z][A-Za-z0-9_$#]*\.)([\s\S]*)$/.exec(node.label);
	const owner = qualified ? wrapLabel(qualified[1], text => measure(text) * 16 / 19, width - 24) : [];
	const lines = wrapLabel(qualified ? qualified[2] : node.label, measure, width - 24);
	const kind = node.title ? "Oracle-supplied" : node.displayKind || {
		job: "JOB", subprogram: "PROCEDURE", table: "TABLE", object: "OBJECT",
	}[node.kind];
	return { owner, lines, kind, height: 36 + owner.length * 20 + lines.length * 24 };
}

function graphLevels(graph) {
	const levels = new Map(graph.nodes.map(node => [node.id, 0]));
	// Ignore cycle-closing edges rather than pushing a cycle into empty columns.
	const ancestors = new Map(graph.nodes.map(node => [node.id, new Set()]));
	for (let pass = 0; pass < graph.nodes.length; pass++) {
		let changed = false;
		for (const edge of graph.edges) {
			if (!levels.has(edge.from) || !levels.has(edge.to) || edge.from === edge.to) continue;
			if (ancestors.get(edge.from).has(edge.to)) continue;
			const next = levels.get(edge.from) + 1;
			if (next > levels.get(edge.to)) {
				levels.set(edge.to, next);
				ancestors.get(edge.to).add(edge.from);
				for (const id of ancestors.get(edge.from)) ancestors.get(edge.to).add(id);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return levels;
}

function orderColumns(columns, edges, levels) {
	const neighbours = new Map([...levels.keys()].map(id => [id, []]));
	for (const edge of edges) {
		if (!neighbours.has(edge.from) || !neighbours.has(edge.to)) continue;
		neighbours.get(edge.from).push(edge.to);
		neighbours.get(edge.to).push(edge.from);
	}
	// Alternate barycenter sweeps; stable ties preserve deterministic ordering.
	for (let sweep = 0; sweep < 3; sweep++) {
		for (const direction of [1, -1]) {
			const ordered = direction === 1 ? columns : [...columns].reverse();
			for (const column of ordered) {
				const ranks = new Map(columns.flatMap(items => items.map((node, rank) => [node.id, rank])));
				const score = node => {
					const adjacent = neighbours.get(node.id).filter(id =>
						direction * (levels.get(node.id) - levels.get(id)) > 0);
					return adjacent.length
						? adjacent.reduce((sum, id) => sum + ranks.get(id), 0) / adjacent.length
						: ranks.get(node.id);
				};
				column.sort((left, right) => score(left) - score(right));
			}
		}
	}
}

function edgePorts(edges, positions, side) {
	const groups = new Map();
	for (const edge of edges) {
		const id = side === "out" ? edge.from : edge.to;
		if (!positions.has(id)) continue;
		if (!groups.has(id)) groups.set(id, []);
		groups.get(id).push(edge);
	}
	const ports = new Map();
	for (const [id, attached] of groups) {
		const position = positions.get(id);
		const otherCenter = edge => {
			const other = positions.get(side === "out" ? edge.to : edge.from);
			return other ? other.y + other.height / 2 : 0;
		};
		attached.sort((left, right) => otherCenter(left) - otherCenter(right));
		attached.forEach((edge, index) => {
			ports.set(edge, position.y + 10 + (position.height - 20) * (index + 1) / (attached.length + 1));
		});
	}
	return ports;
}

export function layoutGraph(graph, measure = text => [...text].length * 10) {
	const levels = graphLevels(graph);
	const columns = Array.from({ length: Math.max(0, ...levels.values()) + 1 }, () => []);
	for (const node of graph.nodes) columns[levels.get(node.id)].push(node);
	orderColumns(columns, graph.edges, levels);
	const positions = new Map();
	const widths = columns.map(column => column.some(node => node.kind === "job") ? 224 : nodeWidth);
	const heights = columns.map((column, level) => column.map(node => ({
		node, width: widths[level], ...nodeText(node, measure, widths[level]),
	})));
	const columnHeight = items => items.reduce((sum, item) => sum + item.height, 0) + Math.max(0, items.length - 1) * 32;
	const height = Math.max(100, ...heights.map(columnHeight)) + 30;
	for (const [level, items] of heights.entries()) {
		let y = 15 + (height - 30 - columnHeight(items)) / 2;
		for (const item of items) {
			const x = 15 + widths.slice(0, level).reduce((sum, width) => sum + width, 0) + level * columnGap;
			positions.set(item.node.id, { x, y, ...item });
			y += item.height + 32;
		}
	}
	return {
		positions,
		width: widths.reduce((sum, width) => sum + width, 0) + (columns.length - 1) * columnGap + 30,
		height,
		outgoing: edgePorts(graph.edges, positions, "out"),
		incoming: edgePorts(graph.edges, positions, "in"),
	};
}
