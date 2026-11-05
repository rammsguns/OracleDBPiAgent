import { setupPanel, execute } from "./panel.js";
import { renderAlertEvidence } from "./alertlog.js";
import { layoutGraph, columnGap } from "./graphLayout.js";

function el(tag, text) {
	const element = document.createElement(tag);
	if (text !== undefined) element.textContent = text;
	return element;
}

function svgEl(tag, attrs = {}, text) {
	const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
	for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
	if (text !== undefined) element.textContent = text;
	return element;
}

const edgeStyles = {
	calls: { color: "#7853b5", dash: "2 4" },
	contains: { color: "#64748b", dash: "" },
	reads: { color: "#1684b3", dash: "7 4" },
	writes: { color: "#c26516", dash: "12 3 2 3" },
	"depends-on": { color: "#a04d78", dash: "3 3" },
	"job runs": { color: "#25845b", dash: "10 4" },
};

function edgeKind(edge, nodes) {
	if (/^(SELECT|reads)$/i.test(edge.label || edge.kind)) return "reads";
	if (/^(INSERT|UPDATE|DELETE|MERGE|writes)$/i.test(edge.label || edge.kind)) return "writes";
	if (nodes.get(edge.from)?.kind === "job") return "job runs";
	if (edge.kind === "contains") return "contains";
	if (edge.kind === "references" || edge.kind === "calls") return "calls";
	return "depends-on";
}

function collapseOracleNodes(graph) {
	const supplied = graph.nodes.filter(node =>
		(node.kind === "object" || node.kind === "table") && /^(SYS|PUBLIC)\./.test(node.label));
	if (!supplied.length) return graph;
	const hidden = new Set(supplied.map(node => node.id));
	let id = "oracle-supplied";
	while (graph.nodes.some(node => node.id === id)) id += "_";
	const nodes = graph.nodes.filter(node => !hidden.has(node.id));
	nodes.push({
		id,
		kind: "object",
		label: `Oracle-supplied (${supplied.length})`,
		title: supplied.map(node => node.label).join("\n"),
	});
	const edges = graph.edges.map(edge => ({
		...edge,
		from: hidden.has(edge.from) ? id : edge.from,
		to: hidden.has(edge.to) ? id : edge.to,
	})).filter(edge => edge.from !== edge.to);
	return { nodes, edges: [...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()] };
}

function graphLegend() {
	const legend = el("ul");
	legend.className = "graph-legend";
	legend.setAttribute("aria-label", "Edge styles");
	for (const [kind, style] of Object.entries(edgeStyles)) {
		const item = el("li");
		const swatch = svgEl("svg", { viewBox: "0 0 32 12", "aria-hidden": "true" });
		swatch.append(svgEl("path", {
			d: "M0 6 H32", stroke: style.color, "stroke-width": 2, "stroke-dasharray": style.dash,
		}));
		item.append(swatch, document.createTextNode(kind));
		legend.append(item);
	}
	return legend;
}

function drawEdge(svg, edge, layout, nodes) {
	const from = layout.positions.get(edge.from);
	const to = layout.positions.get(edge.to);
	if (!from || !to) return;
	const x1 = from.x + from.width;
	const y1 = layout.outgoing.get(edge);
	const x2 = to.x;
	const y2 = layout.incoming.get(edge);
	const bend = columnGap * 0.45;
	const kind = edgeKind(edge, nodes);
	const style = edgeStyles[kind];
	const path = svgEl("path", {
		d: `M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}`,
		fill: "none",
		stroke: style.color,
		"stroke-width": 2,
		"stroke-dasharray": style.dash,
		"data-edge-kind": kind,
		"data-from": edge.from,
		"data-to": edge.to,
	});
	path.append(svgEl("title", {}, `${kind} · ${edge.kind}${edge.label ? " · " + edge.label : ""}`));
	svg.append(path);
}

function drawNode(svg, node, position) {
	const group = svgEl("g", { "data-node-id": node.id });
	const box = svgEl("rect", {
		x: position.x, y: position.y, width: position.width, height: position.height, rx: 6,
		fill: "var(--graph-fill, #edf5f6)", stroke: "currentColor",
	});
	group.append(svgEl("title", {}, node.title ?? node.label), box);
	const x = position.x + 12;
	group.append(svgEl("text", {
		x, y: position.y + 21, "font-size": 14, class: "node-kind",
	}, position.kind));
	let y = position.y + 43;
	for (const line of position.owner) {
		group.append(svgEl("text", { x, y, "font-size": 16, class: "node-owner" }, line));
		y += 20;
	}
	const text = svgEl("text", { x, y, "font-size": 19, class: "node-label" });
	for (const [index, line] of position.lines.entries()) {
		text.append(svgEl("tspan", { x, dy: index ? 24 : 0 }, line));
	}
	group.append(text);
	svg.append(group);
}

export function drawGraph(graph) {
	const view = collapseOracleNodes(graph);
	const wrap = el("div");
	wrap.className = "graph-view";
	const scroll = el("div");
	scroll.className = "graph-scroll";
	const svg = svgEl("svg", { role: "img", "aria-label": "Evidence dependency graph", width: "100%" });
	const context = document.createElement("canvas").getContext("2d");
	context.font = "19px system-ui, sans-serif";
	const layout = layoutGraph(view, text => context.measureText(text).width);
	svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
	const nodes = new Map(view.nodes.map(node => [node.id, node]));
	for (const edge of view.edges) drawEdge(svg, edge, layout, nodes);
	for (const node of view.nodes) drawNode(svg, node, layout.positions.get(node.id));
	scroll.append(svg);
	wrap.append(graphLegend(), scroll);
	return wrap;
}

function table(section) {
	const wrap = el("div");
	wrap.className = "table-scroll";
	const notes = [
		section.status,
		section.view,
		section.truncated ? "Cap reached (partial)" : "",
		...(section.attempts || []).map(attempt => attempt.code),
	];
	wrap.append(el("p", notes.filter(Boolean).join(" · ")));
	const rows = section.rows || [];
	if (!rows.length) {
		wrap.append(el("p", "No rows returned in visible evidence."));
		return wrap;
	}
	const columns = section.columns || Object.keys(rows[0]);
	const result = el("table");
	const head = el("tr");
	for (const column of columns) head.append(el("th", column));
	result.append(head);
	for (const row of rows) {
		const tr = el("tr");
		const values = Array.isArray(row) ? row : columns.map(column => row[column]);
		for (const value of values) {
			const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
			tr.append(el("td", text));
		}
		result.append(tr);
	}
	wrap.append(result);
	return wrap;
}

function renderDocument(content, result) {
	content.append(
		el("h3", result.owner + "." + result.name),
		el("p", result.complete ? "Complete dictionary evidence" : "Incomplete dictionary evidence"),
		drawGraph({
			...result.graph,
			nodes: result.graph.nodes.map(node => ({
				...node,
				displayKind: node.label === result.owner + "." + result.name
					? result.objects.rows.find(object => !object.type.endsWith("BODY"))?.type || node.displayKind
					: node.displayKind,
			})),
		}),
	);
	for (const signature of result.signatures) {
		content.append(
			el("h4", signature.signature),
			el("p", signature.comments || signature.declaration),
			el("pre", JSON.stringify(signature.tables, null, 2)),
		);
	}
	const sections = ["objects", "errors", "tables", "callers", "jobs", "source", "dependencies", "arguments"];
	for (const key of sections) {
		const details = el("details");
		const section = Array.isArray(result[key]) ? { rows: result[key] } : result[key];
		details.append(el("summary", key), table(section));
		content.append(details);
	}
}

function initPlsql(api, targets) {
	const view = setupPanel("plsql", "List objects", targets);
	const owner = view.field("input", "owner", "Owner filter (optional)");
	const objects = view.field("select", "object", "PL/SQL object");
	owner.maxLength = 128;
	const doc = el("button", "Document object");
	doc.type = "button";
	doc.id = "plsql-doc";
	view.form.append(doc);
	async function listObjects() {
		const params = new URLSearchParams({ target: view.target.value, owner: owner.value });
		const result = await (await api("/api/plsql/list?" + params)).json();
		objects.replaceChildren();
		for (const object of result.rows) {
			const option = el("option", `${object.owner}.${object.name} · ${object.type} · ${object.status}`);
			option.value = object.owner + "." + object.name;
			objects.append(option);
		}
		view.content.append(table(result));
	}
	async function documentObject() {
		const params = new URLSearchParams({ target: view.target.value, object: objects.value });
		const result = await (await api("/api/plsql/doc?" + params)).json();
		renderDocument(view.content, result);
	}
	view.form.addEventListener("submit", event => {
		event.preventDefault();
		void execute(view, listObjects);
	});
	view.target.addEventListener("change", () => {
		objects.replaceChildren();
		view.content.replaceChildren();
	});
	doc.addEventListener("click", () => {
		if (!objects.value) return;
		void execute(view, documentObject);
	});
}

function renderTriageIssue(content, issue) {
	content.append(el("h3", "Ranked hypotheses"));
	for (const hypothesis of issue.hypotheses) {
		content.append(el("h4", hypothesis.rank + ". " + hypothesis.title));
		for (const evidence of hypothesis.evidence) content.append(el("p", evidence));
	}
	content.append(el("h3", "Suggested fixes (not executed)"));
	for (const suggestion of issue.suggestions) content.append(el("p", suggestion));
	for (const note of [...issue.limitations, ...issue.concurrency]) content.append(el("p", note));
	for (const excerpt of issue.excerpts) {
		const title = excerpt.object + " line " + excerpt.line + " · " + excerpt.subprogram;
		const source = excerpt.source.map(line => line.line + ": " + line.text).join("");
		content.append(el("h4", title), el("pre", excerpt.statement + "\n" + source));
	}
	content.append(el("h3", "Debug checklist and evidence"));
	for (const [index, check] of issue.checks.entries()) {
		content.append(
			el("h4", (index + 1) + ". " + check.label),
			el("pre", check.sql + "\nBinds: " + JSON.stringify(check.binds)),
			table(check),
		);
	}
	content.append(drawGraph(issue.graph));
}

function downloadMarkdown(markdown) {
	const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
	const link = el("a");
	link.href = url;
	link.download = "triage.md";
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initTriage(api, targets) {
	const view = setupPanel("triage", "Run triage", targets);
	const issue = view.field("textarea", "issue", "Issue text");
	const since = view.field("input", "since", "Since (m/h/d, at most 30d)");
	issue.rows = 8;
	issue.required = true;
	since.value = "24h";
	view.form.append(view.run);
	const download = el("button", "Download Markdown");
	download.type = "button";
	download.id = "triage-export";
	download.disabled = true;
	view.panel.append(download);
	let markdown = "";
	async function runTriage() {
		const options = { target: view.target.value, issue: issue.value, since: since.value };
		const response = await api("/api/triage", { method: "POST", body: JSON.stringify(options) });
		const result = await response.json();
		markdown = result.markdown;
		if (result.result.alertLog) renderAlertEvidence(view.content, result.result.alertLog);
		for (const item of result.result.issues) renderTriageIssue(view.content, item);
		download.disabled = false;
	}
	download.addEventListener("click", () => downloadMarkdown(markdown));
	view.form.addEventListener("submit", event => {
		event.preventDefault();
		download.disabled = true;
		void execute(view, runTriage);
	});
}

export function initInsight(api, targets) {
	initPlsql(api, targets);
	initTriage(api, targets);
}
