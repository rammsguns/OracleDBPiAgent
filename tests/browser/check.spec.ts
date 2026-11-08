import { test, expect } from '@playwright/test';
test.afterEach(async ({page, request}) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
const hostile = '<img src=x onerror=alert(1)>';
const result = { version:1,capturedAt:'2026-11-07',status:'CRIT',targets:[{target:'d1-19c-lab',status:'CRIT',checks:['OK','WARN','CRIT','UNKNOWN','SKIPPED'].map(status => ({id:hostile,status,display:status==='SKIPPED'?'SKIPPED':'95%',threshold:{warn:85,crit:95},scope:'Physical standby CDB19S (read only with apply); This PDB (PIPDB1)',command:'piagent space --target d1-19c-lab',note:hostile}))}] };
for (const width of [390,1280]) for (const colorScheme of ['light','dark'] as const) test(`Check manual safe table ${width} ${colorScheme}`, async ({page}) => {
	await page.emulateMedia({colorScheme}); await page.setViewportSize({width,height:900}); let calls=0, selected='';
	await page.route('**/api/check?*', r => { calls++; selected=new URL(r.request().url()).searchParams.get('target')!; return r.fulfill({json:{result}}); });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#check-tab').click(); expect(calls).toBe(0);
	await page.locator('#check-target').selectOption('__all_targets__'); await page.locator('#check-run').click();
	await expect(page.locator('#check-status')).toContainText('Loaded'); expect(calls).toBe(1); expect(selected).toBe('__all_targets__');
	const content=page.locator('#check-content'); await expect(content.locator('th')).toHaveText(['Target','Check','Status','Value','Threshold WARN/CRIT','Scope','Drill down','Note']);
	await expect(content).toContainText('1 CRIT, 1 WARN, 1 UNKNOWN, 1 OK'); await expect(content).toContainText('Physical standby CDB19S (read only with apply)'); await expect(content).toContainText('SKIPPED'); await expect(content).toContainText(hostile); await expect(content.locator('img')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const contrast = await content.locator('.check-status').evaluateAll(cells => {
		const luminance = (color:string) => {
			const rgb = color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n => { const s=n/255; return s<=.04045?s/12.92:((s+.055)/1.055)**2.4; });
			return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
		};
		return cells.map(cell=>{const a=luminance(getComputedStyle(cell).color),b=luminance(getComputedStyle(cell.closest('section')!).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
	});
	for(const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
	const box=content.getByRole('region',{name:'Health checks'}); await expect(box).toHaveAttribute('tabindex','0');
	if(width===390) { await expect(box.locator('.operations-hint')).toBeVisible(); expect(await box.evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true); }
	await page.clock.install(); await page.clock.fastForward(180000); expect(calls).toBe(1);
	await page.locator('#check-target').selectOption('p1-19c-prod'); await expect(content).toBeEmpty();
});
test('Check cancels stale responses and recovers from size and busy errors', async ({page}) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#check-tab').click();
	let release!:()=>void; const pending=new Promise<void>(r=>release=r);
	await page.route('**/api/check?*',async r=>{await pending; await r.fulfill({json:{result}}).catch(()=>{});});
	await page.locator('#check-run').click(); await expect(page.locator('#check-cancel')).toBeEnabled(); await page.locator('#check-cancel').click(); release();
	await expect(page.locator('#check-status')).toHaveText('Cancelled.'); await expect(page.locator('#check-content')).toBeEmpty();
	for(const status of [413,429,500]) { await page.route('**/api/check?*',r=>r.fulfill({status,json:{}})); await page.locator('#check-run').click(); await expect(page.locator('#check-status')).toContainText(status===413?'size cap':status===429?'already running':'Request failed'); }
});
test('Check endpoint authenticates and validates before collecting',async ({request})=>{
	const url=new URL(process.env.PIAGENT_BROWSER_URL!),headers={Authorization:`Bearer ${url.hash.slice(7)}`};
	expect((await request.get(`${url.origin}/api/check`)).status()).toBe(401);
	expect((await request.post(`${url.origin}/api/check`,{headers})).status()).toBe(405);
	for(const query of ['unexpected=true','target=unknown']) expect((await request.get(`${url.origin}/api/check?${query}`,{headers})).status()).toBe(400);
});
