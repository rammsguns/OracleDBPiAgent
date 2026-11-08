# Alert log and ADR incidents (WP-18A)

`piagent alertlog` reads the two configured Oracle 19c targets through the existing
read-only session provider. It uses SQL only, makes no LLM calls, and never opens
server trace files. Grant suggestions are displayed for an administrator; the
reader never executes them.

```sh
export PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets
npm run piagent -- alertlog --target d1-19c-lab --since 24h
npm run piagent -- alertlog --target p1-19c-prod --since 7d --code ORA-02292 --code ORA-12012 --json
npm run piagent -- alertlog --target p1-19c-prod --since 30d --grep NIGHTLY_PURGE --markdown
npm run piagent -- alertlog --target d1-19c-lab --since 30d --incidents
```

Options:

- `--since`: existing triage duration syntax (`30m`, `24h`, `7d`), default `24h`,
  maximum `30d`.
- `--from` and `--to`: explicit ISO timestamps with timezone, both required,
  mutually exclusive with `--since`. The interval is inclusive at the start,
  exclusive at the end, and at most 30 days.
- Repeated `--code`: ORA-/TNS- codes with five digits, ORed together (maximum 20).
  Matching accepts abbreviated log spellings, e.g. `ORA-00609` matches `ORA-609`,
  and excludes longer numeric codes. Returned codes use five digits.
- `--grep`: case-insensitive literal substring, maximum 2,048 characters. SQL
  wildcard characters have no special meaning. Code and text filters combine
  with AND.
- `--level`: `default` includes `MESSAGE_LEVEL <= 8` or text containing ORA-, TNS-, `Errors in file`,
  `incident=` or `deadlock` (case-insensitive); `all`
  removes this filter; an integer from 1 to 32 selects a maximum message level.
- `--limit`: positive integer, default 50, capped by `limits.maxRows`.
- `--incidents`: incident list joined to its problem key. Accepts window and
  limit options; message-only filters are rejected.
- `--json` or `--markdown`: mutually exclusive. Markdown is also the default.

Invalid option values raise the exported `AlertlogUsageError`. The alertlog
action prints the specific validation message to stderr and exits with code 2.
Database/runtime errors retain the existing failure handling. For example,
`--since 31d` prints `--since must be a positive duration (m/h/d), at most 30d`.

## Reusable API

Import `readAlertLog(ctx, target, options)`, `readIncidents(ctx, target, options)`
and `renderAlertLogMarkdown(result)` from `src/alertlog/index.ts`. Types are
exported there; no shared contract changes are required. Both readers return
`status`, `target`, `view`, `window`, `limit`, `rows`, `truncated`, the exact
`sql`/`binds`, `grants`, and `attempts`.

Alert rows expose `timestamp` (newest occurrence), `firstTime`, `lastTime`,
`count`, numeric `level`, `codes`, `problemKey`, `incidentId` (from `incident=N`),
`traceFile`, `messageText`, and `textTruncated`. Credential redaction uses the
existing triage redactor before text is capped to 2,048 UTF-8 bytes. Trailing
newlines are removed; internal newlines remain. Trace names are extracted from
redacted text.

Messages matching after masking non-error digit sequences, `0x` hex IDs and bare hex IDs
(at least eight hex characters including a letter) fold throughout the fetched
result, even when other messages intervene. ORA-/TNS-/PLS- code digits (including
abbreviated forms such as ORA-609) are preserved. The complete sorted parsed
code set and exact level are also part of the identity: different codes or
levels never fold together. The complete text determines the
group before preview clipping. Each group retains its newest example text and
singular `incidentId`, `traceFile`, and `problemKey` fields. Additive `incidentIds`,
`traceFiles`, and `problemKeys` arrays preserve unions across the group, as does
`codes`. Each union is capped at 20 distinct values; `metadataTruncated` signals
omissions. Each group retains its original level.
`firstTime` and `lastTime` bound the group; counts cover only the bounded fetched
result, not the entire window. Markdown shows a single timestamp for count 1,
and both bounds for repeated messages. It displays the union metadata and marks
any capped text or metadata.

Incident rows expose `incidentId`, `problemKey`, `createTime`, and numeric
`status` (Oracle's value). The join uses `PROBLEM_ID` and `CON_ID`, columns
verified on both 19c targets; these views do not expose `ADR_HOME`.

Every query binds the timestamp bounds, filters and `FETCH FIRST` limit, and
uses configured statement timeout and row limits. A sentinel row detects more
results when the configured cap permits it. At the hard `maxRows` boundary, a
full result is conservatively marked truncated even if there might be no further
rows. The requested limit applies before folding. Sessions close on success and
failure. Audit records contain SQL hashes and error codes, never binds, message
text or credentials.

ORA-00942/ORA-01031 produce `status: 'unavailable'`, empty rows, attempts with
the Oracle code, and exact `GRANT SELECT ON SYS.V_$... TO <account>;` suggestions.
A failed incident join lists both required grants because Oracle does not name
the inaccessible side. Other query failures throw. Unknown targets and pinned
target mismatches fail before opening a session.

## Verification

Unit tests use stub sessions and need no DB or LLM. The integration tests read
alerts and joined incidents from both approved targets and exercise code/text
filters; they clearly skip when credentials are unset or the database is down.
Missing grants are tested with stubs, without changing live grants.

Commands used for the Antigravity fixes:

```sh
npm run typecheck
npm test
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/alertlog.test.ts
```

Results: typecheck clean; 1,069 unit tests passed (71 files); both alertlog
integration tests passed on d1 and p1. No LLM calls were made.

The alertlog integration tests cover both approved targets, without an LLM.
Unit tests include real CLI subprocess checks for specific validation messages
and exit code 2; these fail validation before connecting to any database.

## Live CLI output (credential-redacted)

Captured from both approved targets after the Antigravity fixes. Each target
shows the default filter/window, the default filter over 30 days, and ADR
incidents over 30 days. UTC bounds are emitted by the host clock. Trace paths
are SQL evidence; no server files were opened. Text passes through credential
redaction. Limits below bound the documentation examples.

```sh
piagent alertlog --target d1-19c-lab --limit 10 --markdown
```

```text
# Alert log: d1-19c-lab

ok; V$DIAG_ALERT_EXT; 2026-11-04T04:21:57.948Z to 2026-11-05T04:21:57.948Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-04T05:32:36.104Z | 16 | ORA-00609 | 1 |  |  |  | opiodr aborting process unknown ospid (3859) as a result of ORA-609 |
| 2026-11-04T05:32:36.102Z | 16 | TNS-00507 | 1 |  |  |  | TNS-00507: Connection closed |
| 2026-11-04T05:32:36.101Z | 16 | TNS-12537 | 1 |  |  |  | TNS-12537: TNS:connection closed |
| 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 1 | ORA 800 | 245813 | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |
| 2026-11-04T04:29:44.158Z | 16 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | 1 |  |  | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290188 543339984  40% / |
```

```sh
piagent alertlog --target d1-19c-lab --since 30d --limit 10 --markdown
```

```text
# Alert log: d1-19c-lab

ok; V$DIAG_ALERT_EXT; 2026-10-06T04:22:00.498Z to 2026-11-05T04:22:00.498Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-04T05:32:36.104Z | 16 | ORA-00609 | 1 |  |  |  | opiodr aborting process unknown ospid (3859) as a result of ORA-609 |
| 2026-11-04T05:32:36.102Z | 16 | TNS-00507 | 1 |  |  |  | TNS-00507: Connection closed |
| 2026-11-04T05:32:36.101Z | 16 | TNS-12537 | 1 |  |  |  | TNS-12537: TNS:connection closed |
| 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 1 | ORA 800 | 245813 | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |
| 2026-11-04T04:29:44.158Z | 16 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | 1 |  |  | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290188 543339984  40% / |
| 2026-10-25T02:41:50.777Z / 2026-10-25T02:45:50.676Z | 16 | ORA-00000 | 2 |  |  |  |   Result = ORA-0 |
| 2026-10-25T02:45:48.847Z / 2026-10-25T02:45:50.413Z | 16 | ORA-00031 | 3 |  |  |  |   Result = ORA-31 |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target d1-19c-lab --since 30d --incidents --limit 3 --markdown
```

```text
# ADR incidents: d1-19c-lab

ok; V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM; 2026-10-06T04:22:03.048Z to 2026-11-05T04:22:03.048Z (exclusive)

| Created | Incident | Problem | Status |
|---|---|---|---|
| 2026-11-04T04:29:49.671Z | 245813 | ORA 800 | 2 |
| 2026-10-22T23:21:11.147Z | 225332 | ORA 800 | 2 |
| 2026-10-21T03:38:14.898Z | 204851 | ORA 800 | 2 |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target p1-19c-prod --limit 10 --markdown
```

```text
# Alert log: p1-19c-prod

ok; V$DIAG_ALERT_EXT; 2026-11-04T04:22:05.044Z to 2026-11-05T04:22:05.044Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-04T05:32:36.106Z / 2026-11-04T19:12:02.693Z | 16 | ORA-00609 | 2 |  |  |  | opiodr aborting process unknown ospid (26005) as a result of ORA-609 |
| 2026-11-04T05:32:36.105Z / 2026-11-04T19:12:02.692Z | 16 | TNS-00507 | 2 |  |  |  | TNS-00507: Connection closed |
| 2026-11-04T05:32:36.104Z / 2026-11-04T19:12:02.692Z | 16 | TNS-12537 | 2 |  |  |  | TNS-12537: TNS:connection closed |
| 2026-11-04T04:30:56.298Z | 16 | ORA-12012, ORA-02292, ORA-06512 | 1 |  |  | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1 |
| 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 1 | ORA 800 | 86767 | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc  (incident=86767):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |
| 2026-11-04T04:29:44.395Z | 16 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | 1 |  |  | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290200 543339972  40% / |
```

```sh
piagent alertlog --target p1-19c-prod --since 30d --limit 10 --markdown
```

```text
# Alert log: p1-19c-prod

ok; V$DIAG_ALERT_EXT; 2026-10-06T04:22:07.174Z to 2026-11-05T04:22:07.174Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-10-24T23:49:06.803Z / 2026-11-04T19:12:02.693Z | 16 | ORA-00609 | 3 |  |  |  | opiodr aborting process unknown ospid (26005) as a result of ORA-609 |
| 2026-11-04T05:32:36.105Z / 2026-11-04T19:12:02.692Z | 16 | TNS-00507 | 2 |  |  |  | TNS-00507: Connection closed |
| 2026-11-04T05:32:36.104Z / 2026-11-04T19:12:02.692Z | 16 | TNS-12537 | 2 |  |  |  | TNS-12537: TNS:connection closed |
| 2026-11-04T04:30:56.298Z | 16 | ORA-12012, ORA-02292, ORA-06512 | 1 |  |  | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1 |
| 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 1 | ORA 800 | 86767 | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc  (incident=86767):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |
| 2026-11-04T04:29:44.395Z | 16 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | 1 |  |  | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290200 543339972  40% / |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target p1-19c-prod --since 30d --incidents --limit 3 --markdown
```

```text
# ADR incidents: p1-19c-prod

ok; V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM; 2026-10-06T04:22:09.161Z to 2026-11-05T04:22:09.161Z (exclusive)

| Created | Incident | Problem | Status |
|---|---|---|---|
| 2026-11-04T04:29:49.671Z | 86767 | ORA 800 | 2 |
| 2026-10-24T23:47:42.029Z | 84366 | ORA 800 | 2 |
| 2026-10-24T23:41:19.281Z | 81965 | ORA 800 | 2 |
Row cap reached; partial result (folding covers only fetched rows).
```

## Live PDB verification (2026-11-08)

In a PDB, alert and incident queries include CON_ID 0/1 (CDB-wide/instance) alongside the current CON_ID, within the explicit timestamp window. Other PDBs are excluded. Rows carry containerId and scope labels in JSON and Markdown; the web view also displays scope. Identical messages from different containers are not folded together. Oracle can hide instance rows from a PDB login even with SELECT grants: only visible/retained rows are counted, and empty results do not establish instance-wide absence. C1 currently exposes only CON_ID 3 to the PDB login, while SYS in CDB$ROOT sees CON_ID 1 as well. Health checks filter ORA text before bounding the fetch; a truncated below-threshold sample remains UNKNOWN. See [WP-31A](wp-31a-pdb-live.md).
