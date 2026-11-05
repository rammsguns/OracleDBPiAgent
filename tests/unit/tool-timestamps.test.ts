import { afterEach, expect, it } from 'vitest';
import { boundedResult, renderDescribe } from '../../src/tools/index.js';

const originalTZ = process.env.TZ;
afterEach(() => {
	if (originalTZ === undefined) delete process.env.TZ;
	else process.env.TZ = originalTZ;
});

for (const timezone of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
	it(`renders stored wall clocks and UTC instants independently of host TZ (${timezone})`, () => {
		process.env.TZ = timezone;
		// Both sides of the US spring transition and repeated autumn hour.
		for (const iso of ['2026-03-08T06:59:59.123Z', '2026-03-08T07:00:00.456Z', '2026-11-01T05:30:00.789Z', '2026-11-01T06:30:00.789Z']) {
			const date = new Date(iso);
			const pad = (n: number, width = 2) => String(n).padStart(width, '0');
			const wall = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
			const result = { columns: ['D', 'T', 'TZ', 'LTZ', 'UNKNOWN', 'NULL', 'TEXT'], columnTypes: ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH LOCAL TIME ZONE', 'OTHER', 'DATE', 'VARCHAR2'], rows: [[date, date, date, date, date, null, 'hello\nworld']], truncated: false, elapsedMs: 0 };
			const output = boundedResult(result, 16000);
			expect(output.content[0]!.text.split('\n')[1]).toBe(`${wall} | ${wall}.${pad(date.getMilliseconds(), 3)} | ${iso} | ${iso} | ${wall} | NULL | hello world`);
			expect(output.details.rows[0][0]).toBeInstanceOf(Date);
			expect(output.details.rows[0][0].getTime()).toBe(date.getTime());
			expect(result.rows[0]![0]).toBe(date);
			const legacy = boundedResult({ ...result, columnTypes: undefined, rows: [[date]] }, 16000);
			expect(legacy.content[0]!.text.split('\n')[1]).toBe(wall);
		}
	});
}

it('uses column metadata in compact describe cells and preserves Dates in details', () => {
	process.env.TZ = 'America/New_York';
	const date = new Date('2026-11-01T06:30:00.789Z');
	const result = { columns: ['KIND', 'NAME', 'VALUE', 'EXTRA'], columnTypes: ['VARCHAR2', 'VARCHAR2', 'TIMESTAMP WITH TIME ZONE', 'VARCHAR2'], rows: [['STATS', 'TABLE', date, null]], truncated: false, elapsedMs: 0 };
	const output = boundedResult(result, 16000, renderDescribe);
	expect(output.content[0]!.text).toContain('TABLE|2026-11-01T06:30:00.789Z|NULL');
	expect(output.details.rows[0][2]).toBeInstanceOf(Date);
});
