import { test, expect } from '@playwright/test';
import { evil } from './insight-fixture.js';
test.afterEach(async ({ page, request }) => { await page.close(); await request.get(process.env.PIAGENT_BROWSER_CONTROL! + '/expire'); });
test('PL/SQL tab, document, layered SVG, literal hostile labels at phone width', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 }); await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator('#plsql-tab').click(); await page.locator('#plsql-owner').fill('SHOPAPP'); await page.locator('#plsql-run').click();
	await expect(page.locator('#plsql-object option')).toHaveCount(1); await page.locator('#plsql-doc').click();
	await expect(page.locator('#plsql-content .graph-scroll > svg')).toHaveCount(1);
	await expect(page.locator('#plsql-content svg g title').first()).toHaveText(evil);
	await expect(page.locator('#plsql-content svg .node-label').first()).toContainText(evil);
	await expect(page.locator('#plsql-content')).toContainText('Incomplete dictionary');
	await expect(page.locator('#plsql-content script, #plsql-content img')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('triage hypotheses, fixes, SQL, evidence, trace and Markdown download', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await expect(page.locator("#triage-since")).toHaveValue("24h");
	await page.locator("#triage-since").fill("7d");
	await page.locator("#triage-issue").fill("ORA-02292");
	const response = page.waitForResponse(r => r.url().endsWith("/api/triage"));
	await page.locator("#triage-run").click();
	expect((await response).request().postDataJSON()).toMatchObject({ since: "7d", issue: "ORA-02292" });
	await expect(page.locator('#triage-content')).toContainText('Foreign key child rows');
	await expect(page.locator('#triage-content')).toContainText('Review retention policy');
	await expect(page.locator('#triage-content pre')).toContainText('SELECT * FROM DBA_CONSTRAINTS');
	await expect(page.locator('#triage-content > .table-scroll td')).toHaveText(evil);
	await expect(page.locator('#triage-content .graph-scroll > svg')).toHaveCount(1);
	const download = page.waitForEvent('download'); await page.locator('#triage-export').click(); const file = await download; expect(file.suggestedFilename()).toBe('triage.md');
	const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk); expect(Buffer.concat(chunks).toString()).toContain('Foreign key child rows');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expect(page.locator('#triage-content script')).toHaveCount(0);
});
test('insight errors are shown and buttons recover', async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await page.locator('#triage-tab').click();
	await page.locator('#triage-issue').fill('ORA-02292');
	for (const status of [429, 413, 500]) {
		await page.route('**/api/triage', route => route.fulfill({ status, contentType: 'application/json', body: '{"message":"Request failed"}' }));
		await page.locator('#triage-run').click(); await expect(page.locator('#triage-status')).toContainText(status === 429 ? 'already running' : status === 413 ? 'size cap' : 'Request failed');
		await expect(page.locator('#triage-run')).toBeEnabled(); await expect(page.locator('#triage-export')).toBeDisabled();
	}
});
test('web slash triage prepares evidence for one fake prompt; normal chat still works', async ({ page, request }) => {
	const before = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json();
	await page.goto(process.env.PIAGENT_BROWSER_URL!); await expect(page.locator('#question')).toBeEnabled();
	await page.locator('#question').fill('/triage --since 7d ORA-02292'); await page.locator('#send').click();
	await expect(page.locator('#messages')).toContainText('Final answer');
	const after = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json(); expect(after.prompts - before.prompts).toBe(1); expect(after.lastQuestion).toContain('Foreign key child rows'); expect(after.lastQuestion).toContain('Do not call tools');
	expect(JSON.parse(after.lastQuestion.split('\n')[1])[0]).toMatchObject({ since: '7d', issue: 'ORA-02292' });
});

test("web chat rejects invalid windows with usage and no model prompt", async ({ page, request }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await expect(page.locator("#question")).toBeEnabled();
	const before = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json();
	for (const window of ["31d", "0h", "oops"]) {
		await page.locator("#question").fill(`/triage --since ${window} ORA-02292`);
		const response = page.waitForResponse(r => /\/api\/sessions\/[^/]+\/ask$/.test(new URL(r.url()).pathname));
		await page.locator("#send").click();
		expect((await response).status()).toBe(400);
		await expect(page.locator("#status")).toContainText("Usage: /triage [--since <duration>] <issue text>");
		await expect(page.locator("#status")).toContainText("at most 30d");
		await expect(page.locator("#send")).toBeEnabled();
	}
	const after = await (await request.get(process.env.PIAGENT_BROWSER_CONTROL!)).json();
	expect(after.prompts).toBe(before.prompts);
});

test("graph collapses Oracle dependencies, distinguishes operations and fits a desktop panel", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator("#plsql-tab").click();
	await page.locator("#plsql-run").click();
	await expect(page.locator("#plsql-object option")).toHaveCount(1);
	await page.locator("#plsql-doc").click();
	const graph = page.locator("#plsql-content .graph-scroll > svg");
	await expect(graph.locator("g")).toHaveCount(6);
	await expect(graph.locator('[data-node-id="oracle-supplied"] title')).toContainText("SYS.STANDARD");
	await expect(graph.locator('[data-node-id="oracle-supplied"] title')).toContainText("PUBLIC.DBMS_RANDOM");
	await expect(graph.locator('[data-node-id="oracle-supplied"] title')).toContainText("SYS." + evil);
	await expect(graph.locator('[data-node-id="oracle-supplied"] .node-label')).toHaveText("Oracle-supplied (3)");
	await expect(graph.locator('[data-node-id="object:SYS.STANDARD"]')).toHaveCount(0);
	await expect(page.locator("#plsql-content .graph-legend li")).toHaveCount(6);
	await expect(page.locator("#plsql-content .graph-legend")).toContainText("reads");
	await expect(page.locator("#plsql-content .graph-legend")).toContainText("writes");
	await expect(graph.locator('path[data-edge-kind="writes"] title')).toContainText("INSERT");
	await expect(graph.locator('path[data-edge-kind="reads"] title').first()).toContainText("SELECT");
	expect(await graph.locator('path[data-edge-kind="writes"]').getAttribute("stroke"))
		.not.toBe(await graph.locator('path[data-edge-kind="reads"]').first().getAttribute("stroke"));
	expect(await graph.locator('path[data-edge-kind="writes"]').getAttribute("stroke-dasharray"))
		.not.toBe(await graph.locator('path[data-edge-kind="reads"]').first().getAttribute("stroke-dasharray"));
	expect(await graph.locator('path[data-edge-kind="writes"]').getAttribute("d"))
		.not.toBe(await graph.locator('path[data-edge-kind="reads"]').last().getAttribute("d"));
	await expect(graph.locator(":scope > text")).toHaveCount(0);
	await expect(graph.locator("script, img")).toHaveCount(0);
	expect(await graph.evaluate(svg => {
		const parent = svg.parentElement!;
		return parent.scrollWidth <= parent.clientWidth && svg.getBoundingClientRect().width <= parent.clientWidth;
	})).toBe(true);
});
test("triage run follows a normally sized Since input", async ({ page }) => {
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator("#triage-tab").click();
	const since = await page.locator("#triage-since").boundingBox();
	const run = await page.locator("#triage-run").boundingBox();
	expect(since!.width).toBeGreaterThan(120);
	expect(since!.width).toBeLessThan(250);
	expect(run!.y).toBeGreaterThanOrEqual(since!.y + since!.height);
});
test("WORKLOAD uses wide columns, compact tagged nodes and separate edge ports", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator("#plsql-tab").click();
	await page.locator("#plsql-owner").fill("WORKLOAD_FIXTURE");
	await page.locator("#plsql-run").click();
	await expect(page.locator("#plsql-object option")).toHaveCount(1);
	await page.locator("#plsql-doc").click();
	const graph = page.locator("#plsql-content .graph-scroll > svg");
	const job = graph.locator('[data-node-id="job:NIGHTLY_PURGE"]');
	await expect(job.locator(".node-owner")).toHaveText("SHOPAPP.");
	await expect(job.locator(".node-label tspan")).toHaveText(["NIGHTLY_PURGE_JOB"]);
	await expect(job.locator(".node-kind")).toHaveText("JOB");
	await expect(graph.locator('[data-node-id="package"] .node-kind')).toHaveText("PACKAGE");
	await expect(graph.locator('[data-node-id="ORDERS"] .node-kind')).toHaveText("TABLE");
	const geometry = await graph.evaluate(svg => {
		const group = (id: string) => svg.querySelector(`[data-node-id="${id}"]`)!;
		const job = group("job:NIGHTLY_PURGE").querySelector("rect")!.getBoundingClientRect();
		const procedure = group("NIGHTLY_PURGE").querySelector("rect")!.getBoundingClientRect();
		const ports = [...svg.querySelectorAll('path[data-from="package"]')].map(path =>
			path.getAttribute("d")!.match(/^M[^ ]+ ([^ ]+)/)![1]);
		const textFits = [...svg.querySelectorAll("g")].every(node => {
			const box = node.querySelector("rect")!.getBoundingClientRect();
			return [...node.querySelectorAll("text")].every(text => {
				const rect = text.getBoundingClientRect();
				return rect.right <= box.right && rect.bottom <= box.bottom;
			});
		});
		return { gap: procedure.x - job.right, height: job.height, ports, textFits };
	});
	expect(geometry.gap).toBeGreaterThan(100);
	expect(geometry.height).toBeLessThan(90);
	expect(new Set(geometry.ports).size).toBe(geometry.ports.length);
	expect(geometry.textFits).toBe(true);
	const legend = await page.locator("#plsql-content .graph-legend").boundingBox();
	const diagram = await graph.boundingBox();
	expect(legend!.y + legend!.height).toBeLessThan(diagram!.y);
});

for (const colorScheme of ['light', 'dark'] as const) test(`graph bounds and AA contrast in ${colorScheme}`, async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await page.emulateMedia({ colorScheme });
	await page.goto(process.env.PIAGENT_BROWSER_URL!);
	await page.locator('#plsql-tab').click();
	await page.locator('#plsql-owner').fill('WORKLOAD_FIXTURE');
	await page.locator('#plsql-run').click();
	await expect(page.locator('#plsql-object option')).toHaveCount(1);
	await page.locator('#plsql-doc').click();
	const graph = page.locator('#plsql-content .graph-scroll > svg');
	const result = await graph.evaluate(svg => {
		const luminance = (color: string) => {
			const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
				const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
			});
			return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
		};
		const contrast = (a: string, b: string) => {
			const l1 = luminance(a), l2 = luminance(b);
			return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
		};
		const bounds = (svg as SVGSVGElement).viewBox.baseVal;
		const nodes = [...svg.querySelectorAll('g[data-node-id]')];
		const background = getComputedStyle(svg.closest('section')!).backgroundColor;
		const edges = [...svg.closest('.graph-view')!.querySelectorAll('path')];
		return {
			contained: nodes.every(node => {
				const rect = (node.querySelector('rect') as SVGRectElement).getBBox();
				return rect.x >= bounds.x && rect.y >= bounds.y && rect.x + rect.width <= bounds.x + bounds.width && rect.y + rect.height <= bounds.y + bounds.height;
			}),
			textContrast: nodes.flatMap(node => [...node.querySelectorAll('text')].map(text => contrast(getComputedStyle(text).fill, getComputedStyle(node.querySelector('rect')!).fill))),
			strokeContrast: nodes.map(node => contrast(getComputedStyle(node.querySelector('rect')!).stroke, getComputedStyle(node.querySelector('rect')!).fill)),
			edgeContrast: edges.map(edge => contrast(getComputedStyle(edge).stroke, background)),
			styles: [...new Set(edges.map(edge => getComputedStyle(edge).stroke + '/' + getComputedStyle(edge).strokeDasharray))],
			fits: svg.getBoundingClientRect().width <= svg.parentElement!.clientWidth,
		};
	});
	expect(result.contained).toBe(true);
	expect(result.fits).toBe(true);
	for (const ratio of result.textContrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
	for (const ratio of [...result.strokeContrast, ...result.edgeContrast]) expect(ratio).toBeGreaterThanOrEqual(3);
	expect(result.styles).toHaveLength(6);
	await page.setViewportSize({ width: 390, height: 844 });
	const scroll = page.locator('#plsql-content .graph-scroll');
	expect(await scroll.evaluate(node => getComputedStyle(node).overflowX)).toBe('auto');
	await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth; });
	expect(await scroll.evaluate(node => node.scrollLeft + node.clientWidth >= node.scrollWidth - 1)).toBe(true);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
