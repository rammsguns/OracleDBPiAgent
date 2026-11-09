# WP-34C truth-templated facts

## Built

- Added opt-in `groundTruth.factTemplates` matching. Each template substitutes regex-escaped values from each live truth row and must match the answer. `rowCells` behavior remains unchanged when the field is absent; template matching replaces only that case's row check, while truth sampling and freshness checks remain in the runner.
- Added pre-connection validation for allowlisted case IDs, row indexes, compilable regexes, and no lookahead/lookbehind.
- Enabled templates only for `hard-p30-d1-fullest-permanent` and `hard-p19-object-statistics`.
- Added scorer tests for the required gate answers, adversarial denials, incomplete object reporting, and validator rejection.
- Added `evals/replay-truth-template-archive.ts` to compare the Phase 33 scorer (`8b6ef1c`) with this scorer over archived records. It reports each fail→pass with archive-relative file and case ID.

## Files changed

- `evals/scoring.ts`, `evals/types.ts`, `evals/validate-hard.ts`
- `evals/cases-hard/phase19-sqlperf.json`, `evals/cases-hard/phase30-check.json`
- `tests/unit/wp-34c-truth-templates.test.ts`
- `evals/replay-truth-template-archive.ts`

## Archive replay

Replay scope: all JSON result archives in phases 25–33 with recorded ground-truth checks (4,583 records). Compared the Phase 33 baseline scorer to the new scorer:

- Across the full archive folders, there are historical scorer variants and candidate snapshots. Against the exact Phase 33 scorer, some candidate outputs in phases 30–33 that had been accepted by intermediate relaxed scorers fail the stricter name-near-“fullest” template. These are confined to the p30 allowlisted case; no other case changes.
- On final Phase 33 records specifically: **724** records replayed, pass→fail **4** and fail→pass **6**. All ten changes are on the two allowlisted IDs: 4 p30 pass→fail, 4 p30 fail→pass, and 2 p19 fail→pass. The four p30 pass→fail outputs do not put the selected tablespace name near “fullest”.
- Full phases 25–33 archive replay: **4,583** records; pass→fail **17**, all on p30; fail→pass **31** (21 p19 and 10 p30); unrelated flips **0**.

Fail→pass list (file relative to its phase directory):

| Case | Archive file |
|---|---|
| `hard-p19-object-statistics` | `phase25-27/a-candidate/2026-11-07T03-03-09-679Z-8b031230-4b73-4364-906a-72f3df713969.json` |
| `hard-p19-object-statistics` | `phase25-27/b-guidance/2026-11-07T07-26-30-046Z-f8d0a5bd-c152-4537-8c22-4960e2f3fdba.json` |
| `hard-p19-object-statistics` | `phase25-27/c-pack-check/2026-11-07T16-31-14-838Z-22842c72-8691-43c2-a5ab-07b837927d9b.json` |
| `hard-p19-object-statistics` | `phase25-27/c-pack-check/2026-11-07T16-54-01-170Z-04f693a2-b7a3-493d-93c4-785930bdfb94.json` |
| `hard-p19-object-statistics` | `phase29/a-b4e3906/2026-11-07T20-33-14-541Z-a4877edf-90b2-481f-95af-4e9652be2779.json` |
| `hard-p19-object-statistics` | `phase29/a-b4e3906/2026-11-07T20-56-31-201Z-c21586b0-ed0f-48ea-bd60-bdc2c8df1bd9.json` |
| `hard-p19-object-statistics` | `phase29/b-dff6859/2026-11-07T22-07-17-051Z-2c7648ed-2e4e-4dca-af05-3f94bd869202.json` |
| `hard-p19-object-statistics` | `phase29/b-dff6859/2026-11-07T22-30-36-493Z-85334525-26c1-4c36-b484-80ca390bbcf8.json` |
| `hard-p19-object-statistics` | `phase30/a-66ed749/2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json` |
| `hard-p19-object-statistics` | `phase30/b-48bf50e/2026-11-08T03-32-22-294Z-38d6ed6a-ac05-4909-8ebb-fc12f8bdfa0d.json` |
| `hard-p19-object-statistics` | `phase30/b-48bf50e/2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json` |
| `hard-p19-object-statistics` | `phase31/a-gate/2026-11-08T08-55-08-513Z-a1e9d45c-e0f7-4ace-8c9e-e1cfae586d59.json` |
| `hard-p19-object-statistics` | `phase31/a-gate/2026-11-08T09-20-06-528Z-6156938f-f1bf-4651-99f2-3c226deea031.json` |
| `hard-p30-d1-fullest-permanent` | `phase31/a-rerun/2026-11-08T12-37-42-905Z-3ec62d98-2118-45cf-876d-725ee79cf3f0.json` |
| `hard-p19-object-statistics` | `phase31/b-gate/2026-11-08T10-47-24-865Z-ff66bf29-bd5e-40ef-9610-d86520f8fae9.json` |
| `hard-p19-object-statistics` | `phase31/b-gate/2026-11-08T11-11-51-284Z-2f7bdeb2-5609-4a28-b5ca-4c632c313267.json` |
| `hard-p19-object-statistics` | `phase32/gateA/2026-11-08T17-37-21-295Z-da5cdb0d-9834-4b24-b45b-6a7bb500b1db.json` |
| `hard-p30-d1-fullest-permanent` | `phase32/gateA/2026-11-08T17-37-21-295Z-da5cdb0d-9834-4b24-b45b-6a7bb500b1db.json` |
| `hard-p19-object-statistics` | `phase32/gateA/2026-11-08T18-04-40-481Z-d41cedf2-6278-425f-81fe-ae66d2ec6d33.json` |
| `hard-p30-d1-fullest-permanent` | `phase32/gateA/2026-11-08T18-04-40-481Z-d41cedf2-6278-425f-81fe-ae66d2ec6d33.json` |
| `hard-p30-d1-fullest-permanent` | `phase32/gateA/2026-11-08T18-43-25-300Z-f929befd-8cf6-409d-99bb-af53e9d76def.json` |
| `hard-p19-object-statistics` | `phase32/gateB/2026-11-08T19-26-50-740Z-94493711-d592-47ce-82e1-9cfe325da975.json` |
| `hard-p19-object-statistics` | `phase32/gateB/2026-11-08T19-50-00-765Z-9fe46ba8-b723-406a-bcd2-405bf1c0cb95.json` |
| `hard-p30-d1-fullest-permanent` | `phase32/gateB/2026-11-08T20-22-28-653Z-3ae0df73-0846-4b12-989c-455f6df8ed34.json` |
| `hard-p30-d1-fullest-permanent` | `phase32/gateB/2026-11-08T20-24-21-798Z-898644f8-a9c1-41b3-887c-ce01dd3652a2.json` |
| `hard-p30-d1-fullest-permanent` | `phase33/gateA/2026-11-09T00-59-16-424Z-36e74f26-6e57-4bf8-aad7-6c6b72968fed.json` |
| `hard-p30-d1-fullest-permanent` | `phase33/gateA/2026-11-09T01-23-12-128Z-1911cb9c-b29f-4919-9943-1f7ba9244264.json` |
| `hard-p19-object-statistics` | `phase33/gateB/2026-11-09T02-45-26-756Z-52aab2bc-07fc-4514-9f0f-39fad1b6264a.json` |
| `hard-p30-d1-fullest-permanent` | `phase33/gateB/2026-11-09T02-45-26-756Z-52aab2bc-07fc-4514-9f0f-39fad1b6264a.json` |
| `hard-p19-object-statistics` | `phase33/gateB/2026-11-09T03-10-31-616Z-5d61a729-6b52-4668-94f7-3277bfc25629.json` |
| `hard-p30-d1-fullest-permanent` | `phase33/gateB/2026-11-09T03-10-31-616Z-5d61a729-6b52-4668-94f7-3277bfc25629.json` |

Residual risk: indirect contradictions embedded in complex free text may still pass; the scorer rejects direct claims that a different name “is fullest” or “is the fullest” without identifying it as a permanent tablespace, while preserving the required positive wording.

## Contract changes

- The shared `EvalCase.groundTruth` type needs `factTemplates?: string[]`. Implemented locally in `evals/types.ts`; `src/contracts.ts` has no required change.

## Verification

- `npm run typecheck`: passed.
- Focused tests: `npx vitest run tests/unit/wp-34c-truth-templates.test.ts tests/unit/hard-evals.test.ts --maxWorkers=2` — 10 passed.
- Full `npm test -- --maxWorkers=2`: two existing failures (`wp30c-check-evals.test.ts` expects old rowCells behavior for p30, and `wp2527j-calibration.test.ts` pins scorer checksum); full run did not finish normally.
- Filtered integration run with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` and `--testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: did not finish within 30 seconds and was stopped. No LLM call was made. No DB code changed.
- No live DB truth validation was run; scorer tests use the specified truth rows.
- Final full-suite rerun (`npm test -- --maxWorkers=2`) again emitted no results for 40 seconds and was stopped; the earlier run had exposed the two tests subsequently fixed above. The changed-area suite passed after those fixes.
- Final filtered integration rerun with the specified secret directory and Strata exclusion also emitted no results for 30 seconds and was stopped; integration status is unverified.
