function el(tag, text) {
	const node = document.createElement(tag);
	if (text !== undefined) node.textContent = text;
	return node;
}

export function setupPanel(id, title, targets) {
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

export async function execute(view, task) {
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

