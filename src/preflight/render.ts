export function renderFeatureSummary(views: readonly { feature: string; view: string; status: string }[]): string {
	const features = new Map<string, { missing: Set<string>; notApplicable: Set<string> }>();
	for (const view of views) {
		const entry = features.get(view.feature) ?? { missing: new Set<string>(), notApplicable: new Set<string>() };
		if (view.status === 'missing') entry.missing.add(view.view);
		if (view.status === 'not-applicable') entry.notApplicable.add(view.view);
		features.set(view.feature, entry);
	}
	return [...features].map(([name, entry]) => `${name}: ${entry.missing.size ? `${entry.missing.size} missing: ${[...entry.missing].join(', ')}` : 'ok'}${entry.notApplicable.size ? `; ${entry.notApplicable.size} not-applicable` : ''}`).join('\n');
}
