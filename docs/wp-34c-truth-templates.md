# WP-34C truth-templated facts

## Built

- Added opt-in `groundTruth.factTemplates` matching. Each template substitutes regex-escaped values from each live truth row and must match the answer. `rowCells` behavior is unchanged when the field is absent; templates replace the rowCells line check only for opted-in cases, while truth sampling and freshness remain unchanged.
- Added pre-connection validation for allowlisted IDs, row indexes, regex compilation, and the prohibition on lookahead/lookbehind.
- Enabled templates only for `hard-p30-d1-fullest-permanent` and `hard-p19-object-statistics`.
- The p30 templates accept explicitly identified winners (including “fullest”, highest/largest/top phrasing, labeled winner headings, a first result following a “fullest … is:” heading, and “tops the list”) and require the live classification. A p30-specific contradiction check rejects an explicit different fullest winner and an inability-to-determine denial. Ordinary rowCells behavior remains unchanged for every other case.
- Added tests through the real scorer for the required gate answers, winner/classification variants, wrong winners and classifications, denials, incomplete p19 objects, and validator rejection.
- Added `evals/replay-truth-template-archive.ts` to compare the Phase 33 scorer (`8b6ef1c`) with this scorer across archived results.

## Files changed

- `evals/scoring.ts`, `evals/types.ts`, `evals/validate-hard.ts`
- `evals/cases-hard/phase19-sqlperf.json`, `evals/cases-hard/phase30-check.json`
- `tests/unit/wp-34c-truth-templates.test.ts`
- `evals/replay-truth-template-archive.ts`

## Archive replay

All JSON results in archive phases 25–33 containing ground-truth checks were replayed: **4,583 records; pass→fail 0; fail→pass 31**. All flips are limited to the two allowlisted IDs: 21 p19 and 10 p30. No archived record passed before and failed under the new scorer.

Fail→pass files (relative to their phase directory):

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

Residual risk: broad indirect contradictions embedded in nuanced prose (for example, a conditional alternative metric where SYSTEM is fuller under allocated bytes) may not be fully distinguished. Direct assertions that another tablespace “is the fullest” and “could not determine” denials are rejected. The default rowCells scorer remains unchanged.

## Contract changes

- `EvalCase.groundTruth` in shared `src/contracts.ts` would need `factTemplates?: string[]` if the coordinator wants to expose this eval-only field through the shared contract. That file is coordinator-owned and was not changed. The local eval adapter in `evals/types.ts` supports it.

## Verification

- `npm run typecheck`: passed (`tsc -p tsconfig.json --noEmit`).
- `npm test -- --maxWorkers=2`: passed, 148 files / 2,950 tests.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/hard-evals.test.ts --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)' --maxWorkers=2`: passed, 1 file / 1 test. The Strata end-to-end test was excluded as required.
- Final archive replay: 4,583 records, pass→fail 0, fail→pass 31 (21 p19, 10 p30).

No live DB query was executed during replay; archive replay and scorer tests use stored truth rows. No LLM call was made.
