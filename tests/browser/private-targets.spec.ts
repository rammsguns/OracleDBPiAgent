import { test, expect } from '@playwright/test';

test('all target selectors use the configured private list', async ({ page }) => {
	const names = ['lab-d1', 'lab-p1', 'lab-c1'];
	await page.route('**/api/targets', route => route.fulfill({ json: names.map(name => ({ name, environment: 'development', description: 'Private alias' })) }));
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	for (const id of ['target', 'check-target', 'backup-target', 'jobs-target', 'top-target', 'plsql-target', 'triage-target', 'alertlog-target', 'sql-target', 'security-target', 'dbsessions-target', 'space-target', 'drift-left', 'drift-right']) {
		const values = await page.locator('#' + id + ' option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(value => value && value !== '__all_targets__'));
		expect(values, id).toEqual(names);
	}
	await page.close();
});
