# WP-23E: purge discovery integration window

Changed only `tests/integration/triage.test.ts` and this note. The natural-language
purge discovery test now probes `V$DIAG_ALERT_EXT` with a bounded, read-only SELECT
for the newest retained ORA-12012 alert naming SHOPAPP.NIGHTLY_PURGE_JOB and
containing ORA-02292. It calculates the alert age using UTC database timestamps,
then requests at least 48 hours, rounding the age up and adding one hour of margin.
The probe does not supply the discovered job or error codes to triage: triage still
receives only “nightly purge job failed last night”. All original assertions remain,
including alert-log discovery, both error codes, WORKLOAD line 27, the leading child
foreign key hypothesis, and rejection of the spurious FAILED name.

A missing prerequisite alert produces an explicit skip. Existing unset-secret and
listener-unavailable skips remain. Other probe/query errors fail the test; missing
permissions are not treated as missing evidence. Sessions close in a finally block.

## Product limitation / coordinator follow-up

`TriageOptions` accepts only `since`, and `sinceHours` enforces a 30-day maximum.
Although the alert-log reader supports absolute `from`/`to`, triage does not expose
them. No source or contract files were changed. This fix follows the requested
probe-and-widen fallback, but cannot provide indefinite coverage for retained alerts:
once the required window exceeds 720 hours it fails with a clear explanation rather
than skipping retained evidence or silently capping the search. Fully durable coverage
requires a coordinator-owned change exposing absolute windows through triage; that
would also avoid the relative-window result cap risk as unrelated alerts accumulate.

## Validation

Dependencies were absent in this worktree. Initial check commands exited 127
(`tsc`/`vitest`: Permission denied); installed the existing lockfile dependencies
with `npm ci --ignore-scripts`, without adding dependencies or changing manifests.

- `npm run typecheck`: PASS, exit 0.
- `npm test -- --maxWorkers=2`: PASS, 91 files, 1,320 tests, exit 0.

The probe matches owner and job tokens separately, accommodating quoted Oracle
owner/job formatting rather than assuming a literal dotted name. A verbose targeted
run confirmed the changed discovery test PASSED against p1 (1 passed, 4 other tests
excluded), rather than taking the prerequisite skip. The first full integration run
exposed the overly strict probe via its skip count; corrected before final validation.

Final full integration command (after correction):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata).*$'
```

PASS, exit 0: 22 files passed; 54 tests passed, 1 skipped (the excluded Strata
end-to-end test), 145.28 seconds. Typecheck and the requested unit command were
rerun after the correction and both passed (91 files / 1,320 unit tests).
No Strata calls were made. Database access used the configured approved accounts
and existing session provider; the added database statement is SELECT only.
`git diff --check` also passed. The prerequisite-absent branch and beyond-30-day
failure were not induced against the live databases; no database contents changed.
