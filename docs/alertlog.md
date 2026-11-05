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
- `--level`: `default` includes `MESSAGE_LEVEL <= 16` plus ORA- lines; `all`
  removes this filter; an integer from 1 to 32 selects a maximum message level.
- `--limit`: positive integer, default 50, capped by `limits.maxRows`.
- `--incidents`: incident list joined to its problem key. Accepts window and
  limit options; message-only filters are rejected.
- `--json` or `--markdown`: mutually exclusive. Markdown is also the default.

## Reusable API

Import `readAlertLog(ctx, target, options)`, `readIncidents(ctx, target, options)`
and `renderAlertLogMarkdown(result)` from `src/alertlog/index.ts`. Types are
exported there; no shared contract changes are required. Both readers return
`status`, `target`, `view`, `window`, `limit`, `rows`, `truncated`, the exact
`sql`/`binds`, `grants`, and `attempts`.

Alert rows expose `timestamp` (newest occurrence), `firstTime`, `lastTime`,
`count`, numeric `level`, `codes`, `problemKey`, `incidentId` (from `incident=N`),
`traceFile`, `messageText`, and `textTruncated`. Credential redaction uses the
existing triage redactor before text is capped to 2,048 UTF-8 bytes. Trace names
are extracted from redacted text. Consecutive identical complete messages in
the filtered, newest-first result fold into one row; different complete messages
remain distinct even when redaction or clipping makes their previews identical.
Folding also preserves level and problem-key boundaries. Counts cover only the
bounded fetched result, not the entire window.

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

Commands used:

```sh
npm run typecheck
npm test
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- -t '^(?!.*answers one end-to-end ask)'
```

Results: typecheck clean; unit 1,048 passed (69 files); integration 37 passed,
1 skipped (13 files). The two alert-log integration cases also passed separately
after strengthening the filter check to require a match for a code actually
observed in the same explicit window on each target.

The integration name filter skips the pre-existing Strata end-to-end test to
honor the task's no-LLM instruction. All database integration tests still run,
including the existing 19c refusal gate's explicitly permitted non-19c connection.

## Live CLI output (credential-redacted)

The following is captured from the actual CLI on both approved targets. UTC
window bounds are exactly as emitted by the host clock. Trace paths are database
evidence, not files read by the client. Output passes through credential
redaction; no passwords or API keys are included.

```sh
piagent alertlog --target d1-19c-lab --since 30d --grep ORA- --limit 3 --markdown
```

```text
# Alert log: d1-19c-lab

ok; V$DIAG_ALERT_EXT; 2026-10-06T04:04:52.791Z to 2026-11-05T04:04:52.791Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-04T05:32:36.104Z / 2026-11-04T05:32:36.104Z | 16 | ORA-00609 | 1 |  |  |  | opiodr aborting process unknown ospid (3859) as a result of ORA-609<br> |
| 2026-11-04T04:29:49.671Z / 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 1 | ORA 800 | 245813 | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], []<br> |
| 2026-11-04T04:29:44.158Z / 2026-11-04T04:29:44.158Z | 16 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | 1 |  |  | /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_ora_20.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290188 543339984  40% /<br> |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target d1-19c-lab --since 30d --incidents --limit 3 --markdown
```

```text
# Alert log: d1-19c-lab

ok; V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM; 2026-10-06T04:04:55.919Z to 2026-11-05T04:04:55.919Z (exclusive)

| Created | Incident | Problem | Status |
|---|---|---|---|
| 2026-11-04T04:29:49.671Z | 245813 | ORA 800 | 2 |
| 2026-10-22T23:21:11.147Z | 225332 | ORA 800 | 2 |
| 2026-10-21T03:38:14.898Z | 204851 | ORA 800 | 2 |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target p1-19c-prod --since 30d --grep ORA- --limit 3 --markdown
```

```text
# Alert log: p1-19c-prod

ok; V$DIAG_ALERT_EXT; 2026-10-06T04:04:57.503Z to 2026-11-05T04:04:57.503Z (exclusive)

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-04T19:12:02.693Z / 2026-11-04T19:12:02.693Z | 16 | ORA-00609 | 1 |  |  |  | opiodr aborting process unknown ospid (26005) as a result of ORA-609<br> |
| 2026-11-04T05:32:36.106Z / 2026-11-04T05:32:36.106Z | 16 | ORA-00609 | 1 |  |  |  | opiodr aborting process unknown ospid (3056) as a result of ORA-609<br> |
| 2026-11-04T04:30:56.298Z / 2026-11-04T04:30:56.298Z | 16 | ORA-12012, ORA-02292, ORA-06512 | 1 |  |  | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1<br> |
Row cap reached; partial result (folding covers only fetched rows).
```

```sh
piagent alertlog --target p1-19c-prod --since 30d --incidents --limit 3 --markdown
```

```text
# Alert log: p1-19c-prod

ok; V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM; 2026-10-06T04:04:59.966Z to 2026-11-05T04:04:59.966Z (exclusive)

| Created | Incident | Problem | Status |
|---|---|---|---|
| 2026-11-04T04:29:49.671Z | 86767 | ORA 800 | 2 |
| 2026-10-24T23:47:42.029Z | 84366 | ORA 800 | 2 |
| 2026-10-24T23:41:19.281Z | 81965 | ORA 800 | 2 |
Row cap reached; partial result (folding covers only fetched rows).
```
