# Code Review: OracleDBPiAgent (WP-6A Per-Case Token Comparison)

**Date:** 2026-10-29  
**Reviewer:** Antigravity (Statistical & Code Review Agent)  
**Target:** Commit `6496c0958d1458a219cc8f202386c7452bec987c` on branch `rammsguns/wp-6a-per-case-compare` (diff against `needlefish` / `475b0fd`)  
**Files Under Review:**
- `evals/compare.ts`
- `tests/unit/wp-6a-compare.test.ts`
- `docs/evals-hard.md` (WP-6A section)

**Verdict:** REQUEST CHANGES (Statistical Planning Formula)

---

## Executive Summary

Commit `6496c09` implements Work Package WP-6A, introducing an opt-in `--per-case` evaluation mode in `evals/compare.ts` with a two-level hierarchical bootstrap (cases and within-case runs resampled with replacement), equal-case geometric mean point estimation, and sample size planning for a target $\pm 3\%$ interval half-width.

The implementation of the two-level bootstrap, PRNG, seed determinism, point estimand, CLI argument parsing, backward compatibility with default per-run comparison, and synthetic unit tests is exemplary. All historical validations from `eval-archive/phase5/` and `eval-archive/phase2/` were reproduced using the CLI without LLM or database calls, matching every reported number to the second decimal place. `npm run typecheck` passes with zero errors and `npm test` passes all 592 tests across 31 test files.

However, the **runs-per-side sample size planning formula** is statistically flawed: it treats the sample variance of noisy pilot case estimates ($s_{\text{between}}^2$) as the true between-case variance floor without de-noising. Because small pilot runs ($n=2$ or $4$) have high within-case estimation error, $s_{\text{between}}^2$ heavily double-counts within-case noise. As a result, $s_{\text{between}}^2 / C$ exceeds the target threshold in **100% of historical eval datasets**—including both A/A tests where true between-case variance is mathematically zero—causing the planning tool to return `null` ("no finite runs-only estimate") unconditionally. We recommend adopting a standard method-of-moments de-noised variance estimator, which unblocks sample size planning on A/A runs (estimating 12–14 runs/side) while preserving conservative bounds on genuinely heterogeneous treatments.

---

## Detailed Evaluation Against Review Criteria

### 1. Two-Level Hierarchical Bootstrap & PRNG Quality

- **Resampling Hierarchy:**
  - Outer level: $C$ common case IDs are resampled with replacement using `pick(cases)`.
  - Inner level: For each selected case occurrence, observations on arm A ($n_{A,c}$) and arm B ($n_{B,c}$) are independently resampled with replacement via `drawMean()`.
  - Repeated selections of the same case in the outer loop receive independent, fresh inner resamples (`aa.get(c.id)!.tokens` and `bb.get(c.id)!.tokens`), correctly implementing a two-stage cluster bootstrap for independent arms (Davison & Hinkley, *Bootstrap Methods and Their Application*, §3.8).
- **Percentile Interval Indexing:**
  - With sorted draws array of length $B = 10,000$:
    - Lower 2.5%: `draws[Math.floor(samples * 0.025)]` $\rightarrow$ `draws[250]`.
    - Upper 97.5%: `draws[Math.ceil(samples * 0.975) - 1]` $\rightarrow$ `draws[9749]`.
  - There are exactly 250 values strictly below index 250 ($2.5\%$) and 250 values strictly above index 9749 ($2.5\%$), enclosing exactly 9,500 draws ($95.0\%$).
- **PRNG Quality:**
  - Uses Numerical Recipes' 32-bit linear congruential generator:
    $$\text{state}_{k+1} = (1664525 \times \text{state}_k + 1013904223) \pmod{2^{32}}$$
  - Since $c = 1013904223$ is coprime to $2^{32}$ and $a - 1 = 1664524$ is divisible by 4, the Hull-Dobell Theorem guarantees a full period of $2^{32} \approx 4.29 \times 10^9$.
  - In a 10,000-draw bootstrap of 28 cases with 2 runs per arm, total pseudorandom draws are $28 \times (1 + 2 + 2) \times 10,000 = 1.4 \times 10^6 \ll 2^{32}$.
  - Bit extraction: High bits are extracted via `Math.floor((state / 4294967296) * xs.length)`, avoiding the low-bit periodicity of LCGs.
- **Seed Determinism:**
  - Determinism is verified across runs: identical seeds yield bitwise-identical intervals; differing seeds produce distinct stochastic trajectories.

---

### 2. Point Estimate Consistency

- For each common case $c \in \{1, \dots, C\}$:
  $$r_c = \frac{\bar{Y}_{c}}{\bar{X}_{c}} = \frac{\text{mean}(\text{tokens } B_c)}{\text{mean}(\text{tokens } A_c)}$$
  $$\log r_c = \log \bar{Y}_c - \log \bar{X}_c$$
- Reported percent change:
  $$\Delta\% = 100 \times \left( \exp\left( \frac{1}{C} \sum_{c=1}^C \log r_c \right) - 1 \right) = 100 \times \text{expm1}\left( \frac{1}{C} \sum_{c=1}^C \log r_c \right)$$
- Every bootstrap replicate evaluates the exact same functional:
  $$\Delta\%^* = 100 \times \text{expm1}\left( \frac{1}{C} \sum_{i=1}^C (\log \bar{Y}_i^* - \log \bar{X}_i^*) \right)$$
- Each case contributes equally with weight $1/C$, directly fulfilling WP-6A's specification of an equal-case geometric mean estimand independent of raw token magnitude.

---

### 3. Runs-Per-Side Planning Formula & Variance De-Noising

#### Statistical Analysis of the Current Formula
In `evals/compare.ts` lines 113–124:
```typescript
const count = cases.length;
const between = variance(cases.map(c => c.logRatio));
const within = mean(cases.map(c => c.withinA + c.withinB));
const budget = count * (Math.log(1.03) / 1.96) ** 2 - between;
const insufficient = cases.some(c => c.aRuns < 2 || c.bRuns < 2);
const runsPerSide = insufficient || budget <= 0 ? null : Math.max(2, Math.ceil(within / budget));
```

The underlying model states:
$$\text{Var}(\log \text{GM}) \approx \frac{s_{\text{between}}^2 + \frac{w}{n}}{C}$$
where $w = \text{mean}(CV_A^2 + CV_B^2)$.

This formula has a major theoretical and practical defect:
1. **Double Counting of Within-Case Noise:**
   $s_{\text{between}}^2$ is computed directly from the pilot point estimates $\hat{\theta}_{c} = \log(\bar{Y}_{c,\text{pilot}} / \bar{X}_{c,\text{pilot}})$. By the delta method:
   $$\hat{\theta}_c = \theta_c + e_c, \quad \text{where } \text{Var}(e_c) \approx \frac{CV_{A,c}^2}{n_{A,\text{pilot}}} + \frac{CV_{B,c}^2}{n_{B,\text{pilot}}}$$
   Therefore, the sample variance of observed case ratios has expected value:
   $$E[s_{\text{between}}^2] \approx \sigma_{\text{true between}}^2 + \text{mean}\left( \frac{CV_{A,c}^2}{n_{A,\text{pilot}}} + \frac{CV_{B,c}^2}{n_{B,\text{pilot}}} \right)$$
   For $n_{A} = n_{B} = n_{\text{pilot}}$, $E[s_{\text{between}}^2] \approx \sigma_{\text{true between}}^2 + \frac{w}{n_{\text{pilot}}}$.
   By substituting $s_{\text{between}}^2$ into the planning formula and adding $\frac{w}{n}$, the formula double-counts the within-case noise term.
2. **Pathological Behavior on Pilot Data:**
   In small-sample pilots ($n_{\text{pilot}} = 2$), $\frac{w}{n_{\text{pilot}}}$ is large ($\approx 0.022$ to $0.035$).
   For $C = 28$ and target half-width $\log(1.03) / 1.96 \approx 0.01508$, the total variance budget is:
   $$C \times \left( \frac{\log(1.03)}{1.96} \right)^2 = 28 \times 0.00022744 = 0.006368$$
   Even in an **A/A test** where true between-case effect $\theta_c = 0$ for all $c$ ($\sigma_{\text{true between}}^2 = 0$), pilot sampling noise blows up $s_{\text{between}}^2$ to $0.0239$ – $0.0524$. Because $s_{\text{between}}^2 > 0.006368$, `budget` is negative, and `runsPerSide` returns `null` for every A/A run!
   The tool effectively declares that no finite number of runs (not even 1,000,000 runs) can achieve $\pm 3\%$, despite evaluating identical code.

#### Better Choice: Method-of-Moments De-Noising
We strongly recommend estimating true between-case variance via standard method-of-moments de-noising (as in DerSimonian-Laird random effects):
$$\hat{\sigma}_{\text{true between}}^2 = \max\left( 0, s_{\text{between}}^2 - \text{mean}\left( \frac{CV_{A,c}^2}{n_{A,c}} + \frac{CV_{B,c}^2}{n_{B,c}} \right) \right)$$
$$\text{budget} = C \times \left( \frac{\log(1.03)}{1.96} \right)^2 - \hat{\sigma}_{\text{true between}}^2$$
$$n = \left\lceil \frac{w}{\text{budget}} \right\rceil$$

**Comparison on the Archived Validations:**
| Validation Run | Observed $s_{\text{between}}^2$ | Pilot Noise $\bar{\sigma}_{\text{pilot}}^2$ | De-noised $\hat{\sigma}_{\text{true between}}^2$ | Current `runsPerSide` | De-Noised `runsPerSide` |
|---|---:|---:|---:|---|---|
| **Phase 5 A/A {1,3} vs {2,4}** | 0.023870 | 0.035480 | **0.000000** | `null` | **12 runs/side** |
| **Phase 2 Candidate A/A** | 0.027527 | 0.030807 | **0.000000** | `null` | **14 runs/side** |
| **Phase 5 A/A {1,2} vs {3,4}** | 0.052402 | 0.022561 | 0.029841 | `null` | `null` (high pilot noise) |
| **WP-2A Baseline vs Candidate** | 0.024547 | 0.016243 | 0.008304 | `null` | `null` (genuine case heterogeneity) |

De-noising allows the planning tool to fulfill its intended purpose on clean A/A runs, predicting that 12 to 14 runs per side will reduce within-case noise sufficiently to achieve $\pm 3\%$. At the same time, when genuine treatment heterogeneity across cases exceeds the threshold (as in WP-2A, where grounding fired on specific cases causing $+49\%$ changes), it correctly returns `null`.

---

### 4. CLI Argument Handling & Backward Compatibility

- **Default Execution:**
  Running `node --import tsx evals/compare.ts --a ... --b ...` without `--per-case` calls `compare()` unmodified. All properties (`direction`, `pairedBlocks`, `cases`, `suite.tokens`, `suite.passRate`, `suite.toolErrors`) match historical behavior byte-for-byte.
- **Opt-in Execution:**
  Adding `--per-case` invokes `comparePerCase()`.
- **Validation of `--seed`:**
  - Enforces `--per-case` presence: `node --import tsx evals/compare.ts --seed 123` throws `'--seed requires --per-case and an unsigned integer'`.
  - Non-numeric or negative values (`--seed -1`, `--seed abc`) are rejected.
  - Omission defaults cleanly to seed 8129.

---

### 5. Archived Validation Reproduction

All historical eval runs were reproduced directly using the CLI with seed 8129 and 10,000 draws:

1. **Phase 5 A/A {1,2} vs {3,4} (28 cases, 2 runs/arm):**
   - Percent change: `-1.8003%` (doc: `−1.80%`)
   - 95% CI: `[-10.5991%, +7.2170%]` (doc: `[−10.60%, +7.22%]`)
   - Variances: $s_{\text{between}}^2 = 0.05240172$, $w = 0.04512204$ (doc: `(0.05240172, 0.04512204)`)
2. **Phase 5 A/A {1,3} vs {2,4} (28 cases, 2 runs/arm):**
   - Percent change: `-0.0659%` (doc: `−0.07%`)
   - 95% CI: `[-7.4164%, +7.8353%]` (doc: `[−7.42%, +7.84%]`)
   - Variances: $s_{\text{between}}^2 = 0.02386965$, $w = 0.07095932$ (doc: `(0.02386965, 0.07095932)`)
3. **WP-2A Baseline vs Candidate (20 cases, 4 runs/arm):**
   - Percent change: `+1.1283%` (doc: `+1.13%`)
   - 95% CI: `[-6.6709%, +10.4485%]` (doc: `[−6.67%, +10.45%]`)
   - Variances: $s_{\text{between}}^2 = 0.02454669$, $w = 0.06497155$ (doc: `(0.02454669, 0.06497155)`)
   - Top absolute log contributors:
     - `hard-follow-plan`: `+49.24%` (contribution $+0.0200$)
     - `hard-region-channel`: `+47.75%` (contribution $+0.0195$)
     - `hard-share`: `-22.47%` (contribution $-0.0127$)
4. **Phase 2 Baseline A/A {1,2} vs {3,4}:**
   - Percent change: `+3.1987%` (doc: `+3.20%`), 95% CI: `[-6.8045%, +15.4424%]`
5. **Phase 2 Candidate A/A {1,2} vs {3,4}:**
   - Percent change: `-5.7167%` (doc: `−5.72%`), 95% CI: `[-13.9741%, +2.9044%]`

Every A/A interval spans zero. All values match `docs/evals-hard.md` exactly.

---

### 6. Test Suite & Verification

- `npm run typecheck`: Passed with 0 errors.
- `npm test`: Passed **592 tests across 31 test files**.
- Direct strict TypeScript check on `evals/compare.ts` and `tests/unit/wp-6a-compare.test.ts` passed with 0 errors.
- **Evaluation of Synthetic Unit Tests:**
  - `recovers a uniform ratio, weighting small and large cases equally`: Proves ratio recovery is independent of absolute scale; confirms single-run handling and null planning.
  - `gives identical distributions an interval containing zero and deterministic seeded output`: Verifies exact zero point estimate, confidence interval spanning zero, seed sensitivity/reproducibility, and finite `runsPerSide >= 2` when between-case variance is zero.
  - `reports cases missing on each side and permits unequal run counts`: Tests set difference logic for missing cases and unequal arm observations.
  - `sorts by absolute log contribution and reports the observed case variance planning limit`: Validates descending order of absolute log contribution and budget truncation.
  - `rejects undefined ratios, invalid seeds, inconsistent targets and hashes`: Validates boundary checks and input validation.

---

## Required Fixes (for REQUEST_CHANGES)

To resolve the planning formula double-counting and enable functional sample size planning, apply the following minimal patch:

### 1. `evals/compare.ts`
Replace lines 116–128 with:
```typescript
	const count = cases.length;
	const between = variance(cases.map(c => c.logRatio));
	const within = mean(cases.map(c => c.withinA + c.withinB));
	const pilotNoise = mean(cases.map(c => c.withinA / c.aRuns + c.withinB / c.bRuns));
	const trueBetween = Math.max(0, between - pilotNoise);
	// Delta method with method-of-moments de-noised between-case variance:
	// Var(overall log ratio) ~= (sigma_true_between² + mean(CV_A² + CV_B²)/n) / C.
	// Solve 1.96 * sqrt(V) <= log(1.03) for equal future runs per arm/case.
	const budget = count * (Math.log(1.03) / 1.96) ** 2 - trueBetween;
	const insufficient = cases.some(c => c.aRuns < 2 || c.bRuns < 2);
	const runsPerSide = insufficient || budget <= 0 ? null : Math.max(2, Math.ceil(within / budget));
	return { mode: 'per-case', direction: 'B / A; percent change in geometric mean of case mean-token ratios', seed, samples,
		percentChange: pct(mean(cases.map(c => c.logRatio))), ci95: [draws[Math.floor(samples * .025)]!, draws[Math.ceil(samples * .975) - 1]!],
		skipped, planning: { targetHalfWidthPercent: 3, runsPerSide, betweenLogVariance: between, denoisedBetweenLogVariance: trueBetween, meanWithinRelativeVariance: within,
			reason: insufficient ? 'Within-case variance unknown with fewer than two runs on either side' : budget <= 0 ? 'No finite runs-only estimate under the de-noised between-case variance model' : 'Method-of-moments delta-method approximation; runs per arm per case' },
```

### 2. `docs/evals-hard.md`
Update the planning description in §"Runs needed for a ±3% interval" and update the table in §"Archived validation" to record `12` runs/arm for Phase 5 A/A {1,3} vs {2,4} and `14` runs/arm for Phase 2 candidate A/A.

### 3. `tests/unit/wp-6a-compare.test.ts`
Add a synthetic test verifying that de-noised planning correctly calculates finite runs when observed case variance is entirely driven by within-case pilot noise.

---

*(Note: If the coordinator knowingly chooses to accept the uncorrected fixed-floor model as an intentionally conservative lower bound for WP-6A and defer de-noising to a later work package, all other implementation aspects meet project standards.)*
