const observers = new WeakMap();
/** Recheck after rendering, container resizing, and tab visibility changes. */
export function updateTableHints(content, selector) {
	observers.get(content)?.disconnect();
	const hints = [...content.querySelectorAll(selector)];
	const update = () => {
		for (const hint of hints) {
			const box = hint.parentElement;
			hint.hidden = box.scrollWidth <= box.clientWidth;
		}
	};
	update();
	const observer = new ResizeObserver(update);
	for (const hint of hints) {
		observer.observe(hint.parentElement);
		observer.observe(hint.parentElement.querySelector('table'));
	}
	observers.set(content, observer);
}
