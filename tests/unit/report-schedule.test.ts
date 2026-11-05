import { expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, readFileSync, mkdtempSync, writeFileSync, statSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { generateSchedule, renderSchedule, runSchedule } from "../../src/report/schedule.js";
const targets = [{ name: "d1-19c-lab" }];
const base = { target: targets[0]!.name, every: "1h", home: "/private/piagent", out: "/private/piagent/reports", node: "/usr/bin/node", cli: "/opt/piagent/dist/cli/index.js" };
function prepare(home: string, out = join(home, "reports")) {
	mkdirSync(out, { recursive: true, mode: 0o700 });
	for (const name of ["audit.jsonl", "alerts.log"]) writeFileSync(join(home, name), "", { flag: "a", mode: 0o600 });
}
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
	expect(service).toContain('ReadWritePaths="-/private/piagent/reports" "-/private/my home-%%h-%%u/audit.jsonl" "-/private/my home-%%h-%%u/alerts.log"');
	expect(service).toContain('ExecStart="/usr/bin/node" "/opt/piagent/dist/cli/index.js" "report" "schedule" "run"');
});
it.each([0, 1, 3, 7])("run handles fake report exit %s", status => {
	const home = mkdtempSync(join(tmpdir(), "schedule-'$`% "));
	try {
		const cli = join(home, "fake cli.cjs"), out = join(home, "reports ' $(touch INJECTED) %");
		writeFileSync(cli, `require('node:fs').writeFileSync(${JSON.stringify(join(home, "args.json"))},JSON.stringify({args:process.argv.slice(2),env:process.env}));process.exit(${status});`);
		prepare(home, out);
		const result = runSchedule({ target: base.target, home, out, node: process.execPath, cli });
		expect(result).toBe(status === 3 ? 0 : status);
		const recorded = JSON.parse(readFileSync(join(home, "args.json"), "utf8"));
		expect(recorded.args).toEqual(["report", "--target", base.target, "--out", out, "--diff-only"]);
		expect(recorded.env.PIAGENT_ENV_FILE).toBe(join(home, ".env"));
		expect(recorded.env.PIAGENT_AUDIT_FILE).toBe(join(home, "audit.jsonl"));
		expect(Object.keys(recorded.env).sort()).toEqual(["HOME", "PATH", "PIAGENT_AUDIT_FILE", "PIAGENT_ENV_FILE", "PIAGENT_HOME"]);
		if (status === 3) {
			expect(statSync(join(home, "alerts.log")).mode & 0o777).toBe(0o600);
			expect(readFileSync(join(home, "alerts.log"), "utf8")).toMatch(/ report changes: d1-19c-lab\n$/);
		} else expect(readFileSync(join(home, "alerts.log"), "utf8")).toBe("");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("generated cron is a short quoted invocation of schedule run", () => {
	const home = mkdtempSync(join(tmpdir(), "schedule-'$`% "));
	try {
		const cli = join(home, "fake.cjs"), out = join(home, "report '%h");
		writeFileSync(cli, `console.log(JSON.stringify(process.argv.slice(2)))`);
		const schedule = generateSchedule({ ...base, home, out, cli, node: process.execPath }, targets);
		const command = schedule.cron.slice("0 * * * * ".length).replaceAll("\\%", "%");
		const result = spawnSync("/bin/sh", ["-c", command]);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.toString())).toEqual(["report", "schedule", "run", "--target", base.target, "--home", home, "--out", out]);
		const execStart = schedule.service.split("\n").find(line => line.startsWith("ExecStart="))!.slice("ExecStart=".length);
		const argv = execStart.match(/"(?:\\.|[^"\\])*"/g)!.map(argument => JSON.parse(argument.replaceAll("%%", "%").replaceAll("$$", "$")) as string);
		const serviceResult = spawnSync(argv[0]!, argv.slice(1));
		expect(serviceResult.status).toBe(0);
		expect(JSON.parse(serviceResult.stdout.toString())).toEqual(JSON.parse(result.stdout.toString()));
		expect(schedule.service).not.toContain(" -e ");
		expect(schedule.cron).not.toContain(" -e ");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("appends alerts privately and refuses symlinks", () => {
	const home = mkdtempSync(join(tmpdir(), "schedule-"));
	try {
		prepare(home);
		const alerts = join(home, "alerts.log"), victim = join(home, "victim");
		writeFileSync(alerts, "previous\n", { mode: 0o644 });
		const options = { target: base.target, home, cli: base.cli };
		const dependencies = { execute: () => 3, now: () => new Date("2026-11-04T00:00:00Z") };
		expect(runSchedule(options, dependencies)).toBe(0);
		expect(readFileSync(alerts, "utf8")).toBe("previous\n2026-11-04T00:00:00.000Z report changes: d1-19c-lab\n");
		expect(statSync(alerts).mode & 0o777).toBe(0o600);
		rmSync(alerts); writeFileSync(victim, "unchanged"); symlinkSync(victim, alerts);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try { expect(runSchedule(options, dependencies)).toBe(1); expect(error).toHaveBeenCalledOnce(); }
		finally { error.mockRestore(); }
		expect(readFileSync(victim, "utf8")).toBe("unchanged");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("run returns failure for missing executables and signal termination", () => {
	const home = mkdtempSync(join(tmpdir(), "schedule-"));
	try {
		prepare(home);
		expect(runSchedule({ target: base.target, home, cli: base.cli, node: join(home, "missing") })).toBe(1);
		const cli = join(home, "signal.cjs"); writeFileSync(cli, "process.kill(process.pid, 'SIGTERM')");
		expect(runSchedule({ target: base.target, home, cli })).toBe(1);
		expect(readFileSync(join(home, "alerts.log"), "utf8")).toBe("");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it("run rejects invalid targets before invoking the report", () => {
	const execute = vi.fn();
	expect(() => runSchedule({ target: "../bad", cli: base.cli }, { execute })).toThrow();
	expect(execute).not.toHaveBeenCalled();
});
it("registers the schedule subcommand without executing a report", async () => {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	try {
		const { main } = await import("../../src/cli/index.js");
		await main(["node", "piagent", "report", "schedule", "--target", base.target, "--every", "1h"]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("# piagent-report-d1-19c-lab.service"));
	} finally { log.mockRestore(); }
});

it.each([0, 7])("registers schedule run and propagates fake report result %s", async status => {
	const runner = await import("../../src/report/schedule.js");
	const fake = vi.spyOn(runner, "runSchedule").mockReturnValue(status);
	const previous = process.exitCode;
	const previousEnvFile = process.env.PIAGENT_ENV_FILE;
	process.env.PIAGENT_ENV_FILE = "/missing-ambient-env-file-must-not-be-read";
	try {
		const { main } = await import("../../src/cli/index.js");
		await main(["node", "piagent", "report", "schedule", "run", "--target", base.target, "--home", base.home, "--out", base.out]);
		expect(fake).toHaveBeenCalledWith(expect.objectContaining({ target: base.target, home: base.home, out: base.out }));
		expect(process.exitCode).toBe(status);
	} finally {
		fake.mockRestore(); process.exitCode = previous;
		if (previousEnvFile === undefined) delete process.env.PIAGENT_ENV_FILE;
		else process.env.PIAGENT_ENV_FILE = previousEnvFile;
	}
});

it("prints safe idempotent setup commands that preserve existing audit contents", () => {
	const home = mkdtempSync(join(tmpdir(), "schedule-'$`% "));
	try {
		const out = join(home, "reports ' $(touch INJECTED) %");
		const schedule = generateSchedule({ ...base, home, out }, targets);
		expect(renderSchedule(schedule)).toMatch(/^# one-time setup \(run once before enabling the timer\)/);
		writeFileSync(join(home, "audit.jsonl"), "keep audit\n", { mode: 0o644 });
		writeFileSync(join(home, "alerts.log"), "keep alerts\n", { mode: 0o644 });
		for (let i = 0; i < 2; i++) {
			const result = spawnSync("/bin/sh", ["-ec", schedule.setup]);
			expect(result.status, result.stderr.toString()).toBe(0);
		}
		expect(statSync(out).mode & 0o777).toBe(0o700);
		for (const name of ["audit.jsonl", "alerts.log"]) expect(statSync(join(home, name)).mode & 0o777).toBe(0o600);
		expect(readFileSync(join(home, "audit.jsonl"), "utf8")).toBe("keep audit\n");
		expect(readFileSync(join(home, "alerts.log"), "utf8")).toBe("keep alerts\n");
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it.each(["reports", "audit.jsonl", "alerts.log"].flatMap(name => ["missing", "symlink", "unwritable", "wrong type"].map(problem => ({ name, problem }))))("run rejects $problem $name before report execution", ({ name, problem }) => {
	const home = mkdtempSync(join(tmpdir(), "schedule-"));
	const execute = vi.fn(() => 0);
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		prepare(home);
		const path = join(home, name);
		if (problem === "unwritable") chmodSync(path, name === "reports" ? 0o500 : 0o400);
		else {
			rmSync(path, { recursive: true });
			if (problem === "symlink") symlinkSync(home, path);
			if (problem === "wrong type") {
				if (name === "reports") writeFileSync(path, ""); else mkdirSync(path);
			}
		}
		expect(runSchedule({ target: base.target, home, cli: base.cli }, { execute })).toBe(1);
		expect(execute).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledOnce();
		expect(error.mock.calls[0]![0]).toContain(path);
		expect(error.mock.calls[0]![0]).toContain(name === "reports" ? "mkdir -p -m 700 --" : "touch --");
		expect(error.mock.calls[0]![0]).not.toMatch(/EROFS|ENOENT/);
	} finally {
		if (problem === "unwritable") chmodSync(join(home, name), 0o700);
		error.mockRestore(); rmSync(home, { recursive: true, force: true });
	}
});

it.each(['/home/user/.nvm/versions/node/v24/bin/node', '/home/user/.volta/bin/node', '/tmp/bundle/node', '/opt/custom/bin/node'])('warns about potentially unstable Node path %s', node => {
	const schedule = generateSchedule({ ...base, node }, targets);
	expect(renderSchedule(schedule)).toContain('# WARNING: Node executable may move or disappear');
	expect(schedule.service).toContain(node);
});
