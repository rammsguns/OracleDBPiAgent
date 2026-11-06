import { test, expect } from '@playwright/test';
import { spaceFixture } from './space-fixture.js';
for(const width of [1280,390]) for(const colorScheme of ['light','dark'] as const) test(`Space layout ${width} ${colorScheme}`,async({page})=>{
	await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});
	let query='';await page.route('**/api/space?*',r=>{query=r.request().url();return r.fulfill({json:{result:spaceFixture(),markdown:'# Space'}});});
	await page.goto(process.env.PIAGENT_BROWSER_URL!);await page.locator('#space-tab').click();await page.locator('#space-owner').fill('APP');await page.locator('#space-run').click();
	await expect(page.locator('#space-status')).toHaveText('Loaded.');expect(query).toContain('owner=APP');
	await expect(page.locator('#space-content')).toContainText('APP.ORDERS.DOCUMENT');await expect(page.locator('#space-content')).toContainText('no recovery area configured');await expect(page.locator('#space-content img')).toHaveCount(0);
	await expect(page.locator('.space-bar')).toHaveAttribute('aria-label',/used.*allocated.*maximum/);await expect(page.locator('.space-threshold')).toHaveCount(2);
	expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
	for(const box of await page.locator('#space-content .table-scroll').all()) {
		expect(await box.evaluate(n=>{n.scrollLeft=n.scrollWidth;const last=n.querySelector('tr:last-child td:last-child')!;return last.getBoundingClientRect().right<=n.getBoundingClientRect().right+1;})).toBe(true);
	}
	const download=page.waitForEvent('download');await page.locator('#space-export').click();expect((await download).suggestedFilename()).toBe('space.md');
	await page.locator('#space-target').selectOption('p1-19c-prod');await expect(page.locator('#space-content')).toBeEmpty();await expect(page.locator('#space-export')).toBeDisabled();
});
test('Space failures, partial evidence and stale response',async({page})=>{
	await page.goto(process.env.PIAGENT_BROWSER_URL!);await page.locator('#space-tab').click();
	for(const status of [500,413,429]) {await page.route('**/api/space?*',r=>r.fulfill({status,json:{message:'Failed'}}));await page.locator('#space-run').click();await expect(page.locator('#space-status')).toContainText(status===413?'size cap':status===429?'already running':'Request failed');await expect(page.locator('#space-export')).toBeDisabled();}
	const fixture=spaceFixture();fixture.status='partial';fixture.sections.temp.status='unavailable';fixture.sections.undo.evidence.truncated=true;
	await page.route('**/api/space?*',r=>r.fulfill({json:{result:fixture,markdown:'partial'}}));await page.locator('#space-run').click();await expect(page.locator('#space-status')).toContainText('incomplete');await expect(page.locator('#space-content')).toContainText('Row cap reached');
	let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});await page.route('**/api/space?*',async r=>{await pending;await r.fulfill({json:{result:fixture,markdown:'stale'}});});await page.locator('#space-run').click();await page.locator('#space-target').selectOption('p1-19c-prod');release();await expect(page.locator('#space-run')).toBeEnabled();await expect(page.locator('#space-content')).toBeEmpty();await expect(page.locator('#space-export')).toBeDisabled();
});
test('arrow navigation follows DOM order including Space in both directions',async({page})=>{
	await page.goto(process.env.PIAGENT_BROWSER_URL!);const tabs=page.getByRole('tab');await expect(page.locator('#space-run')).toBeAttached();const ids=await tabs.evaluateAll(nodes=>nodes.map(n=>n.id));
	await tabs.first().click();await tabs.first().focus();
	for(let i=1;i<=ids.length;i++){await page.keyboard.press('ArrowRight');await expect(page.locator('#'+ids[i%ids.length])).toBeFocused();await expect(page.locator('#'+ids[i%ids.length])).toHaveAttribute('aria-selected','true');}
	for(let i=ids.length-1;i>=0;i--){await page.keyboard.press('ArrowLeft');await expect(page.locator('#'+ids[i])).toBeFocused();}
	await page.keyboard.press('End');await expect(tabs.last()).toBeFocused();await page.keyboard.press('Home');await expect(tabs.first()).toBeFocused();
});

for (const panel of ['space', 'dbsessions']) test(`${panel} scroll hints follow actual overflow on render and resize`, async ({ page }) => {
	const { dbSessionsFixture } = await import('./dbsessions-fixture.js');
	const result = panel === 'space' ? spaceFixture() : dbSessionsFixture();
	if (panel === 'space') (result as ReturnType<typeof spaceFixture>).sections.segments.rows = [{ owner: 'APP', name: 'ORDERS' }];
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.route(`**/api/${panel === 'space' ? 'space' : 'db-sessions'}?*`, r => r.fulfill({ json: { result, markdown: '# Evidence' } }));
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator(`#${panel}-tab`).click(); await page.locator(`#${panel}-run`).click();
	await expect(page.locator(`#${panel}-status`)).toHaveText('Loaded.');
	const narrow = page.getByRole('region', { name: panel === 'space' ? 'Top segments' : 'Time model', exact: true });
	await expect.poll(() => narrow.evaluate(n => n.scrollWidth > n.clientWidth)).toBe(false);
	await expect(narrow.locator('p')).toBeHidden();
	const wide = page.getByRole('region', { name: panel === 'space' ? 'Top segments' : 'Wait events', exact: true });
	for (const width of [390, 1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		if (width === 390) {
			await expect.poll(() => wide.evaluate(n => n.scrollWidth > n.clientWidth)).toBe(true);
			await expect(wide.locator('p')).toBeVisible();
		} else await expect(narrow.locator('p')).toBeHidden();
	}
});
