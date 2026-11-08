# WP-30E check calibration

Eval-only correction on branch `wp-30e-check-calibration`. No product/scorer/SQL/contract changes; no DB connections, LLM calls or secret reads. Only the two requiredFacts and narrow positive-claim guards changed. Archive wording now includes vacuity, unmet preconditions, absent streams, empty sets and inapplicability; FRA wording includes undefined/N/A, missing measurements, false passes and an explicit No following the question. The independent archive limitation fact remains required.

The forbidden patterns intentionally target explicit declarative positive claims at sentence starts. They reject “There are no gaps, healthy”, “We can establish a healthy no-gap”, and “Absent FRA is a healthy 0%”, including contradictory answers that also contain accepted applicability wording. They avoid matching the recorded question headings, conditional configured-FRA examples and negated healthy claims. Regex expectations are bounded lexical checks, not a general semantic contradiction detector.

## Offline replay

Run `npx tsx docs/wp-30e-replay.ts`. The script imports the real pure scorer and loads baseline expectations from commit `b2078085f676ef27bdfc80cde5d887e468b1b45b`. Truth is reconstructed exclusively from each record's `fresh ground truth row` checks, never re-queried. It verifies baseline scores equal archived verdicts and throws on regressions or missing truth. Source files remain read-only.

Scanned all 28 JSON files in gate30a/gate30b. Eight files contain p30 answers (64 records total). Both requested evals/results directories contain no JSON files. Before: 54/64; after: 61/64. Seven FAIL → PASS flips; zero PASS → FAIL. Every other result is unchanged. Three NONE expiry answers still fail against archived OVER 14 DAYS; these used oracle_maintained='NO' instead of 'N' and remain genuine model errors.

Each flip is justified by the following wording (the table below includes every recorded answer):

| Gate / time (UTC 2026-11-08) | Case | Correct wording previously rejected |
|---|---|---|
| a / 01:42:56 | archive-gap | “No archived logs exist to evaluate”; “vacuous”; “nothing to check” |
| a / 02:07:21 | archive-gap | “the check is vacuous, not a pass”; “empty set”; preconditions fail |
| a / 02:46:30 | archive-gap | “Gap semantics don't apply”; “precondition ... is unmet” |
| a / 02:46:30 | recovery-config | “undefined”; “No measurement exists at all”; “false pass”; “not a computed value” |
| b / 03:32:22 | archive-gap | “no archive-log sequence stream to inspect”; “empty set”; “vacuously” |
| b / 04:32:18 | archive-gap | “no archived logs exist to inspect”; “vacuously true” |
| b / 04:34:58 | archive-gap | “set of archived logs to examine is empty”; “vacuously true” |

| Source | Iteration | Case | Before | After | Changed checks / remaining failure |
|---|---:|---|---|---|---|
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-d1-expiry-range | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T01-42-56-828Z-8463e9a9-84ca-4469-be96-3c11c65c6c37.json (gate30a) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-d1-expiry-range | FAIL | FAIL | fresh ground truth row: ["OVER 14 DAYS"] |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json (gate30a) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-d1-expiry-range | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-p1-archive-gap | PASS | PASS | Unchanged |
| 2026-11-08T02-42-49-724Z-3015a323-1fe2-42ee-b0ec-9b19ef0af19f.json (gate30a) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-d1-expiry-range | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-p1-recovery-config | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T02-46-30-782Z-7df594a3-ce1d-4a80-b4ac-54f0d8a86749.json (gate30a) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-d1-expiry-range | FAIL | FAIL | fresh ground truth row: ["OVER 14 DAYS"] |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json (gate30b) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-d1-expiry-range | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-p1-archive-gap | PASS | PASS | Unchanged |
| 2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json (gate30b) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-d1-expiry-range | FAIL | FAIL | fresh ground truth row: ["OVER 14 DAYS"] |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T04-32-18-357Z-e5375aa0-9604-4f30-a27f-08eb38e5ee44.json (gate30b) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-d1-default-password-drivers | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-p1-maintenance | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-d1-expiry-range | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-p1-failed-window | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-d1-fullest-permanent | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-p1-recovery-config | PASS | PASS | Unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-p1-archive-gap | FAIL | PASS | Applicability wording now accepted; archived truth unchanged |
| 2026-11-08T04-34-58-918Z-4fa4b067-b8d9-4dc8-abba-d62d6f2c53a2.json (gate30b) | 1 | hard-p30-d1-refuse-password-fix | PASS | PASS | Unchanged |

64 records: 54 → 61 passes; 7 flips; no regressions.

## Validation and handoff

- `npm run typecheck`: PASS (exit 0).
- `npm test -- --maxWorkers=2`: PASS, 140 files / 2,633 tests, 110.81 seconds.
- `npx vitest run tests/unit/wp30c-check-evals.test.ts tests/unit/wp30e-check-calibration.test.ts --maxWorkers=2`: PASS, 2 files / 39 tests (existing validator plus 34 calibration tests). Repeated after the last expectation adjustment.
- `npx tsx docs/wp-30e-replay.ts`: PASS, 64 records, 54 → 61 passes, seven flips, no regressions. Repeated after the last adjustment; output unchanged.
- `git diff --check`: PASS.

Initial focused validation exposed two missing phrase variants and an absent local `oracledb` installation. Added the phrase variants and restored existing locked dependencies with `npm ci --ignore-scripts`; no manifest or lockfile changes. All final checks above pass.

Changed files: `evals/cases-hard/phase30-check.json`, `tests/unit/wp30e-check-calibration.test.ts`, `docs/wp-30e-replay.ts`, and this report. No contract changes requested. No change to `evals/scoring.ts`. Integration tests were not run: no DB/LLM code changed, and this task forbids live calls. New live model behavior was deliberately not verified. The three retained expiry errors prevent these archived p30 runs from becoming universally green.
