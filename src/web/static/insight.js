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

function drawEdge(svg, edge, positions) {
	const from = positions.get(edge.from);
	const to = positions.get(edge.to);
	if (!from || !to) return;
	const x1 = from.x + 255;
	const y1 = from.y + 30;
	const x2 = to.x;
	const y2 = to.y + 30;
	const path = svgEl("path", {
		d: `M${x1} ${y1} C${x1 + 40} ${y1},${x2 - 40} ${y2},${x2} ${y2}`,
		fill: "none",
		stroke: "currentColor",
	});
	const label = svgEl("text", {
		x: (x1 + x2) / 2,
		y: (y1 + y2) / 2 - 6,
		"font-size": 12,
	}, "→ " + (edge.label || edge.kind || "trace"));
	svg.append(path);
	svg.append(label);
}

function drawNode(svg, node, position) {
	const group = svgEl("g");
	const box = svgEl("rect", {
		x: position.x,
		y: position.y,
		width: 255,
		height: 65,
		rx: 6,
		fill: "var(--graph-fill, #edf5f6)",
		stroke: "currentColor",
	});
	group.append(svgEl("title", {}, node.label), box);
	const text = svgEl("text", {
		x: position.x + 8,
		y: position.y + 20,
		"font-size": 13,
	});
	const label = String(node.label);
	for (let i = 0; i < Math.min(label.length, 90); i += 30) {
		const line = svgEl("tspan", {
			x: position.x + 8,
			dy: i ? 17 : 0,
		}, label.slice(i, i + 30));
		text.append(line);
	}
	group.append(text);
	svg.append(group);
}

export function drawGraph(graph) {
	const wrap = el("div");
	wrap.className = "graph-scroll";
	const svg = svgEl("svg", { role: "img", "aria-label": "Evidence dependency graph" });
	const levels = new Map(graph.nodes.map(node => [node.id, 0]));
	// Bound relaxation so cyclic dependencies cannot keep moving nodes right.
	for (let pass = 0; pass < Math.min(graph.nodes.length, 8); pass++) {
		let changed = false;
		for (const edge of graph.edges) {
			if (levels.has(edge.from) && levels.has(edge.to)) {
				const next = Math.min(8, levels.get(edge.from) + 1);
				if (next > levels.get(edge.to)) {
					levels.set(edge.to, next);
					changed = true;
				}
			}
		}
		if (!changed) break;
	}
	const counts = new Map();
	const positions = new Map();
	for (const node of graph.nodes) {
		const level = levels.get(node.id);
		const row = counts.get(level) || 0;
		counts.set(level, row + 1);
		positions.set(node.id, { x: 15 + level * 320, y: 30 + row * 120 });
	}
	const width = 300 + Math.max(0, ...levels.values()) * 320;
	const height = Math.max(140, ...[...counts.values()].map(count => count * 120));
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.style.width = width + "px";
	for (const edge of graph.edges) drawEdge(svg, edge, positions);
	for (const node of graph.nodes) drawNode(svg, node, positions.get(node.id));
	wrap.append(svg);
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

function setupPanel(id, title, targets) {
	const panel = document.getElementById(id + "-panel");
	const form = el("form");
	function field(tag, name, label) {
		const input = el(tag);
		input.id = id + "-" + name;
		const caption = el("label", label);
		caption.htmlFor = input.id;
		form.append(caption, input);
		return input;
	}
	const target = field("select", "target", "Target");
	const approved = targets.filter(item => ["d1-19c-lab", "p1-19c-prod"].includes(item.name));
	for (const item of approved) {
		const option = el("option", item.name);
		option.value = item.name;
		target.append(option);
	}
	const status = el("p");
	status.id = id + "-status";
	status.setAttribute("role", "status");
	const content = el("div");
	content.id = id + "-content";
	const run = el("button", title);
	run.id = id + "-run";
	form.append(run);
	panel.append(form, status, content);
	return { panel, form, field, target, status, content, run };
}

async function execute(view, task) {
	view.run.disabled = true;
	view.status.textContent = "Running…";
	view.content.replaceChildren();
	try {
		await task();
		view.status.textContent = "Loaded. Check evidence availability and caps below.";
	} catch (error) {
		view.status.textContent = error.status === 429
			? "An insight request is already running. Try again shortly."
			: error.status === 413
				? "Input or output exceeds the size cap. Narrow the request."
				: error.message;
	} finally {
		view.run.disabled = false;
	}
}

function renderDocument(content, result) {
	content.append(
		el("h3", result.owner + "." + result.name),
		el("p", result.complete ? "Complete dictionary evidence" : "Incomplete dictionary evidence"),
		drawGraph(result.graph),
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
