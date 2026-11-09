# WP-36C: transposed rowCells labels

## Built

`rowMatches` now recognizes two-column `Attribute | Value` tables for one- or
two-field truth rows. It normalizes case, Markdown, underscores, spaces and
punctuation in row labels. Each truth column must bind to a distinct row whose
label equals the normalized truth label or contains all its words (so
`NEXT_RUN` matches `Next Run Time`). The value still passes through the existing
cell matcher, including positive `Yes (`TRUE`)` annotations and negation checks.

The real `hard-p26-p1-next-run-semantics` definition is exercised with the exact
Phase 35 gate B answer from `2026-11-09T17-53-00-249Z-3ea1d9e4-ec82-499d-97b2-bba4dd239409.json`.
Wrong `NOT RECORDED`, `PRESENT` under `Owner`, and `Not TRUE` all fail.

## Files changed

- `evals/scoring.ts`
- `tests/unit/row-cells.test.ts`
- `docs/wp-36c-transposed-labels.md`

## Archive replay

Ran `npx tsx evals/replay-truth-template-archive.ts phase25-27 phase28 phase29 phase30 phase31 phase32 phase33 phase34 phase35` over all result JSON files in those archive roots. It read 6,023 eligible records: **0 pass-to-fail, 29 fail-to-pass**. Every fail-to-pass answer was opened and reviewed. The p19 answers identify the qualifying SHOPAPP cursor and correctly distinguish stale/present statistics; the p30 answers identify SYSAUX as fullest and LOW. Each flip has its original archive file and case ID below.

| Case ID | Archive file (relative to its phase root) |
|---|---|
| `hard-p19-object-statistics` | `a-candidate/2026-11-07T03-03-09-679Z-8b031230-4b73-4364-906a-72f3df713969.json` |
| `hard-p19-object-statistics` | `b-guidance/2026-11-07T07-26-30-046Z-f8d0a5bd-c152-4537-8c22-4960e2f3fdba.json` |
| `hard-p19-object-statistics` | `c-pack-check/2026-11-07T16-31-14-838Z-22842c72-8691-43c2-a5ab-07b837927d9b.json` |
| `hard-p19-object-statistics` | `c-pack-check/2026-11-07T16-54-01-170Z-04f693a2-b7a3-493d-93c4-785930bdfb94.json` |
| `hard-p19-object-statistics` | `a-b4e3906/2026-11-07T20-33-14-541Z-a4877edf-90b2-481f-95af-4e9652be2779.json` |
| `hard-p19-object-statistics` | `a-b4e3906/2026-11-07T20-56-31-201Z-c21586b0-ed0f-48ea-bd60-bdc2c8df1bd9.json` |
| `hard-p19-object-statistics` | `b-dff6859/2026-11-07T22-07-17-051Z-2c7648ed-2e4e-4dca-af05-3f94bd869202.json` |
| `hard-p19-object-statistics` | `b-dff6859/2026-11-07T22-30-36-493Z-85334525-26c1-4c36-b484-80ca390bbcf8.json` |
| `hard-p19-object-statistics` | `a-66ed749/2026-11-08T02-07-21-403Z-dbd63254-efe3-4c58-9d74-302a1e72efa9.json` |
| `hard-p19-object-statistics` | `b-48bf50e/2026-11-08T03-56-17-753Z-b4423fd6-cb63-497b-a675-ef0bf43ef908.json` |
| `hard-p19-object-statistics` | `a-gate/2026-11-08T08-55-08-513Z-a1e9d45c-e0f7-4ace-8c9e-e1cfae586d59.json` |
| `hard-p19-object-statistics` | `a-gate/2026-11-08T09-20-06-528Z-6156938f-f1bf-4651-99f2-3c226deea031.json` |
| `hard-p30-d1-fullest-permanent` | `a-rerun/2026-11-08T12-37-42-905Z-3ec62d98-2118-45cf-876d-725ee79cf3f0.json` |
| `hard-p19-object-statistics` | `b-gate/2026-11-08T10-47-24-865Z-ff66bf29-bd5e-40ef-9610-d86520f8fae9.json` |
| `hard-p19-object-statistics` | `b-gate/2026-11-08T11-11-51-284Z-2f7bdeb2-5609-4a28-b5ca-4c632c313267.json` |
| `hard-p19-object-statistics` | `gateA/2026-11-08T17-37-21-295Z-da5cdb0d-9834-4b24-b45b-6a7bb500b1db.json` |
| `hard-p30-d1-fullest-permanent` | `gateA/2026-11-08T17-37-21-295Z-da5cdb0d-9834-4b24-b45b-6a7bb500b1db.json` |
| `hard-p30-d1-fullest-permanent` | `gateA/2026-11-08T18-04-40-481Z-d41cedf2-6278-425f-81fe-ae66d2ec6d33.json` |
| `hard-p30-d1-fullest-permanent` | `gateA/2026-11-08T18-43-25-300Z-f929befd-8cf6-409d-99bb-af53e9d76def.json` |
| `hard-p19-object-statistics` | `gateB/2026-11-08T19-26-50-740Z-94493711-d592-47ce-82e1-9cfe325da975.json` |
| `hard-p19-object-statistics` | `gateB/2026-11-08T19-50-00-765Z-9fe46ba8-b723-406a-bcd2-405bf1c0cb95.json` |
| `hard-p30-d1-fullest-permanent` | `gateB/2026-11-08T20-22-28-653Z-3ae0df73-0846-4b12-989c-455f6df8ed34.json` |
| `hard-p30-d1-fullest-permanent` | `gateB/2026-11-08T20-24-21-798Z-898644f8-a9c1-41b3-887c-ce01dd3652a2.json` |
| `hard-p30-d1-fullest-permanent` | `gateA/2026-11-09T00-59-16-424Z-36e74f26-6e57-4bf8-aad7-6c6b72968fed.json` |
| `hard-p30-d1-fullest-permanent` | `gateA/2026-11-09T01-23-12-128Z-1911cb9c-b29f-4919-9943-1f7ba9244264.json` |
| `hard-p19-object-statistics` | `gateB/2026-11-09T02-45-26-756Z-52aab2bc-07fc-4514-9f0f-39fad1b6264a.json` |
| `hard-p30-d1-fullest-permanent` | `gateB/2026-11-09T02-45-26-756Z-52aab2bc-07fc-4514-9f0f-39fad1b6264a.json` |
| `hard-p19-object-statistics` | `gateB/2026-11-09T03-10-31-616Z-5d61a729-6b52-4668-94f7-3277bfc25629.json` |
| `hard-p30-d1-fullest-permanent` | `gateB/2026-11-09T03-10-31-616Z-5d61a729-6b52-4668-94f7-3277bfc25629.json` |

## Validation

- Master comparison for the existing archived-answer test: pass on `/home/kiwi/orca/projects/OracleDBPiAgent` (master, read-only).
- Focused `tests/unit/row-cells.test.ts`: **16 passed**.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **148 files passed, 2,957 tests passed**.
- Eval suite and Strata e2e were not run; no LLM calls were made.

## Contracts and unverified items

No changes to `src/contracts.ts`, `package.json`, or `PLAN.md` are needed. No DB or LLM code changed, so integration tests were not run. Archive replay is local scoring only and uses no LLM calls.
