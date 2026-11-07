import { targetNamePattern } from './targets.js';

/** Only validated target names may enter user-facing usage guidance. */
export class TargetUsageError extends Error {
	constructor(requested: string, targets: readonly { name: string }[]) {
		const name = targetNamePattern.test(requested) ? ` ${requested}` : '';
		const names = targets.map(t => t.name).filter(n => targetNamePattern.test(n));
		super(`Unknown target${name}; configured targets: ${names.join(', ')} (see piagent targets)`);
		this.name = 'TargetUsageError';
	}
}
export function requireConfiguredTarget(requested: string, targets: readonly { name: string }[]): void {
	if (!targets.some(t => t.name === requested)) throw new TargetUsageError(requested, targets);
}
