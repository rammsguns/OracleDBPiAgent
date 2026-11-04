import { expect, it, vi } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, statSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateSchedule, renderSchedule } from "../../src/report/schedule.js";
const targets = [{ name: "d1-19c-lab" }];
const base = { target: targets[0]!.name, every: "1h", home: "/private/piagent", out: "/private/piagent/reports", node: "/usr/bin/node", cli: "/opt/piagent/dist/cli/index.js" };
it.each(["15m", "1h", "6h", "1d"])("matches golden output for %s", every => {
	expect(renderSchedule(generateSchedule({ ...base, every }, targets))).toBe(readFileSync(new URL(`./fixtures/schedule/${every}.txt`, import.meta.url), "utf8"));
});
it.each(["../lab", "lab;id", "x\nX=1", "", "unknown", "a".repeat(129)])("rejects target %j", target => {
	expect(() => generateSchedule({ ...base, target }, targets)).toThrow();
});
it.each(["2h", "__proto__", "constructor", "1h;id", ""])('rejects interval %j', every => {
	expect(() => generateSchedule({ ...base, every }, targets)).toThrow();
});
it.each(["relative", "/tmp/a\nb", "/tmp/a\0b"])('rejects unsafe path %j', home => {
	expect(() => generateSchedule({ ...base, home }, targets)).toThrow();
});
it.each([" /private/home", "/private/home ", "/private/home\t", "/private/home\nnext", "/private/home\0", "/private/home\x7f", "/private/home\u0085", "/private/home\u2028"])('rejects unrepresentable EnvironmentFile home %j', home => {
	expect(() => generateSchedule({ ...base, home }, targets)).toThrow(/Schedule home.*systemd EnvironmentFile/);
});
it("emits EnvironmentFile as an unquoted literal with escaped percent specifiers", () => {
	const home = "/private/my home-%h-%u";
	const { service } = generateSchedule({ ...base, home }, targets);
	expect(service.split("\n").find(line => line.startsWith("EnvironmentFile="))).toBe("EnvironmentFile=/private/my home-%%h-%%u/.env");
	// These directives accept quoted argument lists, unlike EnvironmentFile.
	expect(service).toContain('ReadWritePaths="/private/piagent/reports" "/private/my home-%%h-%%u/audit.jsonl" "/private/my home-%%h-%%u/alerts.log"');
	expect(service).toContain('ExecStart="/usr/bin/node" -e "');
});
it.each([0, 1, 3, 7].flatMap(status => ["cron", "service"].map(mode => ({ status, mode }))))("runs $mode with exit $status and private local alerts only for changes", ({ status, mode }) => {
	const home = mkdtempSync(join(tmpdir(), "schedule-'$`% "));
	try {
		const cli = join(home, "fake cli.cjs"), out = join(home, "reports ' $(touch INJECTED) %");
		writeFileSync(cli, `require('node:fs').writeFileSync(${JSON.stringify(join(home, "args.json"))},JSON.stringify({args:process.argv.slice(2),env:process.env}));process.exit(${status});`);
		const s = generateSchedule({ ...base, home, out, node: process.execPath, cli }, targets);
		const command = s.cron.slice("0 * * * * ".length).replaceAll("\\%", "%");
		const env = { HOME: home, PIAGENT_ENV_FILE: "/bad", PIAGENT_SECRET_DIR: "/ambient" };
		// Decode the generated systemd argument grammar without invoking systemd.
		const encoded = s.service.split(" -e ")[1]!.split("\n")[0]!;
		const script = JSON.parse(encoded.replaceAll("%%", "%").replaceAll("$$", "$"));
		const r = mode === "cron" ? spawnSync("/bin/sh", ["-c", command], { env }) : spawnSync(process.execPath, ["-e", script], { env });
		expect(r.status, r.stderr.toString()).toBe(status === 3 ? 0 : status);
		const recorded = JSON.parse(readFileSync(join(home, "args.json"), "utf8"));
		expect(recorded.args).toEqual(["report", "--target", base.target, "--out", out, "--diff-only"]);
		expect(recorded.env.PIAGENT_ENV_FILE).toBe(join(home, ".env"));
		expect(recorded.env.PIAGENT_SECRET_DIR).toBeUndefined();
		if (status === 3) {
			expect(statSync(join(home, "alerts.log")).mode & 0o777).toBe(0o600);
			expect(readFileSync(join(home, "alerts.log"), "utf8")).toMatch(/ report changes: d1-19c-lab\n$/);
		} else expect(() => statSync(join(home, "alerts.log"))).toThrow();
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("refuses alert symlinks", () => {
	const home = mkdtempSync(join(tmpdir(), "schedule-"));
	try {
		const cli = join(home, "fake.cjs"), victim = join(home, "victim");
		writeFileSync(cli, "process.exit(3)"); writeFileSync(victim, "unchanged"); symlinkSync(victim, join(home, "alerts.log"));
		const command = generateSchedule({ ...base, home, cli, node: process.execPath }, targets).cron.slice("0 * * * * ".length);
		expect(spawnSync("/bin/sh", ["-c", command]).status).toBe(1);
		expect(readFileSync(victim, "utf8")).toBe("unchanged");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("registers the schedule subcommand without executing a report", async () => {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	try {
		const { main } = await import("../../src/cli/index.js");
		await main(["node", "piagent", "report", "schedule", "--target", base.target, "--every", "1h"]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("# piagent-report-d1-19c-lab.service"));
	} finally { log.mockRestore(); }
});
