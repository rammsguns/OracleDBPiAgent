import { AccountCheckError } from "../../src/oracle/account.js";
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
			if (failure === "privileges") throw new Error(sensitive);
			if (failure === "connection") throw new Error(sensitive);
			if (failure === "gate") throw new UnsupportedVersionError(sensitive, sensitive);
		}
		return {
			target, identity: { versionFull: "19.9.1.0.0", currentUser: target.username },
			query: vi.fn(async (sql: string) => ({ rows: sql.includes("SESSION_PRIVS") ? [[failure === "privileges" ? sensitive : "CREATE SESSION"]] : failure === "views" && sql.includes("all_dependencies") ? [[sensitive, sensitive]] : [], columns: [], truncated: false, elapsedMs: 0 })),
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
	["privileges", "connection check failed"],
	["views", "view code dependencies check failed"],
])("doctor and main fail safely for %s", async (failure, label) => {
	const test = setup(failure);
	expect(await doctor(config, test.dependencies)).toBe(false);
	await main(["node", "piagent", "doctor"], test.dependencies);
	expect(process.exitCode).toBe(1);
	expect(test.output()).toContain(label);
	expect(test.output()).not.toContain(sensitive);
	expect(test.output()).not.toMatch(/localhost|1522|1523|ORCL|PRODCDB/);
	{
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
	expect(test.output()).toContain("view code dependencies check failed");
	expect(test.output()).not.toContain(sensitive);
});

it('names account-check refusals in the doctor report callback and continues to other targets',async()=>{
	const test=setup();const report=vi.fn();
	const healthyGet=test.get.getMockImplementation()!;
	test.get.mockImplementation(async name=>{
		if(name==='d1-19c-lab') throw new AccountCheckError('Account check failed: CREATE TABLE');
		return healthyGet(name);
	});
	expect(await doctor(config,{...test.dependencies,report})).toBe(false);
	expect(report).toHaveBeenCalledWith('d1-19c-lab: account check',false);
	expect(report).not.toHaveBeenCalledWith('d1-19c-lab: connection',false);
	expect(report).toHaveBeenCalledWith('p1-19c-prod',true);
	expect(test.closeAll).toHaveBeenCalledOnce();
});
it.each([false,true])('routes targets check failure output correctly with json=%s',async json=>{
	const log=vi.spyOn(console,'log').mockImplementation(()=>{});
	const error=vi.spyOn(console,'error').mockImplementation(()=>{});
	const closeAll=vi.fn(async()=>{});
	const message='Account check failed: CREATE TABLE';
	await main(['node','piagent','targets','check','--target','d1-19c-lab',...(json?['--json']:[])],{
		createSessions:()=>({get:async()=>{throw new AccountCheckError(message);},closeAll}),
	});
	expect(process.exitCode).toBe(1);expect(closeAll).toHaveBeenCalledOnce();
	if(json){
		expect(error).toHaveBeenCalledExactlyOnceWith(message);expect(log).toHaveBeenCalledOnce();
		expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({target:'d1-19c-lab',accountCheck:'failed',error:message});
	}else{
		expect(log).not.toHaveBeenCalled();expect(error).toHaveBeenCalledExactlyOnceWith(message);
	}
});
