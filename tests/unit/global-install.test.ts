import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, statSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironment, initializeHome, ensureAgentHome } from "../../src/config/environment.js";
import { agentHome, PACKAGE_ROOT, reportDirectory } from "../../src/config/paths.js";
import { loadConfig } from "../../src/config/index.js";
import { main } from "../../src/cli/index.js";
import { JsonlAuditSink } from "../../src/audit/index.js";
import { saveReport } from "../../src/report/history.js";
const dirs: string[] = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), "piagent-unit-")); dirs.push(dir); return dir; }
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe("private CLI configuration", () => {
	it("loads Node env syntax without overriding existing variables or printing values", () => {
		const home = temp(), file = join(home, ".env");
		writeFileSync(file, 'EXISTING=hidden\nNEW="private value"\nexport MULTI="line1\\nline2"\n', { mode: 0o600 });
		const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
		const env = { PIAGENT_HOME: home, EXISTING: "" } as NodeJS.ProcessEnv;
		loadEnvironment(env);
		expect(env.EXISTING).toBe(""); expect(env.NEW).toBe("private value");
		expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
	});
	it("honors an explicit env file and refuses exposed permissions without values", () => {
		const home = temp(), file = join(home, "chosen");
		writeFileSync(file, "TOKEN=do-not-print", { mode: 0o600 });
		const env = { PIAGENT_HOME: join(home, "absent"), PIAGENT_ENV_FILE: file } as NodeJS.ProcessEnv;
		loadEnvironment(env); expect(env.TOKEN).toBe("do-not-print");
		chmodSync(file, 0o640); expect(() => loadEnvironment(env)).toThrow("0600");
		try { loadEnvironment(env); } catch (error) { expect(String(error)).not.toContain("do-not-print"); }
	});
	it("allows missing files and never reads the working directory env", () => {
		const cwd = process.cwd(), dir = temp();
		writeFileSync(join(dir, ".env"), "CWD_ONLY=wrong", { mode: 0o600 });
		const env = { PIAGENT_HOME: join(dir, "other") } as NodeJS.ProcessEnv;
		try { process.chdir(dir); loadEnvironment(env); expect(env.CWD_ONLY).toBeUndefined(); } finally { process.chdir(cwd); }
	});
	it("initializes private placeholders once without copying environment values", () => {
		const home = join(temp(), "home"), env = { PIAGENT_HOME: home, PIAGENT_SECRET_DIR: "must-not-copy" };
		expect(initializeHome(env)).toBe(true);
		expect(statSync(home).mode & 0o777).toBe(0o700);
		const file = join(home, ".env"); expect(statSync(file).mode & 0o777).toBe(0o600);
		const content = readFileSync(file, "utf8"); expect(content).toContain("/absolute/path/to/db-secrets"); expect(content).not.toContain("must-not-copy"); expect(content).not.toContain("/home/kiwi");
		writeFileSync(file, "keep"); expect(initializeHome(env)).toBe(false); expect(readFileSync(file, "utf8")).toBe("keep");
	});
	it("resolves package targets and user paths away from cwd, retaining explicit overrides", () => {
		const home = temp(), cwd = process.cwd();
		try { process.chdir(home); const config = loadConfig({ HOME: home }); expect(config.targets).toHaveLength(2); expect(config.auditFile).toBe(join(home, ".piagent/audit.jsonl")); } finally { process.chdir(cwd); }
		expect(agentHome({ HOME: home })).toBe(join(home, ".piagent"));
		expect(reportDirectory({ PIAGENT_HOME: home })).toBe(join(home, "reports"));
		expect(reportDirectory({ PIAGENT_REPORT_DIRECTORY: home })).toBe(home);
		expect(loadConfig({ PIAGENT_AUDIT_FILE: join(home, "custom") }).auditFile).toBe(join(home, "custom"));
		expect(loadConfig({ PIAGENT_TARGETS_FILE: join(PACKAGE_ROOT, "config/targets.json") }).targets).toHaveLength(2);
	});
	it("prints the package version without DB or LLM calls", async () => {
		const home = join(temp(), "absent");
		vi.stubEnv("PIAGENT_HOME", home); vi.stubEnv("PIAGENT_ENV_FILE", undefined);
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("version exit"); });
		await expect(main(["node", "piagent", "--version"])).rejects.toThrow("version exit");
		expect(output).toHaveBeenCalledWith(JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version + "\n");
		expect(exit).toHaveBeenCalledWith(0);
		expect(existsSync(home)).toBe(false);
	});
});

describe("agent home security", () => {
	it("refuses an existing non-private home without chmodding it", () => {
		const home = temp(); chmodSync(home, 0o755);
		expect(() => ensureAgentHome({ PIAGENT_HOME: home })).toThrow("PIAGENT_HOME");
		expect(statSync(home).mode & 0o777).toBe(0o755);
	});
	it("refuses symlinked and non-directory homes", () => {
		const root = temp(), target = temp(), link = join(root, "link"), file = join(root, "file");
		symlinkSync(target, link); writeFileSync(file, "private content", { mode: 0o600 });
		for (const home of [link, file]) expect(() => ensureAgentHome({ PIAGENT_HOME: home })).toThrow("PIAGENT_HOME");
		expect(statSync(target).mode & 0o777).toBe(0o700);
	});
	it.skipIf(typeof process.getuid !== "function")("refuses a foreign owner", () => {
		const home = temp(), uid = process.getuid!();
		vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
		expect(() => ensureAgentHome({ PIAGENT_HOME: home })).toThrow("owned by the current user");
		expect(statSync(home).mode & 0o777).toBe(0o700);
	});
	it("errors on an explicit missing env file but ignores the missing default", () => {
		const home = join(temp(), "absent");
		expect(() => loadEnvironment({ PIAGENT_HOME: home, PIAGENT_ENV_FILE: join(home, "missing") })).toThrow("Cannot open private environment file");
		expect(() => loadEnvironment({ PIAGENT_HOME: home })).not.toThrow();
		expect(existsSync(home)).toBe(false);
	});
	it.each(["audit", "report"])("creates a private home on the first default %s write", async kind => {
		const home = join(temp(), "absent"); vi.stubEnv("PIAGENT_HOME", home);
		vi.stubEnv("PIAGENT_AUDIT_FILE", undefined); vi.stubEnv("PIAGENT_REPORT_DIRECTORY", undefined);
		if (kind === "audit") await new JsonlAuditSink(join(home, "audit.jsonl")).record({ at: new Date().toISOString(), runId: "test", kind: "run_start" });
		else await saveReport(reportDirectory(), { target: "lab", generatedAt: new Date().toISOString(), sections: [] }, [{ name: "lab" }]);
		expect(statSync(home).mode & 0o777).toBe(0o700);
	});
	it.each(["audit", "report"])("refuses unsafe homes before a default %s write", async kind => {
		const home = temp(); chmodSync(home, 0o755); vi.stubEnv("PIAGENT_HOME", home);
		vi.stubEnv("PIAGENT_AUDIT_FILE", undefined); vi.stubEnv("PIAGENT_REPORT_DIRECTORY", undefined);
		const write = kind === "audit" ? new JsonlAuditSink(join(home, "audit.jsonl")).record({ at: new Date().toISOString(), runId: "test", kind: "run_start" }) : saveReport(reportDirectory(), { target: "lab", generatedAt: new Date().toISOString(), sections: [] }, [{ name: "lab" }]);
		await expect(write).rejects.toThrow("PIAGENT_HOME");
		expect(statSync(home).mode & 0o777).toBe(0o755);
	});
	it("keeps explicit audit/report destinations independent of home permissions", async () => {
		const home = temp(); chmodSync(home, 0o755); vi.stubEnv("PIAGENT_HOME", home);
		const auditFile = join(home, "audit.jsonl"); vi.stubEnv("PIAGENT_AUDIT_FILE", auditFile);
		await new JsonlAuditSink(auditFile).record({ at: new Date().toISOString(), runId: "test", kind: "run_start" });
		const report = { target: "lab", generatedAt: new Date().toISOString(), sections: [] }, targets = [{ name: "lab" }];
		vi.stubEnv("PIAGENT_REPORT_DIRECTORY", undefined);
		// An explicit --out may deliberately match the default path.
		await saveReport(join(home, "reports"), report, targets, false);
		vi.stubEnv("PIAGENT_REPORT_DIRECTORY", join(home, "reports"));
		await saveReport(reportDirectory(), report, targets);
		expect(statSync(home).mode & 0o777).toBe(0o755);
	});

});
