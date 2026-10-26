# Oracle 19c compatibility (WP-B)

Verified 2026-10-26 with node-oracledb 26 thin mode, using only HARNESS_LAB
on d1-19c-lab and HARNESS_RO on p1-19c-prod. No LLM calls were made. Passwords
were read through PIAGENT_SECRET_DIR; no credentials are recorded here.

## Sessions and access

Both targets report Oracle 19.9.1.0.0 through PRODUCT_COMPONENT_VERSION.
Both pass the 19c gate, set CURRENT_SCHEMA (HR / SHOPAPP respectively), execute
SET TRANSACTION READ ONLY, return bounded rows, and roll back. Identity uses
SYS_CONTEXT rather than V$INSTANCE because the latter is inaccessible on p1.
The provider opens independently owned thin connections (no global pool), closes
failed initializations, and offers closeAll. Every tool closes its session.
Timeouts are converted from seconds to node-oracledb callTimeout milliseconds.
LOB locators are read in bounded pieces and destroyed before the result set closes.

Read-only checks used SESSION_PRIVS, SESSION_ROLES, ROLE_TAB_PRIVS,
ALL_TAB_PRIVS and USER_TABLES. Both SESSION_PRIVS results contain only CREATE
SESSION: no ANY system privilege. Neither account owns tables. No INSERT,
UPDATE, DELETE, ALTER, INDEX or REFERENCES grants to the login or enabled roles
were visible in ALL_TAB_PRIVS. This is grant inspection, not an attempted write.
PUBLIC package execution and privileged autonomous user functions are not proven
safe by these checks; SQL classification is deliberately conservative but is not
a full Oracle parser or a proof about arbitrary stored functions.

| Access | HARNESS_LAB | HARNESS_RO |
|---|---|---|
| Enabled roles | HARNESS_DIAGNOSTICS_ROLE, SELECT_CATALOG_ROLE, HS_ADMIN_SELECT_ROLE | HARNESS_DIAGNOSTICS_ROLE |
| Diagnostics role SELECT grants | DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_TABLESPACES, DBA_TABLESPACE_USAGE_METRICS, V_$SESSION, V_$SQL, V_$SQL_PLAN | Same, plus V_$LOCK |
| V$INSTANCE, V$DATABASE, V$SQLSTATS | Yes | ORA-00942 |
| V$SYSTEM_EVENT, V$SGA, V$PGASTAT | Yes | ORA-00942 |
| DBA_USERS, DBA_OBJECTS, DBA_SEGMENTS | Yes | ORA-00942 |
| DBA_DATA_FILES, DBA_FREE_SPACE | Yes | ORA-00942 |
| V$SESSION, V$LOCK, V$SQL, V$SQL_PLAN | Yes | Yes |
| V$SQL_PLAN_STATISTICS_ALL | Yes | ORA-00942 |
| ALL_* object/source metadata | Yes | Yes, limited to objects visible to login |

The effective catalog role on lab is broader than PLAN.md's role description.
On p1, db_overview, list_schemas, top_sql, wait_events and tablespace_usage
currently throw ORA-00942. Integration tests assert this observed access boundary;
the tests passing does **not** mean all MVP diagnostics are usable on p1.
An administrator/coordinator must arrange the missing SELECT access if full MVP
coverage is required. WP-B did not change grants or use elevated credentials.
Tablespace reporting currently covers permanent data files, not temporary files.

## Explain plans: strict no-write interpretation

AGENTS.md forbids any DML/DDL/PLSQL changes, including during verification.
Consequently EXPLAIN PLAN was neither executed nor implemented: it writes
PLAN_TABLE even when followed by rollback. No visible PLAN_TABLE object grants
were found; that alone does not prove whether an EXPLAIN PLAN attempt would work.

The tool accepts an existing sql_id or classified read-only SQL already in V$SQL.
It never executes the supplied statement to populate the cache. Matching by SQL
text is exact and limited to 1000 characters; longer SQL requires sql_id. If both
are supplied, both must match the cached entry.

* Lab: DBMS_XPLAN.DISPLAY_CURSOR works and returns the formatted cached plan.
* p1: DISPLAY_CURSOR also returns a formatted TYPICAL cached plan, despite direct
  SELECT on V$SQL_PLAN_STATISTICS_ALL being unavailable. The verified query was
  SELECT 1 FROM dual, resolved to a cached sql_id through V$SQL. Do not infer that
  missing direct statistics-view access prevents this formatted plan operation.
* If DISPLAY_CURSOR returns diagnostic text, the tool falls back to V$SQL_PLAN,
  returning child/id/parent rows, operations, objects, estimates, costs and
  predicates. Direct read access to this view was verified on both targets; the
  fallback branch is unit-tested. No actual execution statistics are promised.
* Missing/aged-out cursors throw; they are never presented as a successful plan.

The plan's write-based EXPLAIN PLAN requirement needs a coordinator scope decision.
No shared TypeScript contract changes are needed for the current implementation.

## Tool/result behavior and limitations

All 12 MVP tools are exported from src/tools/index.ts as typed PI AgentTools.
Results contain a compact table and details. The serialized content plus details
are capped together, removing rows and marking truncation as needed. Audit events
record SQL SHA-256 hashes, result counts and truncation, never binds or raw SQL.
Errors are thrown and audited by error name, avoiding database message leakage to
the audit file. SQL text from V$SQLSTATS is intentionally returned as tool evidence,
not written into the audit log.

PL/SQL source is paged through ALL_SOURCE with at most 200 returned lines and the
configured row cap. View source uses ALL_VIEWS.TEXT_VC (at most 4000 characters),
then pages that preview by line; long view definitions are marked truncated and
cannot be fully retrieved through this MVP tool. This avoids unbounded LONG fetches.
The classifier rejects all DBMS_/UTL_ packages except DISPLAY_CURSOR, sequence
NEXTVAL, database links, ASH/AWR views, procedural/write tokens and multiple
statements. It may reject harmless quoted identifiers that resemble forbidden
keywords. Caller-provided binds are supported by the session API; run_query's MVP
schema currently accepts SQL and a row cap only.

## Verification

Run DB-only tests with:

```
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration
```

They cover both target gates and schemas, pre-execution INSERT rejection, row
truncation, LOB preview, all 12 tool paths, observed missing p1 grants, cached plan
retrieval, and a gate-only connection to localhost:1521/FREEPDB1 as HARNESS_LAB.
The exception database is never registered as a product target. Unit tests require
neither database nor LLM. Integration tests skip clearly if the secret environment
is absent or a listener is unavailable; authentication/grant regressions fail.

Final WP-B check results (2026-10-26):

* npm run typecheck: exit 0.
* npm test: 3 files passed, 83 tests passed (72 SQL classifier cases).
* npm run test:integration with PIAGENT_SECRET_DIR: 1 file passed, 3 tests passed,
  no skips. This includes assertions of the five expected p1 grant failures.
* npm ci --ignore-scripts: 134 packages installed, audit found 0 vulnerabilities.
