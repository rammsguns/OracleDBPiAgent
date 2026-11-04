# WP-16E: dictionary fallback in chat tools

`list_objects`, `describe_object` and PL/SQL `get_source` retry an empty ALL_
query against its DBA_ equivalent. Predicates, binds and query caps are identical.
ORA-00942 and ORA-01031 on the retry retain the original empty result; other
failures propagate. Nonempty ALL_ results never trigger a retry. `describe_object`
replaces all six metadata views together when its tagged query returns no rows.

View source uses the same fallback on its size probe, then fetches LONG text from
the selected view with the existing 1 MiB guard, completeness checks and paging.
The 200-line source limit, configured row limit and serialized output byte limit
remain enforced. A short `view` field and one text line identify the dictionary
source (for describe, the first view of the matching ALL_/DBA_ family). The audit
hash identifies the selected query. No shared contract changes or grants needed.

The unit test compares serialized tool definitions against `master` using its
original TypeBox definitions. Names, labels, descriptions and parameter schemas
are identical; there is no additional per-session tool definition cost.

## Live verification (2026-11-04)

Only configured HARNESS_LAB and HARNESS_RO connections, through the existing
19c gate and read-only session layer:

- d1 can read DBA_SOURCE, ERRORS, DEPENDENCIES, PROCEDURES, ARGUMENTS, OBJECTS,
  TAB_COLUMNS, CONSTRAINTS, CONS_COLUMNS, INDEXES, IND_COLUMNS, TABLES and VIEWS.
- p1 can read DBA_SOURCE, ERRORS, DEPENDENCIES, PROCEDURES, ARGUMENTS and OBJECTS.
  DBA_TAB_COLUMNS, CONSTRAINTS, CONS_COLUMNS, INDEXES, IND_COLUMNS, TABLES and VIEWS
  return ORA-00942. Fallback therefore retains empty ALL_ metadata on p1 when
  those additional views would be needed.
- The tool returns p1 SHOPAPP.WORKLOAD PACKAGE BODY lines 24–29 inclusive, with
  DELETE at line 27; ALL_SOURCE returns no rows for that object/type.
- The tool returns d1 HR.SECURE_EMPLOYEES TRIGGER text, including SECURE_DML;
  ALL_SOURCE returns no rows for that object/type.
- `list_objects` also discovers both hidden objects through DBA_OBJECTS.

Validation:

- `npm run typecheck`: pass.
- `npm test`: 834 passed, 49 files.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- -t '^(?!.*answers one end-to-end ask)' --no-file-parallelism --maxWorkers=1`:
  29 passed, 1 skipped (the LLM e2e), 10 files.
- The first integration run with the LLM excluded ran files concurrently and
  failed existing drift stability and p1 report-trends assertions with unavailable
  query results. Serial execution passed without changes to those tests or code.

Execution incident: a verbose rerun supplied a filename after npm's existing
integration-directory argument, which selected the entire directory, including
the LLM e2e. It was interrupted on discovering this. Whether that test had sent a
Strata request before interruption could not be verified. The owner was informed;
subsequent runs used the explicit exclusion. No eval command was run. Model gates
remain for the coordinator.
