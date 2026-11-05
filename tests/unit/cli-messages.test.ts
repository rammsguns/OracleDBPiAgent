import { afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleCliError } from "../../src/cli/index.js";
import { assertConfiguredLlmKeyFile, initializeHome, SafeConfigError } from "../../src/config/environment.js";

const previousExitCode = process.exitCode;
const dirs: string[] = [];
afterEach(() => {
	process.exitCode = previousExitCode;
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("prints fixed configuration guidance and exits 1", () => {
	const output = vi.spyOn(console, "error").mockImplementation(() => {});
	let failure: unknown;
	try { assertConfiguredLlmKeyFile("/absolute/path/to/strata-api-key"); } catch (error) { failure = error; }
	expect(failure).toBeInstanceOf(SafeConfigError);
	handleCliError(failure);
	expect(output).toHaveBeenCalledExactlyOnceWith(new SafeConfigError().message);
	expect(process.exitCode).toBe(1);
});

it.each([new Error("sensitive path or value"), { message: "sensitive path or value", name: "SafeConfigError" }, "sensitive value", null])("masks unexpected errors", error => {
	const output = vi.spyOn(console, "error").mockImplementation(() => {});
	handleCliError(error);
	expect(output).toHaveBeenCalledExactlyOnceWith("piagent failed; check local configuration and service availability");
	expect(process.exitCode).toBe(1);
});

it("ask with init's isolated placeholder exits before any network attempt", () => {
	const root = mkdtempSync(join(tmpdir(), "piagent-cli-message-")); dirs.push(root);
	const home = join(root, "home");
	initializeHome({ PIAGENT_HOME: home });
	const guard = join(root, "no-network.mjs");
	writeFileSync(guard, `
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { process.stderr.write('NETWORK_ATTEMPT_BLOCKED\\n'); process.exit(97); };
net.Socket.prototype.connect = deny;
tls.connect = deny;
http.request = http.get = https.request = https.get = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
`);
	const child = spawnSync(process.execPath, ["--import", "tsx", "--import", guard, "src/cli/index.ts", "ask", "test"], {
		env: { PATH: process.env.PATH, HOME: root, PIAGENT_HOME: home }, encoding: "utf8", timeout: 15000,
	});
	expect(child.error).toBeUndefined();
	expect(child.status).toBe(1);
	expect(child.stdout).toBe("");
	expect(child.stderr.trim()).toBe(new SafeConfigError().message);
});

it("drift help lists every supported scope without network access", () => {
	const root = mkdtempSync(join(tmpdir(), "piagent-drift-help-")); dirs.push(root);
	const child = spawnSync(process.execPath, ["--import", "tsx", "src/cli/index.ts", "drift", "--help"], {
		env: { PATH: process.env.PATH, HOME: root, PIAGENT_HOME: root }, encoding: "utf8", timeout: 15000,
	});
	expect(child.status).toBe(0);
	expect(child.stdout).toMatch(/parameters, schema, objects or security/);
});
