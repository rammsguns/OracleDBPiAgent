const approved = new Set(['d1-19c-lab', 'p1-19c-prod']);
function node(tag, text) {
	const element = document.createElement(tag);
	if (text !== undefined) element.textContent = text;
	return element;
}
export function initDrift(api, targets) {
	const panel = document.getElementById('drift-panel');
	const form = node('form');
	const picker = (id, label, values) => {
		const select = node('select'); select.id = id;
		for (const [value, text] of values) {
			const option = node('option', text); option.value = value; select.append(option);
		}
		const caption = node('label', label); caption.htmlFor = id; form.append(caption, select);
		return select;
	};
	const choices = targets.filter(t => approved.has(t.name)).map(t => [t.name, t.name]);
	const left = picker('drift-left', 'Left target', choices);
	const right = picker('drift-right', 'Right target', choices);
	if (choices.length > 1) right.selectedIndex = 1;
	const scope = picker('drift-scope', 'Scope', [['parameters', 'Parameters'], ['schema', 'Schema'], ['objects', 'Objects']]);
	const label = node('label', 'Owner'); label.htmlFor = 'drift-owner';
	const owner = node('input'); owner.id = 'drift-owner'; owner.maxLength = 128; owner.value = 'SH';
	owner.pattern = '[A-Za-z][A-Za-z0-9_$#]{0,127}';
	label.hidden = owner.hidden = true; owner.disabled = true;
	form.append(label, owner);
	scope.addEventListener('change', () => {
		label.hidden = owner.hidden = scope.value === 'parameters';
		owner.disabled = scope.value === 'parameters'; owner.required = !owner.disabled;
	});
	const run = node('button', 'Run drift'); run.id = 'drift-run'; run.type = 'submit'; run.disabled = !choices.length;
	const status = node('p'); status.id = 'drift-status'; status.setAttribute('role', 'status');
	const content = node('div'); content.id = 'drift-content';
	form.append(run); panel.append(form, status, content);
	form.addEventListener('submit', async event => {
		event.preventDefault();
		run.disabled = true; status.textContent = 'Running drift…'; content.replaceChildren();
		try {
			const response = await api('/api/drift', { method: 'POST', body: JSON.stringify({
				left: left.value, right: right.value, scope: scope.value === 'parameters' ? scope.value : scope.value + ':' + owner.value,
			}) });
			const result = await response.json();
			content.append(node('p', result.left + ' → ' + result.right + ' · ' + result.scope));
			for (const section of result.sections) {
				content.append(node('h3', section.name), node('p', 'Source: ' + section.source));
				for (const note of section.notes) content.append(node('p', note));
				if (section.status === 'unavailable') { content.append(node('p', 'Unavailable; comparison withheld.')); continue; }
				for (const [key, title] of [['onlyLeft', 'Only left'], ['onlyRight', 'Only right'], ['different', 'Different']]) {
					const details = node('details');
					details.append(node('summary', title + ' (' + section[key].length + ')'));
					if (!section[key].length) details.append(node('p', 'None.'));
					for (const entry of section[key]) details.append(node('pre', JSON.stringify(entry, null, 2)));
					content.append(details);
				}
			}
			status.textContent = (result.complete ? 'Complete' : 'Incomplete') + ' comparison. ' + (result.hasDrift ? 'Drift found.' : 'No drift found in available sections.');
		} catch (error) {
			status.textContent = error.status === 429 ? 'A drift comparison is already running. Try again shortly.' :
				error.status === 413 ? 'Drift output is too large. Choose a narrower scope.' : error.message;
		} finally { run.disabled = false; }
	});
}
