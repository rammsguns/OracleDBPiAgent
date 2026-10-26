import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditEvent, AuditSink } from "../contracts.js";

/** Allowlisted metadata only: callers must never pass SQL binds or credentials. */
export class JsonlAuditSink implements AuditSink {
	private pending: Promise<void> = Promise.resolve();
	constructor(readonly file: string) {}
	record(event: AuditEvent): Promise<void> {
		const safe = Object.fromEntries(["at", "runId", "kind", "target", "tool", "sqlSha256", "rows", "truncated", "elapsedMs"].filter(key => event[key as keyof AuditEvent] !== undefined).map(key => [key, event[key as keyof AuditEvent]]));
		// Deliberately omit free-form detail and SQL text: SQL literals can contain secrets.
		const next = this.pending.then(async () => {
			await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
			await appendFile(this.file, `${JSON.stringify(safe)}\n`, { mode: 0o600 });
		});
		this.pending = next.catch(() => {});
		return next;
	}
}
