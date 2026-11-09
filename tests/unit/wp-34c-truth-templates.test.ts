import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { score } from '../../evals/scoring.js';
import { validateFactTemplates } from '../../evals/validate-hard.js';
import type { EvalCase } from '../../evals/types.js';

const fullest: EvalCase = { id: 'hard-p30-d1-fullest-permanent', target: 'd1-19c-lab', category: 'check', question: 'test', groundTruth: { sql: 'SELECT tablespace_name, used_range FROM x', mode: 'rowCells', factTemplates: ['\\b{0}\\b[^\\n]{0,80}\\bfullest\\b|\\bfullest\\b[^\\n]{0,80}\\b{0}\\b', '(?:classification|class|band|level)\\W{0,10}\\**{1}\\b|\\b{1}\\b\\**\\s*\\((?:below|under|<)'] }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
const stats: EvalCase = { id: 'hard-p19-object-statistics', target: 'p1-19c-prod', category: 'sql-performance', question: 'test', groundTruth: { sql: 'SELECT owner, object_name, stale_stats, statistics_presence FROM x', mode: 'rowCells', factTemplates: ['\\b{0}\\b', '\\b{1}\\b[^\\n]*\\bstale\\b[^\\n]*\\b{2}\\b[^\\n]*\\b{3}\\b', '\\b{1}\\b[^\\n]*STALE_STATS\\W*=?\\W*{2}\\b[^\\n]*\\b{3}\\b', '\\b{1}\\b[^\\n]*\\b{2}\\b[^\\n]*\\b{3}\\b'] }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
const result = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
const check = (test: EvalCase, rows: unknown[][], answer: string) => score(test, result(answer), rows).pass;
const d1Truth = [['SYSAUX', 'LOW']];
const p1Truth = [['SHOPAPP', 'PRODUCTS', 'YES', 'PRESENT'], ['SHOPAPP', 'SYS_C007655', 'YES', 'PRESENT']];

it('scores the required fullest-permanent gate answer and rejects contradictory or incomplete claims', () => {
	const pass = '**SYSAUX** is the fullest permanent tablespace on **d1-19c-lab** by percentage of maximum available file capacity.\n\n| Tablespace | Used Bytes | Max Capacity Bytes | Used % |\n|---|---|---|---|\n| SYSAUX | 1,319,108,608 | 34,359,721,984 | ~3.8% |\n| SYSTEM | 1,036,255,232 | 34,359,721,984 | ~3.0% |\n\nSYSAUX has the highest used-to-max ratio.\n\n**Classification: LOW** (below 50%)';
	expect(check(fullest, d1Truth, pass)).toBe(true);
	for (const answer of [
		'SYSTEM is the fullest permanent tablespace.\n| SYSAUX | ... | 3.8% |\nClassification: LOW',
		'SYSAUX is the fullest permanent tablespace. Classification: HIGH',
		'SYSAUX is the fullest permanent tablespace. Classification: MEDIUM (not LOW)',
		'I could not determine the fullest tablespace; SYSAUX and SYSTEM are LOW'
		,'SYSTEM is the fullest, ahead of SYSAUX. Classification: LOW (below 50%)'
	]) expect(check(fullest, d1Truth, answer)).toBe(false);
});

it('scores each statistics object on its own line and requires the owner and every object', () => {
	const pass = '| `PRODUCTS` | Table | **Stale** (`STALE_STATS = YES`) | **PRESENT** |\n| `SYS_C007655` | Index (UNIQUE, ...) | **Stale** (`STALE_STATS = YES`) | **PRESENT** |\nThe plan was parsed by the SHOPAPP login.';
	expect(check(stats, p1Truth, pass)).toBe(true);
	expect(check(stats, p1Truth, pass.replace('Stale** (`STALE_STATS = YES`)', 'Not stale (`STALE_STATS = NO`)'))).toBe(false);
	expect(check(stats, p1Truth, pass.replace('PRESENT', 'MISSING'))).toBe(false);
	expect(check(stats, p1Truth, pass.replace(/^.*SYS_C007655.*\n?/m, ''))).toBe(false);
	expect(check(stats, p1Truth, pass.replace(/SHOPAPP/g, 'OTHER_OWNER'))).toBe(false);
});

it('validates allowlist, indexes, syntax and forbidden lookaround', async () => {
	validateFactTemplates(fullest);
	validateFactTemplates(stats);
	const reject = (test: EvalCase) => expect(() => validateFactTemplates(test)).toThrow();
	reject({ ...fullest, id: 'hard-other-case' });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['\\b{2}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['(?=x)\\b{0}\\b'] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['['] } });
	reject({ ...fullest, groundTruth: { ...fullest.groundTruth!, factTemplates: ['\\b{0}\\b', '(?!x)'] } });
	const cases = JSON.parse(await readFile(new URL('../../evals/cases-hard/phase30-check.json', import.meta.url), 'utf8')) as EvalCase[];
	expect(cases.find(test => test.id === fullest.id)?.groundTruth?.factTemplates).toBeDefined();
});
