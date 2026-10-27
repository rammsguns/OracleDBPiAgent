# Oracle 19c compatibility (WP-B)

Verified 2026-10-26 with node-oracledb 26 thin mode, using only HARNESS_LAB
on d1-19c-lab and HARNESS_RO on p1-19c-prod. No LLM calls were made. Passwords
were read through PIAGENT_SECRET_DIR; no credentials are recorded here.

## Sessions and access

Both targets report Oracle 19.9.1.0.0 through PRODUCT_COMPONENT_VERSION.
Both pass the 19c gate, set CURRENT_SCHEMA (SH / SHOPAPP respectively), execute
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
On p1, db_overview, list_schemas and tablespace_usage now succeed using
ORA-00942-only fallbacks. Other errors propagate without retrying. Every fallback
returns a source/limitation note in its text and `details.sourceNote`, within the
existing byte cap. Rows are removed before the disclosure; if the disclosure
cannot fit, the tool throws instead of returning evidence without its limitations.
No shared contract change is needed.

| Tool | p1 fallback source | Limits |
|---|---|---|
| db_overview | PRODUCT_COMPONENT_VERSION, SYS_CONTEXT('USERENV',...), NLS_DATABASE_PARAMETERS | Version, database/instance/host names and character set available. CDB status, startup time, datafile bytes, SGA and PGA bytes explicitly NULL/unavailable. |
| list_schemas | ALL_USERS, correlated ALL_OBJECTS counts | Non-Oracle-maintained users; VISIBLE_OBJECT_COUNT counts only objects visible to HARNESS_RO. Zero does not establish an empty schema. SEGMENT_BYTES is NULL/unavailable. |
| tablespace_usage | DBA_TABLESPACE_USAGE_METRICS joined to DBA_TABLESPACES | TABLESPACE_SIZE and USED_SPACE blocks multiplied by the tablespace's BLOCK_SIZE. CAPACITY_BYTES includes possible autoextension; FREE_CAPACITY_BYTES is capacity minus usage, not allocated-file free space. Allocated bytes, file maximum bytes and autoextend file counts unavailable. Includes permanent, temporary and undo metrics. |
| top_sql | V$SQL aggregated by SQL_ID | Child cursor statistics from the current cache; V$SQLSTATS unavailable. |

wait_events still throws on p1. Its ORA-00942 error explicitly requests SELECT on
SYS.V_$SYSTEM_EVENT (the object behind V$SYSTEM_EVENT); no granted equivalent
exists. The primary tablespace query on d1 still reports permanent data files only.

WP-D verified each of the three new fallback SELECTs against p1 through the 19c
session provider, in read-only transactions, **before implementing them** on
2026-10-26. Observed overview: 19.9.1.0.0, PRODCDB, AL32UTF8; schemas HARNESS_RO and
SHOPAPP had respectively 0 and 12 visible objects. Metrics returned six tablespaces
including TEMP and UNDOTBS1; SHOP_DATA capacity was 4,294,967,296 bytes. Counts and
usage are snapshots, not fixed expectations.

[grants-request-2026-10-26.sql](grants-request-2026-10-26.sql) is a request for a
human DBA, never executed by the agent. It separates p1 diagnostic SELECTs from
d1 HR/OE/CO sample-table SELECTs, and grants no write privileges. The sample table
list follows the 19c inventory; nested storage tables are accessed through parents.
HARNESS_LAB's ALL_TABLES exposed no HR/OE/CO tables during read-only verification,
so a DBA must verify current table inventory before applying the request.
No grants, containers or database data were changed.

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
configured row cap. View source now reads ALL_VIEWS.TEXT with a 1 MiB size
guard and pages the complete definition in Node (see WP-G verification below).
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
truncation, LOB preview, all 12 tool paths, successful p1 fallbacks and the named missing wait grant, cached plan
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

## WP-D verification — 2026-10-26

Setup: `npm ci --ignore-scripts` (134 packages, 0 vulnerabilities), then
`cp .env.example .env` (ignored). No LLM calls or Strata health/configuration changes.

* `npm run typecheck`: passed.
* `npm test`: 121 tests passed across 5 files.
* With `.env` loaded using `set -a; . ./.env; set +a`,
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'`:
  6 passed, 1 excluded (the Strata end-to-end test), 2 files passed.
  The name filter honors the explicit no-LLM instruction. Both approved 19c
  targets and the gate-only non-19c refusal passed. LLM behavior was not verified.
* Unit coverage includes ORA-00942 retry, non-00942 propagation, fallback failure,
  session cleanup, source/limitation disclosure, byte limits and the wait grant error.


## WP-G: full paged view source — 2026-10-27

Verified using SELECTs only on d1-19c-lab as HARNESS_LAB and p1-19c-prod as
HARNESS_RO, both Oracle 19.9.1.0.0. No LLM calls, DBMS_METADATA, PL/SQL,
grants, database data or container changes were used.

With installed node-oracledb 26 thin mode, the existing session query returns
ALL_VIEWS.TEXT (LONG) as a JavaScript string by default, including through its
result set path. No fetchInfo/fetchTypeHandler option, src/oracle modification,
or shared contract change is needed. Initial probing of SYS."_user_stat" on both
accounts returned 47,818 bytes and 1,167 lines, matching TEXT_LENGTH exactly.
Because the tool normalizes names to uppercase, the integration fixture instead
uses SYS.ALL_CUBE_DEPENDENCIES, visible to both accounts: 29,829 bytes, verified
against TEXT_LENGTH on each target. Tests compare returned page 2 against the
full raw source and explicitly check lines 201–202 beyond the 4000-byte preview.

get_source with type VIEW first selects TEXT_LENGTH and refuses values above
1,048,576 bytes. The subsequent SELECT also applies TEXT_LENGTH <= 1,048,576
before fetching LONG, preventing a concurrent enlargement from transferring an
oversized definition. A post-fetch UTF-8 byte check rejects incomplete source or
oversized data (both approved databases use AL32UTF8). TEXT_LENGTH counts bytes in
the database character set, so on a non-AL32UTF8 database (for example
WE8MSWIN1252) a view with non-ASCII text would fail this check as "incomplete".
That is acceptable while the approved targets are both AL32UTF8; revisit it
before adding any other target (round 3 review, finding 5). This bounds each fetched
view, with additional bounded string/line-array and serialization copies in Node;
it is not a streaming LONG implementation. Each page refetches the definition,
so concurrent view changes can alter subsequent pages.

LF, CRLF and CR delimit lines; a trailing terminator yields a final empty line.
Rows are LINE/TEXT pairs with one-based numbering. startLine defaults to 1 and
lines to 200, with the existing configured row cap also applied. Missing views
and requests past EOF return empty rows. details adds startLine, totalLines,
hasMore and nextStartLine (null at EOF); pagination information is also rendered
in text for the model. truncated marks a partial page/result. The byte cap can
reduce rows further and adjusts nextStartLine to the first undelivered line.
If even one line cannot fit, the tool throws instead of returning a continuation
that cannot advance. Stored-code behavior is unchanged.

Files changed: src/tools/index.ts, tests/unit/tools.test.ts,
tests/integration/oracle.test.ts and this note. No dependencies or contract
changes are required.

Verification:

* npm ci --ignore-scripts: 134 packages installed, 0 vulnerabilities.
* npm run typecheck: passed.
* npm test: 141 passed across 6 files.
* With `set -a; . ./.env; set +a`,
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'`:
  8 passed, 1 excluded, 2 files passed. The existing Strata end-to-end test is
  deliberately excluded to honor the no-LLM instruction. LLM behavior was not
  verified. Both real LONG pagination tests passed without skips.
* Oversized/incomplete LONG, EOF/missing views, newline handling, invalid ranges,
  output-byte continuation and session cleanup are covered without DB fixtures.
  No oversized view was created; the refusal path is unit-tested.

## WP-K: function-call policy — 2026-10-27

The classifier now checks every parenthesized identifier after the existing
comment/string cleaning, preserving quoted identifier boundaries for this check.
Only an explicit list of Oracle SQL built-ins and parenthesized SQL grammar is
accepted. CTE column declarations are recognized by their identifier list and
`AS (` suffix. Qualified calls are rejected except unquoted
`DBMS_XPLAN.DISPLAY_CURSOR`; `TABLE(...)` accepts only that cached-plan reader.
Unknown functions are rejected by name, including calls nested in allowed
functions, WHERE, ORDER BY and CTEs. Quoted calls are conservatively rejected,
even when their spelling resembles a built-in. XMLTYPE constructors and XML
member methods are not allowlisted: their overloads/readers have not been
established harmless. Existing write/package/sequence/link/licensing checks remain.

This is a lexical policy, not an Oracle parser or a resolution proof. Functions
callable without parentheses and functions embedded in views remain covered only
by account grants. Object/synonym resolution and built-in name shadowing likewise
require restricted accounts; SET TRANSACTION READ ONLY does not stop an autonomous
transaction inside stored code. No grants or database objects were changed.

Verification: setup used `npm ci --ignore-scripts` (134 packages, zero reported
vulnerabilities) and `cp .env.example .env`. Added over 30 unit cases plus a test
that loads every groundTruth.sql from both eval suites, including nested turns.
No eval/optimize or LLM calls were made.

- `npm run typecheck`: passed.
- `npm test`: 213 tests passed across 9 files.
- With `.env` loaded using `set -a; . ./.env; set +a`,
  `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  9 passed, 1 excluded, 3 files passed. Both 19c targets and the gate-only
  unsupported-version refusal passed. Model evaluations remain coordinator-owned.
- No contract changes are needed.
