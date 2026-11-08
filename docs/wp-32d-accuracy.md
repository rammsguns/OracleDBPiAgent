# WP-32D answer accuracy

Implemented on `wp-32d-accuracy`, based on master. No LLM calls, eval runs,
Strata changes, database writes, dependencies or shared contracts.

`src/tools/dictionaryDomains.ts` defines 17 Oracle 19c view/column domains.
`run_query` adds a deterministic source note only after an empty result and only
for a recognized invalid equality or all-invalid literal IN list. No SQL is
rewritten or re-executed for this hint. It takes precedence over the existing
ALL-to-DBA empty-result probe; existing unrelated notes/error hints remain.
The original rows, columns, SQL hash and result bounding are retained.

Matching accepts a single dictionary source, optionally SYS-qualified and/or
aliased, with case-insensitive unquoted identifiers and exact string literals.
It skips joins (including comma joins), nested SELECTs, CTEs, set operators,
quoted identifiers, national/alternative quoting, negation, CASE, COLLATE,
functions in predicates, binds and expressions. Mixed valid/invalid IN lists
are skipped. A valid value absent from the current database is never treated as
invalid. Joins and richer SQL are intentionally outside this optional hint's
coverage. Unqualified dictionary names follow the existing tools' dictionary
name convention; explicitly non-SYS-qualified sources are skipped.

Domain review uses the Oracle 19c reference, with observed lab values below as
an independent check, not an exhaustive enumeration:

- [DBA_USERS](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/DBA_USERS.html): includes documented password rollover states and the truncated `EXPIRED & LOCKED(TIMED) & IN ROL` value.
- [ALL_OBJECTS / DBA_OBJECTS](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_OBJECTS.html): STATUS includes N/A in addition to VALID/INVALID.
- [ALL_INDEXES / DBA_INDEXES](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_INDEXES.html) and [ALL_IND_PARTITIONS](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_IND_PARTITIONS.html): whole-index and partition status domains differ; lab whole-index N/A is retained.
- [V$DATABASE](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-DATABASE.html): LOG_MODE includes MANUAL as well as ARCHIVELOG/NOARCHIVELOG.
- [ALL_TAB_STATISTICS](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_TAB_STATISTICS.html) and [scheduler run details](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_SCHEDULER_JOB_RUN_DETAILS.html) describe the remaining statistics/run-detail columns; NULL observations remain valid SQL nulls, not literals.

`src/agent/index.ts` adds one line directing refusals to begin explicitly,
followed by supported alternatives. With `loadConfig({})`, the three packaged
targets, no pin and no appendix, `systemPrompt` measures **2447 → 2551 UTF-8
bytes/characters (+104)**. At the project's context-pruning convention of
3 bytes/token, that is **816 → 851 estimated tokens (+35)**. These are local
estimates, not model-tokenizer measurements; no tokenization or inference request
was sent to Strata.

Changed files: `src/tools/dictionaryDomains.ts`, `src/tools/index.ts`,
`src/agent/index.ts`, `tests/unit/dictionary-domains.test.ts`,
`tests/unit/wp32d-refusal-guidance.test.ts`, the historical prompt checks in
`tests/unit/chat-triage.test.ts` and `tests/unit/short-prefix.test.ts`,
`tests/unit/fixtures/refusal-guidance.ts`, and this note. Historical prompt
snapshots/budgets subtract only the independently asserted 104-byte addition.
No contract changes requested. Model A/B accuracy and refusal behavior remain
for the coordinator's gate.

## Live read-only evidence (2026-11-08)

Used `createSessionProvider(loadConfig())`, the configured read-only target
accounts, and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.
For every row below executed exactly `SELECT DISTINCT <column> FROM <view>`
with `maxRows: 100`. All 51 SELECTs succeeded; none was truncated. Distinct
observations are sorted for presentation. No fixtures were changed to force
missing values; subpartition views had no rows on all targets. Therefore live
evidence confirms the observed subsets, not every possible enum member.

### d1-19c-lab

| Column | SELECT DISTINCT observations |
|---|---|
| DBA_USERS.ORACLE_MAINTAINED | N, Y |
| DBA_USERS.COMMON | NO, YES |
| DBA_USERS.INHERITED | NO, YES |
| DBA_USERS.ACCOUNT_STATUS | EXPIRED & LOCKED, LOCKED, OPEN |
| DBA_OBJECTS.ORACLE_MAINTAINED | N, Y |
| DBA_OBJECTS.STATUS | INVALID, VALID |
| DBA_DATA_FILES.AUTOEXTENSIBLE | YES |
| DBA_TEMP_FILES.AUTOEXTENSIBLE | YES |
| DBA_TAB_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_IND_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_SCHEDULER_JOBS.ENABLED | FALSE, TRUE |
| DBA_SCHEDULER_JOB_RUN_DETAILS.STATUS | FAILED, SUCCEEDED |
| DBA_INDEXES.STATUS | N/A, VALID |
| DBA_IND_PARTITIONS.STATUS | USABLE |
| DBA_IND_SUBPARTITIONS.STATUS | (no rows) |
| V$DATABASE.LOG_MODE | NOARCHIVELOG |
| DBA_TABLESPACES.CONTENTS | PERMANENT, TEMPORARY, UNDO |

### p1-19c-prod

| Column | SELECT DISTINCT observations |
|---|---|
| DBA_USERS.ORACLE_MAINTAINED | N, Y |
| DBA_USERS.COMMON | NO, YES |
| DBA_USERS.INHERITED | NO, YES |
| DBA_USERS.ACCOUNT_STATUS | EXPIRED & LOCKED, LOCKED, OPEN |
| DBA_OBJECTS.ORACLE_MAINTAINED | N, Y |
| DBA_OBJECTS.STATUS | VALID |
| DBA_DATA_FILES.AUTOEXTENSIBLE | YES |
| DBA_TEMP_FILES.AUTOEXTENSIBLE | YES |
| DBA_TAB_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_IND_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_SCHEDULER_JOBS.ENABLED | FALSE, TRUE |
| DBA_SCHEDULER_JOB_RUN_DETAILS.STATUS | FAILED, SUCCEEDED |
| DBA_INDEXES.STATUS | N/A, VALID |
| DBA_IND_PARTITIONS.STATUS | USABLE |
| DBA_IND_SUBPARTITIONS.STATUS | (no rows) |
| V$DATABASE.LOG_MODE | NOARCHIVELOG |
| DBA_TABLESPACES.CONTENTS | PERMANENT, TEMPORARY, UNDO |

### c1-19c-pdb

| Column | SELECT DISTINCT observations |
|---|---|
| DBA_USERS.ORACLE_MAINTAINED | N, Y |
| DBA_USERS.COMMON | NO, YES |
| DBA_USERS.INHERITED | NO, YES |
| DBA_USERS.ACCOUNT_STATUS | EXPIRED & LOCKED, LOCKED, OPEN |
| DBA_OBJECTS.ORACLE_MAINTAINED | N, Y |
| DBA_OBJECTS.STATUS | INVALID, VALID |
| DBA_DATA_FILES.AUTOEXTENSIBLE | NO, YES |
| DBA_TEMP_FILES.AUTOEXTENSIBLE | YES |
| DBA_TAB_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_IND_STATISTICS.STALE_STATS | NO, NULL, YES |
| DBA_SCHEDULER_JOBS.ENABLED | FALSE, TRUE |
| DBA_SCHEDULER_JOB_RUN_DETAILS.STATUS | FAILED, SUCCEEDED |
| DBA_INDEXES.STATUS | N/A, VALID |
| DBA_IND_PARTITIONS.STATUS | UNUSABLE, USABLE |
| DBA_IND_SUBPARTITIONS.STATUS | (no rows) |
| V$DATABASE.LOG_MODE | ARCHIVELOG |
| DBA_TABLESPACES.CONTENTS | PERMANENT, TEMPORARY, UNDO |


The real `run_query` tool was also called once per target with:

```sql
SELECT username FROM SYS.DBA_USERS u WHERE u.ORACLE_MAINTAINED='NO'
```

All three returned zero rows, `truncated: false`, and the same note:
`Hint: DBA_USERS.ORACLE_MAINTAINED values are 'Y' or 'N'; the filter 'NO' matches nothing.`

## Validation

Validation reuses the coordinator checkout's installed packages through an ignored,
temporary `node_modules` symlink; no package installation was needed. The initial
unit run exposed historical prompt snapshot/budget assertions requiring the
explicit new allowance, and an incomplete new tool mock; these were corrected.
Focused verification: 4 files, 73 tests passed, covering all domains, false-positive
guards, run_query/nonempty behavior, refusal guidance and historical prompt checks.

The unchanged `tests/integration/c1-pdb-live.test.ts:22` fails its assertion that
**every C1 datafile has a level-0 backup** (`backup.files.every(f => f.level0)`
returns false). A focused rerun reproduces it in 451 ms. This occurs in the
deterministic `readBackup` path before any agent query or web interaction; no
backup/seed changes are in WP-32D's scope. The C1 lab needs backup-fixture review
by the coordinator. This report does not claim a clean integration gate.

Final checks on the committed implementation:

```text
npm run typecheck
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files 144 passed (144)
Tests 2865 passed (2865)
Duration 103.28s
```

An independent read-only `readBackup` call on C1 identified the missing record:
`{ "file": 14, "level0": null, "incremental": null, "checkpointScn": null }`.

```text
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
  npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
Test Files 1 failed | 40 passed (41)
Tests 1 failed | 95 passed | 1 skipped (97)
Duration 557.91s
Exit 1: only the C1 level-0-backup assertion described above failed.
The excluded Strata end-to-end test is the single skipped test.
```

Commits: `895a27f` (domain hints), `9180078` (refusal wording and prompt checks),
plus the documentation commit containing this report. Nothing pushed or merged.
The temporary dependency symlink was removed after validation. Remaining work:
coordinator review of C1 backup metadata and the authorized model A/B gate.
No contract changes are needed; no model-quality improvement is claimed without
that gate.

## Antigravity review follow-up

Addressed both minor findings from the approved review:

- National/alternative quoting is detected using the original token positions:
  N, Q and NQ decline the hint only when immediately followed by an opening
  quote. Ordinary table/select-list aliases named n, q or nq now work, including
  uppercase spellings. Actual national and alternative quoted strings still
  fail closed, including strings with embedded apostrophes and fake predicates.
- Simple reversed equality (`'NO' = oracle_maintained` or
  `'NO' = alias.oracle_maintained`) now shares the forward form's column
  resolution, exact-literal domain validation and predicate-boundary checks.
  Expressions, wrong aliases, binds, negation and other operators still decline.

Changed files for this follow-up: `src/tools/dictionaryDomains.ts`,
`tests/unit/dictionary-domains.test.ts`, and this report. Every reviewed domain
value is tested in both equality directions. Added alias, nonempty-result,
reversed-expression and quoting regression coverage. No domain, prompt, tool
contract, database/LLM I/O, or dependency changes. No LLM calls. The prior live
verification and integration outcomes above remain historical evidence; this
pure parser follow-up requires no new database fixtures or model gate calls.

Follow-up validation:

```text
npm run typecheck
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files 144 passed (144)
Tests 2899 passed (2899)
Duration 103.25s
PASS (exit 0)
```

No new integration run was made for these pure SQL-token matching changes;
no query execution, session handling or LLM code changed. Model A/B verification
remains with the coordinator. No contract changes are needed.
