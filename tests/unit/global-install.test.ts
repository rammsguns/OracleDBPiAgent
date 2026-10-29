import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironment, initializeHome } from "../../src/config/environment.js";
import { agentHome, PACKAGE_ROOT, reportDirectory } from "../../src/config/paths.js";
import { loadConfig } from "../../src/config/index.js";
import { main } from "../../src/cli/index.js";
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
		vi.stubEnv("PIAGENT_HOME", temp()); vi.stubEnv("PIAGENT_ENV_FILE", join(temp(), "missing"));
		const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("version exit"); });
		await expect(main(["node", "piagent", "--version"])).rejects.toThrow("version exit");
		expect(output).toHaveBeenCalledWith(JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version + "\n");
		expect(exit).toHaveBeenCalledWith(0);
	});
});
