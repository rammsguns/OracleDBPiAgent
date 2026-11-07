/** Display node-oracledb INTERVAL DAY TO SECOND without altering evidence. */
export function formatDuration(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value;
	const interval = value as Record<string, unknown>;
	const keys = ['days', 'hours', 'minutes', 'seconds', 'fseconds'];
	if (!keys.every(key => typeof interval[key] === 'number' && Number.isFinite(interval[key]))) return value;
	const [days, hours, minutes, seconds, nanos] = keys.map(key => interval[key] as number);
	const negative = [days, hours, minutes, seconds, nanos].some(n => n! < 0);
	const fraction = Math.abs(nanos!).toString().padStart(9, '0').replace(/0+$/, '');
	return `${negative ? '-' : ''}${days ? Math.abs(days) + 'd ' : ''}${days ? String(Math.abs(hours!)).padStart(2, '0') : Math.abs(hours!)}:${String(Math.abs(minutes!)).padStart(2, '0')}:${String(Math.abs(seconds!)).padStart(2, '0')}${fraction ? '.' + fraction : ''}`;
}
