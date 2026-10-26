import { afterEach, expect, it, vi } from "vitest";
import { doctor, main, type DoctorDependencies } from "../../src/cli/index.js";
import { loadConfig } from "../../src/config/index.js";
import { UnsupportedVersionError, type OracleSession } from "../../src/contracts.js";

const config = loadConfig({});
const sensitive = "sensitive-connection-or-credential";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
function setup(failure?: string) {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	const closeAll = vi.fn(async () => {});
	const get = vi.fn(async (name?: string) => {
		const target = config.targets.find(t => t.name === name)!;
		if (name === config.targets[0]!.name) {
			if (failure === "connection") throw new Error(sensitive);
			if (failure === "gate") throw new UnsupportedVersionError(sensitive, sensitive);
		}
		return {
			target, identity: { versionFull: "19.9.1.0.0", currentUser: target.username },
			query: vi.fn(async (sql: string) => ({ rows: sql.includes("SESSION_PRIVS") ? [[failure === "privileges" ? sensitive : "CREATE SESSION"]] : [], columns: [], truncated: false, elapsedMs: 0 })),
		} as unknown as OracleSession;
	});
	const createSessions = vi.fn(() => ({ get, closeAll }));
	const dependencies: DoctorDependencies = { checkHealth: vi.fn(async () => { if (failure === "unloaded") throw new Error(sensitive); }), createSessions };
	return { dependencies, createSessions, get, closeAll, output: () => [...log.mock.calls, ...error.mock.calls].flat().join("\n") };
}
it.each([
	["unloaded", "Strata: unavailable or unloaded"],
	["connection", "d1-19c-lab: connection check failed"],
	["gate", "d1-19c-lab: 19c gate check failed"],
	["privileges", "read-only privileges check failed"],
])("doctor and main fail safely for %s", async (failure, label) => {
	const test = setup(failure);
	expect(await doctor(config, test.dependencies)).toBe(false);
	await main(["node", "piagent", "doctor"], test.dependencies);
	expect(process.exitCode).toBe(1);
	expect(test.output()).toContain(label);
	expect(test.output()).not.toContain(sensitive);
	expect(test.output()).not.toMatch(/localhost|1522|1523|ORCL|PRODCDB/);
	if (failure === "unloaded") expect(test.createSessions).not.toHaveBeenCalled();
	else {
		expect(test.get).toHaveBeenCalledWith("p1-19c-prod");
		expect(test.closeAll).toHaveBeenCalledTimes(2);
	}
});
it("passes healthy targets and closes the provider", async () => {
	const test = setup();
	expect(await doctor(config, test.dependencies)).toBe(true);
	await main(["node", "piagent", "doctor"], test.dependencies);
	expect(process.exitCode ?? 0).toBe(0);
	expect(test.closeAll).toHaveBeenCalledTimes(2);
});
it("redacts unexpected object privileges", async () => {
	const test = setup();
	test.get.mockImplementation(async () => ({ identity: { versionFull: "19.9", currentUser: "HARNESS_LAB" }, query: async () => ({ rows: [[sensitive, sensitive]] }) }) as unknown as OracleSession);
	expect(await doctor(config, test.dependencies)).toBe(false);
	expect(test.output()).toContain("read-only privileges check failed");
	expect(test.output()).not.toContain(sensitive);
});
