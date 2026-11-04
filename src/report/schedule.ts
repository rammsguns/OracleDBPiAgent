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
// These are three distinct grammars: JSON/JavaScript, systemd, and POSIX shell.
const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const unitQuote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%").replaceAll("$", "$$")}"`;
const pathQuote = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
export function generateSchedule(options: ScheduleOptions, targets: readonly { name: string }[]) {
	validateReportTarget(options.target, targets);
	if (!Object.hasOwn(intervals, options.every)) throw new Error("Interval must be 15m, 1h, 6h or 1d");
	for (const value of [options.home, options.out, options.node, options.cli]) {
		if (!isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Schedule paths must be absolute and contain no control characters");
	}
	const interval = intervals[options.every as keyof typeof intervals];
	const name = `piagent-report-${options.target}`;
	const audit = join(options.home, "audit.jsonl"), alerts = join(options.home, "alerts.log");
	// A clean child environment prevents ambient PIAGENT_ENV_FILE or summarization settings
	// from changing scheduled behavior. The CLI parses the private env file as data.
	const script = `const {spawnSync}=require('node:child_process');const fs=require('node:fs');const env={PATH:'/usr/bin:/bin',HOME:process.env.HOME,PIAGENT_HOME:${JSON.stringify(options.home)},PIAGENT_ENV_FILE:${JSON.stringify(join(options.home, ".env"))},PIAGENT_AUDIT_FILE:${JSON.stringify(audit)}};const r=spawnSync(${JSON.stringify(options.node)},${JSON.stringify([options.cli, "report", "--target", options.target, "--out", options.out, "--diff-only"])},{env,stdio:'inherit'});if(r.error||r.signal)process.exit(1);if(r.status===3){const fd=fs.openSync(${JSON.stringify(alerts)},fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);try{fs.fchmodSync(fd,0o600);fs.writeSync(fd,new Date().toISOString()+${JSON.stringify(` report changes: ${options.target}\n`)});}finally{fs.closeSync(fd);}process.exit(0);}process.exit(r.status??1);`;
	const service = `[Unit]\nDescription=Read-only Oracle report for ${options.target}\n\n[Service]\nType=oneshot\nUMask=0077\nEnvironmentFile=${pathQuote(join(options.home, ".env"))}\nExecStart=${unitQuote(options.node)} -e ${unitQuote(script)}\nNoNewPrivileges=true\nProtectSystem=strict\nReadWritePaths=${[options.out, audit, alerts].map(pathQuote).join(" ")}\nPrivateTmp=true\n`;
	const timer = `[Unit]\nDescription=Schedule Oracle report for ${options.target}\n\n[Timer]\nOnCalendar=${interval.calendar}\nPersistent=true\nUnit=${name}.service\n\n[Install]\nWantedBy=timers.target\n`;
	// Cron treats percent specially even inside shell quotes.
	const cron = `${interval.cron} ${shellQuote(options.node)} -e ${shellQuote(script)}`.replaceAll("%", "\\%") + "\n";
	return { name, service, timer, cron };
}
export function renderSchedule(schedule: ReturnType<typeof generateSchedule>): string {
	return `# ${schedule.name}.service\n${schedule.service}\n# ${schedule.name}.timer\n${schedule.timer}\n# crontab (use instead of the timer)\n${schedule.cron}`;
}
