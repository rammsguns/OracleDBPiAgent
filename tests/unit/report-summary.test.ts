import { it, expect, vi, beforeEach } from 'vitest';
const fake = vi.hoisted(() => ({ provider: vi.fn(), streamFn: vi.fn(), result: vi.fn() }));
vi.mock('../../src/llm/index.js', () => ({ createStrataProvider: fake.provider }));
import { summarizeReport, checkReportSummary } from '../../src/report/summarize.js';
import type { LlmConfig } from '../../src/contracts.js';
const config = { maxOutputTokens: 1000, thinking: 'off', requestTimeoutSeconds: 10 } as LlmConfig;
beforeEach(() => { vi.clearAllMocks(); fake.provider.mockResolvedValue({ model: { id: 'local' }, streamFn: fake.streamFn }); fake.streamFn.mockResolvedValue({ result: fake.result }); fake.result.mockResolvedValue({ stopReason: 'stop', content: [{ type: 'text', text: 'See identity.' }] }); });
it('sends one Markdown input with no tools and a bounded local provider call', async () => {
	expect(await summarizeReport('# report', config)).toBe('See identity.');
	expect(fake.provider).toHaveBeenCalledExactlyOnceWith(config); expect(fake.streamFn).toHaveBeenCalledTimes(1);
	const call = fake.streamFn.mock.calls[0];
	expect(call?.[1]).toMatchObject({
		messages: [
			expect.objectContaining({
				role: 'system',
				content: expect.stringContaining('read-only diagnostic next steps only (what to query or check, and what to ask a DBA to review)'),
			}),
			expect.objectContaining({ role: 'user', content: '# report' }),
		],
	});
	const systemPrompt = call?.[1]?.messages?.find((m: { role: string }) => m.role === 'system')?.content;
	expect(systemPrompt).toContain('Do not recommend parameter changes, ALTER/DDL/DML, PL/SQL, restarts or any other change to the database');
	expect(call?.[2]).toMatchObject({ maxTokens: 1000, signal: expect.any(AbortSignal) });
});
for (const reason of ['error', 'aborted']) it(`sanitizes summary ${reason} and never retries`, async () => {
	fake.result.mockResolvedValue({ stopReason: reason, content: [], errorMessage: 'secret driver data' });
	await expect(summarizeReport('# report', config)).rejects.toThrow('Local report summary failed'); expect(fake.streamFn).toHaveBeenCalledTimes(1);
});

it.each([
	['Supported 12,345 rows.', []],
	['Unsupported 98,765 rows in PROMO.', ['98,765']],
	['Rounded 1234.6 seconds.', []],
	['Allocated 1.000 GiB.', []],
])('checks fake summary: %s', (summary, expected) => {
	const markdown = '# Report\n| ROWS | SECONDS | BYTES |\n| --- | --- | --- |\n| 12345 | 1234.567 | 1073741824 |';
	expect(checkReportSummary(summary, markdown, config)).toEqual(expected);
});
it('skips the check when grounding is disabled through the configured env switch', async () => {
	const { loadTunables } = await import('../../src/config/tunables.js');
	expect(checkReportSummary('Invented 98,765 rows.', '# Empty', { ...config, ...loadTunables({ PIAGENT_GROUNDING_CHECK: '0' }) })).toEqual([]);
});

const liveReport = `# Oracle 19c report: d1-19c-lab

## waits

Source: V$SYSTEM_EVENT

| EVENT | WAIT_CLASS | TOTAL_WAITS | TIME_WAITED_MICRO |

| --- | --- | --- | --- |

| control file parallel write | System I/O | 238016 | 1105786158 |

## top_sql

Source: V$SQL

| SQL_ID | EXECUTIONS | ELAPSED_TIME | CPU_TIME | BUFFER_GETS | SQL_TEXT |

| --- | --- | --- | --- | --- | --- |

| 4xm1ruvkx3awx | 7 | 1421306349 | 1402265374 | 0 | SELECT ... |
`;

it.each([
	['Oracle errors ORA-01653/ORA-01654.', liveReport],
	['Control file parallel write waited ~1,106 s.', liveReport],
	['SQL 4xm1ruvkx3awx used ~1,421 s elapsed and ~1,402 s CPU.', liveReport],
	['Control file parallel write waited ~1,537 s.', liveReport.replace('1105786158', '1537388159')],
])('accepts the live summary facts: %s', (summary, markdown) => {
	expect(checkReportSummary(summary, markdown, config)).toEqual([]);
});

it('still flags a genuinely wrong converted wait time', () => {
	expect(checkReportSummary('Control file parallel write waited ~1,206 s.', liveReport, config)).toEqual(['1,206']);
});

it('does not apply a table timing header to numbers in later sections', () => {
	const markdown = `${liveReport}\n## Notes\n\nObserved counter: 1206000000.\n`;
	expect(checkReportSummary('Waited ~1,206 s.', markdown, config)).toEqual(['1,206']);
});

it('aliases only exact known timing header cells', () => {
	const markdown = liveReport.replace('ELAPSED_TIME | CPU_TIME', 'OTHER_ELAPSED_TIME | CPU_TIME_TOTAL');
	expect(checkReportSummary('Elapsed ~1,421 s; CPU ~1,402 s.', markdown, config)).toEqual(['1,421', '1,402']);
});
