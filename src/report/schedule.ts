import { accessSync, lstatSync, constants, openSync, closeSync, fchmodSync, writeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { agentHome } from "../config/paths.js";
import { isAbsolute, join } from "node:path";
import { validateReportTarget } from "./history.js";

const intervals = {
	"15m": { calendar: "*-*-* *:00/15:00", cron: "*/15 * * * *" },
	"1h": { calendar: "hourly", cron: "0 * * * *" },
	"6h": { calendar: "*-*-* 00/6:00:00", cron: "0 */6 * * *" },
	"1d": { calendar: "daily", cron: "0 0 * * *" },
} as const;
export interface ScheduleOptions {
	target: string;
	every: string;
	home: string;
	out: string;
	node: string;
	cli: string;
}
// systemd argument lists and POSIX shell commands have distinct quoting rules.
const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const unitQuote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%").replaceAll("$", "$$")}"`;
// ReadWritePaths parses a quoted list; EnvironmentFile takes one unquoted literal.
const pathQuote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
function setupPaths(home: string, out: string) {
	return [
		{ path: out, directory: true, command: `mkdir -p -m 700 -- ${shellQuote(out)}` },
		...["audit.jsonl", "alerts.log"].map(name => {
			const path = join(home, name);
			return { path, directory: false, command: `touch -- ${shellQuote(path)} && chmod 600 -- ${shellQuote(path)}` };
		}),
	];
}
export function generateSchedule(options: ScheduleOptions, targets: readonly { name: string }[]) {
	validateReportTarget(options.target, targets);
	if (!Object.hasOwn(intervals, options.every)) throw new Error("Interval must be 15m, 1h, 6h or 1d");
	if (options.home !== options.home.trim() || /[\p{Cc}\u2028\u2029]/u.test(options.home)) {
		throw new Error("Schedule home cannot contain control characters, newlines, or leading/trailing whitespace in systemd EnvironmentFile");
	}
	for (const value of [options.home, options.out, options.node, options.cli]) {
		if (!isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Schedule paths must be absolute and contain no control characters");
	}
	const interval = intervals[options.every as keyof typeof intervals];
	const name = `piagent-report-${options.target}`;
	const audit = join(options.home, "audit.jsonl"), alerts = join(options.home, "alerts.log");
	const args = [options.node, options.cli, "report", "schedule", "run", "--target", options.target, "--home", options.home, "--out", options.out];
	const service = `[Unit]\nDescription=Read-only Oracle report for ${options.target}\n\n[Service]\nType=oneshot\nUMask=0077\nEnvironmentFile=${join(options.home, ".env").replaceAll("%", "%%")}\nExecStart=${args.map(unitQuote).join(" ")}\nNoNewPrivileges=true\nProtectSystem=strict\nReadWritePaths=${[options.out, audit, alerts].map(path => pathQuote(`-${path}`)).join(" ")}\nPrivateTmp=true\n`;
	const timer = `[Unit]\nDescription=Schedule Oracle report for ${options.target}\n\n[Timer]\nOnCalendar=${interval.calendar}\nPersistent=true\nUnit=${name}.service\n\n[Install]\nWantedBy=timers.target\n`;
	// Cron treats percent specially even inside shell quotes.
	const cron = `${interval.cron} ${args.map(shellQuote).join(" ")}`.replaceAll("%", "\\%") + "\n";
	const warnings = stableNodePath(options.node) ? [] : ['Node executable may move or disappear (version-manager, temporary, bundled, or unrecognized path). Use a stable system Node installation and regenerate this schedule after changing Node.'];
	return { name, service, timer, cron, warnings, setup: setupPaths(options.home, options.out).map(entry => entry.command).join("\n") + "\n" };
}
// Only conventional system installations are assumed stable; custom installs need review.
export function stableNodePath(node: string): boolean {
	return ['/usr/bin/node', '/usr/local/bin/node', '/opt/homebrew/bin/node', '/bin/node'].includes(node);
}
export function renderSchedule(schedule: ReturnType<typeof generateSchedule>): string {
	return `${schedule.warnings.map(warning => `# WARNING: ${warning}\n`).join('')}# one-time setup (run once before enabling the timer)\n${schedule.setup}\n# ${schedule.name}.service\n${schedule.service}\n# ${schedule.name}.timer\n${schedule.timer}\n# crontab (use instead of the timer)\n${schedule.cron}`;
}

export interface ScheduleRunOptions {
	target: string;
	home?: string;
	out?: string;
	cli: string;
	node?: string;
}
export interface ScheduleRunDependencies {
	execute?: (node: string, args: string[], env: NodeJS.ProcessEnv) => number;
	now?: () => Date;
}
/** Run the existing report command with a clean environment; never invokes an agent. */
export function runSchedule(options: ScheduleRunOptions, dependencies: ScheduleRunDependencies = {}): number {
	const home = options.home ?? agentHome();
	if (!isAbsolute(home) || (options.out !== undefined && !isAbsolute(options.out))) throw new Error("Schedule run paths must be absolute");
	// Validate before executing anything. The child also validates against configured targets.
	validateReportTarget(options.target, [{ name: options.target }]);
	const out = options.out ?? join(home, "reports");
	for (const entry of setupPaths(home, out)) {
		try {
			const stat = lstatSync(entry.path);
			if (stat.isSymbolicLink() || (entry.directory ? !stat.isDirectory() : !stat.isFile()) || !(stat.mode & 0o222)) throw new Error("Unsafe or unwritable path");
			accessSync(entry.path, constants.W_OK | (entry.directory ? constants.X_OK : 0));
		} catch {
			console.error(`Schedule setup required for ${shellQuote(entry.path)}: path must exist, be writable, and be a real ${entry.directory ? "directory" : "regular file"} (no symlinks). Fix unsafe paths first, then run: ${entry.command}`);
			return 1;
		}
	}
	const env: NodeJS.ProcessEnv = {
		PATH: "/usr/bin:/bin", HOME: process.env.HOME,
		PIAGENT_HOME: home, PIAGENT_ENV_FILE: join(home, ".env"),
		PIAGENT_AUDIT_FILE: join(home, "audit.jsonl"),
	};
	const args = [options.cli, "report", "--target", options.target, "--out", out, "--diff-only"];
	const execute = dependencies.execute ?? ((node, args, env) => {
		const result = spawnSync(node, args, { env, stdio: "inherit" });
		return result.error || result.signal ? 1 : result.status ?? 1;
	});
	const status = execute(options.node ?? process.execPath, args, env);
	if (status !== 3) return status;
	const fd = openSync(join(home, "alerts.log"), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
	try {
		fchmodSync(fd, 0o600);
		writeSync(fd, `${(dependencies.now ?? (() => new Date()))().toISOString()} report changes: ${options.target}\n`);
	} finally { closeSync(fd); }
	return 0;
}
