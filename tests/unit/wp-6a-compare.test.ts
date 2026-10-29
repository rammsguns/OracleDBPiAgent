import { describe, expect, it } from 'vitest';
import { comparePerCase, type Report } from '../../evals/compare.js';
const report = (values: Record<string, number>): Report => ({ casesSha256: 'same', records: Object.entries(values).map(([id, input]) => ({ id, target: 'd1', iteration: 1, pass: true, usage: { input, output: 0 } })) });
describe('per-case token comparison', () => {
	it('recovers a uniform ratio, weighting small and large cases equally', () => {
		const r = comparePerCase([report({ small: 100, large: 10000 })], [report({ small: 105, large: 10500 })]);
		expect(r.percentChange).toBeCloseTo(5, 10);
		expect(r.ci95[0]).toBeCloseTo(5, 10);
		expect(r.ci95[1]).toBeCloseTo(5, 10);
		expect(r.planning.runsPerSide).toBeNull();
		expect(r.warnings.join(' ')).toMatch(/Single-run/);
	});
	it('gives identical distributions an interval containing zero and deterministic seeded output', () => {
		const a = [report({ x: 100, y: 200 }), report({ x: 140, y: 170 }), report({ x: 110, y: 220 })];
		const r = comparePerCase(a, a, { seed: 123 });
		expect(r.percentChange).toBe(0);
		expect(r.ci95[0]).toBeLessThan(0);
		expect(r.ci95[1]).toBeGreaterThan(0);
		expect(comparePerCase(a, a, { seed: 123 })).toEqual(r);
		expect(comparePerCase(a, a, { seed: 124 }).ci95).not.toEqual(r.ci95);
		expect(r.planning.runsPerSide).toBeGreaterThanOrEqual(2);
	});
	it('reports cases missing on each side and permits unequal run counts', () => {
		const r = comparePerCase([report({ x: 10, onlyA: 20 })], [report({ x: 11, onlyB: 30 }), report({ x: 12 })]);
		expect(r.skipped).toEqual({ missingFromA: ['onlyB'], missingFromB: ['onlyA'] });
		expect(r.cases[0]).toMatchObject({ id: 'x', aRuns: 1, bRuns: 2 });
	});
	it('sorts by absolute log contribution and reports the observed case variance planning limit', () => {
		const a = [report({ x: 100, y: 100 }), report({ x: 100, y: 100 })];
		const b = [report({ x: 200, y: 110 }), report({ x: 200, y: 110 })];
		const r = comparePerCase(a, b);
		expect(r.cases.map(c => c.id)).toEqual(['x', 'y']);
		expect(r.percentChange).toBeCloseTo((Math.sqrt(2 * 1.1) - 1) * 100);
		expect(r.planning.runsPerSide).toBeNull();
		expect(r.planning.reason).toMatch(/No finite runs-only/);
	});
	it('rejects undefined ratios, invalid seeds, inconsistent targets and hashes', () => {
		expect(() => comparePerCase([report({ x: 0 })], [report({ x: 1 })])).toThrow(/positive/);
		expect(() => comparePerCase([report({ x: 1 })], [report({ y: 1 })])).toThrow(/No common/);
		expect(() => comparePerCase([], [], { seed: -1 })).toThrow(/seed/);
		const b = report({ x: 1 }); b.records[0]!.target = 'p1';
		expect(() => comparePerCase([report({ x: 1 })], [b])).toThrow(/targets/);
		expect(() => comparePerCase([report({ x: 1 })], [{ ...b, casesSha256: 'other' }])).toThrow(/hashes/);
	});
});
