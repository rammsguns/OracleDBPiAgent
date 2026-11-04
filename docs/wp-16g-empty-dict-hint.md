# WP-16G: empty dictionary query hint

After an empty successful `run_query` SELECT, a conservative lexical scan can
probe the same SQL with allowlisted ALL_ dictionary identifiers changed to DBA_.
The probe goes through the SQL policy and the same read-only session, binds and
a timeout of `min(configured statement timeout, 5 seconds)`, with `maxRows: 1`. It never replaces the original result rows or
SQL. A positive probe appends one short visibility note directing an explicit
DBA_ retry. The probe is best-effort: any probe error (including conversion,
division-by-zero, disconnect and timeout errors) produces no note and preserves
the successful primary result. If the tool signal is aborted before or during
the probe, the tool still throws `Tool aborted`, including after a successful
probe.
The existing result byte cap includes the note. No tool definition, prompt,
contract, dependency or grant changes are needed.

The scanner preserves ordinary strings, escaped quotes and comments verbatim.
It accepts leading comments, plain or SYS-qualified FROM/JOIN references and
matching qualifiers.
It skips WITH, quoted identifiers, alternative quoting, unknown ALL_ names,
other schemas and ambiguous uses (including comma-separated dictionary tables).
This deliberately favors missing an optional hint over guessing SQL semantics.

Unit tests cover positive/empty probes, nonempty original results, denied and
unexpected probe failures, timeout caps, aborts before/during probes, bounded
identical-bind execution, protected text,
ambiguous SQL, and byte-identical serialized tool definitions against the
committed `tests/unit/fixtures/chat-master.json` tool snapshot. Neither dictionary
test invokes Git or needs a branch ref; chat-triage also checks this fixture.
The existing chat fixture is unchanged.

Live verification on 2026-11-04: the hidden p1 SHOPAPP.WORKLOAD ALL_SOURCE query
produces the DBA_SOURCE hint, retaining zero rows. The HR.ADD_JOB_HISTORY eval
case belongs to d1-19c-lab: its integration test asserts five DBA_ARGUMENTS rows,
then verifies the empty ALL_ARGUMENTS query produces the hint without returning
DBA rows. The earlier p1 fixture skip has been removed.
The result renderer uses named header, row and footer arrays with unchanged
ordering and formatting.
No database changes, LLM calls or evals were made.

Validation:
- `npm run typecheck`: pass.
- `npm test`: 856 passed, 50 files.
- Integration command (serial, LLM e2e excluded):
  `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- -t '^(?!.*answers one end-to-end ask)' --no-file-parallelism --maxWorkers=1`.
  Result: 31 passed, 1 skipped (excluded LLM e2e), 10 files.

CI portability follow-up: merged phase-16 master, then replaced both dictionary
snapshot tests' Git-based baselines with the committed fixture. Typecheck and
all 967 unit tests (64 files) pass in the worktree and all 967 unit tests pass
in a fresh clone containing only the local `wp-16g-empty-dict-hint` branch, with
shared installed dependencies. The temporary clone was removed afterward.
A search of test sources found no other Git or branch dependencies.
