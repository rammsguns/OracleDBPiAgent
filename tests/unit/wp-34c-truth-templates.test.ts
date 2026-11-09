import { beforeAll, expect, it } from 'vitest';
import { loadHardCases, validateFactTemplates } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

const result = (answer: string, toolCalls: string[] = []) => ({ answer, toolCalls, usage: { input: 0, output: 0 } });
let fullest: EvalCase;
let stats: EvalCase;
const d1Truth = [['SYSAUX', 'LOW']];
const p1Truth = [['SHOPAPP', 'PRODUCTS', 'YES', 'PRESENT'], ['SHOPAPP', 'SYS_C007655', 'YES', 'PRESENT']];

beforeAll(async () => {
	const cases = await loadHardCases();
	fullest = cases.find(test => test.id === 'hard-p30-d1-fullest-permanent')!;
	stats = cases.find(test => test.id === 'hard-p19-object-statistics')!;
	expect(fullest.groundTruth?.factTemplates).toBeDefined();
	expect(stats.groundTruth?.factTemplates).toBeDefined();
});

const check = (test: EvalCase, rows: unknown[][], answer: string) => score(test, result(answer, test.id === 'hard-p19-object-statistics' ? ['run_query'] : []), rows).pass;

it('scores p30 winner sentence and class through the real case definition', () => {
	const pass = '**SYSAUX** is the fullest permanent tablespace on **d1-19c-lab** by percentage of maximum available file capacity.\n\n| Tablespace | Used Bytes | Max Capacity Bytes | Used % |\n|---|---|---|---|\n| SYSAUX | 1,319,108,608 | 34,359,721,984 | ~3.8% |\n| SYSTEM | 1,036,255,232 | 34,359,721,984 | ~3.0% |\n\nSYSAUX has the highest used-to-max ratio.\n\n**Classification: LOW** (below 50%)';
	expect(check(fullest, d1Truth, pass)).toBe(true);
	expect(check(fullest, d1Truth, 'Fullest permanent tablespace: SYSAUX. Classification: LOW')).toBe(true);
	expect(check(fullest, d1Truth, '**SYSAUX** has the highest used percentage. Classification: **LOW**')).toBe(true);
	for (const answer of [
		'SYSTEM is the fullest permanent tablespace.\n| SYSAUX | ... | 3.8% |\nClassification: LOW',
		'Fullest permanent tablespace: SYSTEM. SYSAUX has 3.8% usage. Classification: LOW',
		'The fullest permanent tablespace is SYSTEM, not SYSAUX. Classification: LOW',
		'The fullest is SYSTEM; SYSAUX is second. Classification: LOW',
		'SYSTEM is fuller than SYSAUX. SYSAUX is the second fullest. Classification: LOW',
		'SYSAUX might be the fullest permanent tablespace. Classification: LOW',
		'Maybe SYSAUX is the fullest permanent tablespace. Classification: LOW',
		'SYSTEM has the highest used percentage. SYSAUX | 3.8%. Classification: LOW',
		'The fullest is SYSAUX; | Tablespace | Used % | Classification |\n|---|---|---|\n| SYSAUX | 3.8% | LOW |',
		'| **SYSAUX** | **3.8%** | **LOW** |',
		'I could not determine the fullest tablespace; SYSAUX and SYSTEM are LOW',
		'SYSAUX is the fullest permanent tablespace. Classification: HIGH',
		'SYSAUX is the fullest permanent tablespace. Classification: MEDIUM (not LOW)',
	]) expect(check(fullest, d1Truth, answer), answer).toBe(false);
});

it('scores p19 owner and per-object stale/presence facts independently of column order', () => {
	const standard = '| `PRODUCTS` | Table | **Stale** (`STALE_STATS = YES`) | **PRESENT** |\n| `SYS_C007655` | Index (UNIQUE, ...) | **Stale** (`STALE_STATS = YES`) | **PRESENT** |\nThe plan was parsed by the SHOPAPP login.';
	expect(check(stats, p1Truth, standard)).toBe(true);
	const reordered = '| **PRESENT** | `PRODUCTS` | Table | `STALE_STATS = YES` |\n| **PRESENT** | `SYS_C007655` | Index (UNIQUE, ...) | `STALE_STATS=YES` |\nSHOPAPP owner.';
	expect(check(stats, p1Truth, reordered)).toBe(true);
	for (const answer of [
		standard.replace('**Stale** (`STALE_STATS = YES`)', '**Not stale** (`STALE_STATS = NO`)'),
		standard.replace('**Stale** (`STALE_STATS = YES`)', '**Non-stale** (`STALE_STATS = YES`)'),
		standard.replace('STALE_STATS = YES', 'STALE_STATS = NO'),
		'| PRODUCTS | Table | Not stale | PRESENT |\n| SYS_C007655 | Index | Not stale | PRESENT |\nSHOPAPP',
		standard.replace(/^.*SYS_C007655.*\n?/m, ''),
		standard.replace(/SHOPAPP/g, 'OTHER_OWNER'),
		'| PRODUCTS | Table | Stale | MISSING |\n| SYS_C007655 | Index | Stale | PRESENT | SHOPAPP',
	]) expect(check(stats, p1Truth, answer)).toBe(false);
});

it('validates the real case definitions and rejects unsafe templates', async () => {
	validateFactTemplates(fullest);
	validateFactTemplates(stats);
	const reject = (test: EvalCase) => expect(() => validateFactTemplates(test)).toThrow();
	reject({ ...fullest, id: 'hard-other-case' });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['\\b{2}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['(?=x)\\b{0}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['(?!x)\\b{0}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['(?<=x)\\b{0}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['['] } });
});
