# WP-36A cause-first ORA-00942 notes

## Built

Reordered the multi-object ORA-00942 attribution note in `src/tools/index.ts` so
hidden-object causes appear first and readable objects are explicitly labeled
`Not the cause (readable)`. The Phase 35 distinctions remain: existing but not
granted; nonexistent V$/GV$ name; quoted case mismatch; SYS. prefix hint;
non-V$ visibility uncertainty; and fallback wording when synonym lookup fails.
Probe count and lookup behavior are unchanged.

Added three p36 hard-eval cases using d1-verified visibility pairs. Added
production-scorer MUST PASS and MUST FAIL coverage, including the smoke answer
and the structured table that incorrectly marks both views missing. Updated unit
and d1 integration expectations for the new wording.

## Files

- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`
- `tests/unit/hard-evals.test.ts`
- `tests/unit/phase11-challenge.test.ts`
- `tests/unit/phase8-evals.test.ts`
- `evals/types.ts`
- `evals/validate-hard.ts`
- `evals/cases-hard/phase36-errors.json`
- `docs/evals-hard.md`
- `docs/wp-36a-cause-first-notes.md`

## Verification

- d1 read-only probes: `V$RMAN_BACKUP_DATAFILES`, `V$LOGMEMBER` returned
  ORA-00942; `V$BACKUP_DATAFILE`, `V$RMAN_BACKUP_JOB_DETAILS`, and `V$LOG` were
  readable.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 148 files passed, 2,957 tests passed.
- Focused Phase 36/scoring and adjusted legacy unit tests: 4 files, 67 tests
  passed.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest
  run tests/integration/query-error-hints.test.ts --maxWorkers=2`: 1 file, 21
  tests passed.
- No eval suite or LLM calls were run. `evals/validate-hard.ts` was not run;
  its full execution also opens configured Oracle targets.

## Coordinator contract change needed

`evals/run.ts` owns the CLI split union and parser. Add `p36` there to make
`npm run eval -- --split p36` selectable. `src/contracts.ts`, `package.json`,
and `PLAN.md` were not changed.

## Unverified

The scorer unit test loads the actual case file through `loadHardCases()` and
calls the production `score()` implementation. No model behavior or full eval
suite result is claimed. The CLI split is not selectable until the coordinator
updates `evals/run.ts`.
