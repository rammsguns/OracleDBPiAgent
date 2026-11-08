import { AsyncLocalStorage } from 'node:async_hooks';
const actions = new AsyncLocalStorage<string>();
/** Nested collectors retain their outer command label. No SQL text or binds in labels. */
export function withOracleAction<T>(action: string, work: () => T): T {
	return actions.getStore() ? work() : actions.run(action.slice(0, 32), work);
}
export function oracleAction(): string { return actions.getStore() ?? 'query'; }
