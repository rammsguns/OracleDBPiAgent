# WP-16G: empty dictionary query hint

After an empty successful `run_query` SELECT, a conservative lexical scan can
probe the same SQL with allowlisted ALL_ dictionary identifiers changed to DBA_.
The probe goes through the SQL policy and the same read-only session, binds and
default timeout, with `maxRows: 1`. It never replaces the original result rows or
SQL. A positive probe appends one short visibility note directing an explicit
DBA_ retry. Empty probes and ORA-00942/01031 produce no note; other errors throw.
The existing result byte cap includes the note. No tool definition, prompt,
contract, dependency or grant changes are needed.

The scanner preserves ordinary strings, escaped quotes and comments verbatim.
It accepts plain or SYS-qualified FROM/JOIN references and matching qualifiers.
It skips WITH, quoted identifiers, alternative quoting, unknown ALL_ names,
other schemas and ambiguous uses (including comma-separated dictionary tables).
This deliberately favors missing an optional hint over guessing SQL semantics.

Unit tests cover positive/empty probes, nonempty original results, denied and
unexpected probe failures, bounded identical-bind execution, protected text,
ambiguous SQL, and byte-identical serialized tool definitions against master.
The existing chat fixture is unchanged.

Live verification on 2026-11-04: the hidden p1 SHOPAPP.WORKLOAD ALL_SOURCE query
produces the DBA_SOURCE hint, retaining zero rows. The requested p1
HR.ADD_JOB_HISTORY fixture is absent: both DBA_ARGUMENTS and DBA_OBJECTS return
zero rows. Its integration test explicitly skips with that reason until the
fixture exists; the equivalent positive case is covered by the fake session.
No database changes, LLM calls or evals were made.

Validation:
- `npm run typecheck`: pass.
- `npm test`: 848 passed, 50 files.
- Integration command (serial, LLM e2e excluded):
  `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- -t '^(?!.*answers one end-to-end ask)' --no-file-parallelism --maxWorkers=1`.
  Result: 30 passed, 2 skipped, 10 files. Skips: excluded LLM e2e and missing
  p1 HR.ADD_JOB_HISTORY fixture. The initial integration run exposed this absent
  fixture (29 passed, 1 failed, 1 skipped); read-only DBA checks confirmed it,
  and the final run passed with the explicit fixture skip and live source case.
