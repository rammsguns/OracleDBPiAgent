WP-25D premise migration (completed before adding backup cases)

The old backup and archive access cases, including the additional partial-backup challenge, now ask about runtime memory sources that p1 cannot read: V$SGASTAT and V$SGA_DYNAMIC_COMPONENTS. Product-session probes returned ORA-00942 for both on 2026-11-06. These views are outside all proposed phase 25–27 grants. IDs remain stable for archive lineage; their historical names no longer describe their questions.

The exposed archive holdout moved to dev. A new runtime component inventory question replaces it in holdout. No agent or LLM was run on it. Only dictionary truth and missing-access prerequisites were validated. Prior definitions are frozen in tests/fixtures/wp25d-previous-premises.json, with SHA-256 assertions for the fixture and revised files. The phase11 historical checksum still passes by restoring the frozen definitions for its historical comparison.

Offline replay: `npx tsx docs/wp-25d-replay.ts ../eval-archive ../needlefish/evals/results` scanned 635 JSON files and 11,857 answer records, including 194 affected records. It found 188 intentional expectation flips and zero flips for other cases. Every flip is listed with the archived answer and a per-record explanation in wp-25d-replay.json. These are changed questions, not retrospective corrections to model performance; prior tool/truth failures remain fixed. Six affected records already failed and remain failures. No global scorer changed.

The scan of every hard-suite field found zero references to the phase 26–27 proposed grant views (wp-25d-grant-scan.json). Thus no additional phase 26–27 access premise needed replacement.

Live `validate-hard`: Validated 114 ground-truth queries for 136 hard cases; row counts recorded. Targeted historical/eval tests: 8 passed. The coordinator must rerun validate-hard after applying grants; this worker applies none.
