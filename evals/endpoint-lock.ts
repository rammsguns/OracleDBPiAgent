import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalEndpoint } from '../src/config/eval.js';

/** Exclusive PID file, held for the entire eval (including health checks). */
export function acquireEndpointLock(endpoint: EvalEndpoint, directory = tmpdir()) {
	if (endpoint !== 'primary' && endpoint !== 'secondary') throw new Error('Invalid eval endpoint');
	const path = join(directory, `piagent-eval-${endpoint}.lock`);
	for (let attempt = 0; attempt < 3; attempt++) {
		let fd: number;
		try { fd = openSync(path, 'wx', 0o600); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			let pid: number;
			try { pid = Number(readFileSync(path, 'utf8')); }
			catch { continue; }
			// Empty/malformed files may belong to a process still writing its PID.
			if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Eval endpoint lock is busy or malformed; inspect it manually');
			try { process.kill(pid, 0); }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
					// Serialize recovery: only the process that exclusively claims the
					// recovery file may remove a dead owner's lock.
					let recovery: number;
					try { recovery = openSync(path + '.recover', 'wx', 0o600); }
					catch { throw new Error('Eval endpoint lock recovery in progress; retry later'); }
					try {
						if (readFileSync(path, 'utf8') === String(pid)) unlinkSync(path);
					} finally { closeSync(recovery); unlinkSync(path + '.recover'); }
					continue;
				}
			}
			throw new Error(`Eval endpoint ${endpoint} is already locked`);
		}
		try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			try { if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); } catch { /* already removed */ }
			process.off('exit', release);
			process.off('SIGINT', interrupt);
			process.off('SIGTERM', terminate);
		};
		const interrupt = () => { release(); process.exit(130); };
		const terminate = () => { release(); process.exit(143); };
		process.once('exit', release);
		process.once('SIGINT', interrupt);
		process.once('SIGTERM', terminate);
		return release;
	}
	throw new Error('Could not acquire eval endpoint lock');
}
