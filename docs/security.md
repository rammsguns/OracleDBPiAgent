# Security and privilege review

Implemented on `wp-20a-security`, 2026-11-05. No LLM calls, privilege changes,
credential/hash reads, database writes, or additional dependencies.

## Use

```sh
export PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets
piagent security --target d1-19c-lab
piagent security --target p1-19c-prod --who-can SHOPAPP.ORDERS
piagent security --target d1-19c-lab --check profiles,parameters --json
```

Markdown is the default; `--markdown` is explicit. `--json` and `--markdown`
are mutually exclusive. Invalid input exits 2 before connecting. Check IDs:
`default-passwords`, `powerful-privileges`, `public-grants`, `profiles`,
`accounts`, `audit`, `parameters`, `who-can`. With no filter, all checks run;
who-can is skipped unless an object is supplied. Supplying `--who-can` always
includes that check, including with a check filter.

## Reports, drift and web

`piagent report --target d1-19c-lab --sections security` selects the optional
security section; the fourteen default checks do not include it. Saved security
reports contribute severity counts to history trends.
`piagent drift --left d1-19c-lab --right p1-19c-prod --scope security --json`
compares privilege counts and principal/grant sets; it is not a complete grant diff.
Drift uses exit 3 for observed differences, 1 for incomplete results without
observed differences or failure, and 0 for complete equality.

The web **Security** tab groups findings by severity, filters them, shows check
availability and draws who-can paths as a graph with a list fallback. It exports
Markdown and uses no LLM. Select the target before reading the report.
`ok` describes evidence availability, not a security certification. The CLI can
exit 0 with unavailable checks: inspect the JSON `status` and per-check notes.

See the [grant-request index](grants.md) for prerequisites. `UNIFIED_AUDIT_TRAIL`
and `SYS.USER$` are deliberately not granted or queried. Policy configuration
and default-password account names suffice; neither audit records nor password
hashes are needed.

## API and evidence

`src/security/index.ts` exports `readSecurityPosture(session, { checks?, whoCan? })`,
`renderSecurityMarkdown`, `SecurityUsageError`, and the local TypeScript types.
The requested `SecurityPosture` and `SecurityCheck` shapes are implemented.
`SecurityCheck` additionally retains `evidence: Check[]` and `notes: string[]`,
so empty results, missing views, caps and qualification notes survive JSON export.
No shared contract changes are required.

`PrivilegePath` has `subject`, `privilege`, `path: string[]`, `object`,
`source` (`owner`, `direct`, `role`, `PUBLIC`, `ANY`) and `evidence`.
Each path starts at its subject, lists intermediate roles and ends at the
qualified object, ready for a graph consumer. Custom roles may also be subjects;
Oracle-maintained users/roles are excluded as subjects, except the requested owner.
Oracle-maintained roles still appear as intermediate evidence in custom users' paths.
The default-password check deliberately includes open Oracle-maintained accounts.

An `ok` status means evidence was read, not that the target is secure.
Missing privileges/views degrade only affected checks to `unavailable`, with
view names. Unexpected SQL/connection errors propagate. Metadata reads use the
configured session row cap, with ordered OFFSET continuation and a total cap of
10,000 rows per query. Evidence SQL is the original ordered SELECT; rows combine
its pages. The CLI audits the hash of every executed SELECT (including pages),
row count and truncation, never bind values. A cap produces a partial-evidence
note and an unavailable report/check, rather than a clean bill of health.
Metadata reads are live samples, not one atomic snapshot across sections/pages.

Role expansion guards cycles and follows at most ten role edges, with a further
10,000-path bound per subject. A cutoff is explicitly incomplete. Reachability
includes non-default roles and roles that may require activation. PUBLIC paths
apply to everyone. Object-type-specific ANY mappings cover tables, views,
materialized views, sequences, procedures/functions/packages, types, indexes and
triggers. SYS dictionary ANY access is deliberately not inferred because its
special restrictions differ. Column grants, proxy authentication, enabled-session
state and password-file administrator bypass paths are outside object-grant
reachability; administrative accounts are reviewed in the powerful-privileges check.
No synonym-target resolution is attempted.

Profile DEFAULT inheritance is resolved before testing limits. Missing LAST_LOGIN
is described as “not recorded”; it does not prove a password has never been used.
Account lifecycle findings are informational. Audit configuration shows policy
scope, success/failure settings, conditional status and configured privilege options;
it does not claim audit records exist or that every privilege use is covered.
Traditional statement audit configuration is included; audit trails are never read.
Advice is prose only; no remediation statements are generated or executed.

## Live verification, 2026-11-05

Used only configured HARNESS_LAB on d1 and HARNESS_RO on p1. The new integration
file executes every one of the 15 SQL registry SELECTs on **both** targets,
then reads the complete posture and object paths. Both tests passed with no skips.
The product session provider enforced the Oracle 19c gate and read-only query policy.
All seven ordinary checks returned `ok`; who-can returned `ok` when requested.
All evidence was fetched without reaching the total cap. System grants and audit
policy definitions required pagination beyond the normal 200-row session limit.

Four CLI smokes ran successfully (exit 0), with full Markdown output reviewed:

```sh
piagent security --target d1-19c-lab
piagent security --target p1-19c-prod
piagent security --target d1-19c-lab --who-can HR.EMPLOYEES
piagent security --target p1-19c-prod --who-can SHOPAPP.ORDERS
```

A fifth smoke, `--target p1-19c-prod --check profiles,parameters --json`, parsed
as JSON with status `ok` and exactly those two checks.

### DBA assessment

- **d1:** five open sample accounts (HR, IX, OE, PM, SH) are listed with default
  passwords. This is the first issue to address, even on a lab. HARNESS_APP has
  ALTER ANY PROCEDURE and ANALYZE ANY through HARNESS_MAINTENANCE_ROLE; IX has
  SELECT ANY DICTIONARY and queue privileges through AQ_ADMINISTRATOR_ROLE.
  These deserve owner review. The diagnostics account is not reported with ANY privileges.
- **p1:** no open default-password accounts or non-Oracle powerful-privilege
  findings were observed. This does not establish complete security. HARNESS_RO
  has a direct SELECT grant on SHOPAPP.ORDERS, and SHOPAPP is its owner.
- **Both:** PUBLIC can execute nine reviewed SYS packages, including UTL_FILE,
  UTL_HTTP, UTL_TCP, UTL_SMTP and DBMS_SQL. These are exposure-review findings,
  not proof that arbitrary file/network access is possible: directory grants,
  ACLs and package-internal checks still matter. Package bodies do not duplicate findings.
- Open custom users have DEFAULT's missing password verify function (10 on d1,
  2 on p1). No unlimited login-attempt/password-lifetime limit was observed.
  Evaluate password complexity and application authentication requirements with a DBA.
- Both have ORA_LOGON_FAILURES enabled for failures only, and ORA_SECURECONFIG
  enabled for successes/failures (49 configured options, 30 system privilege options).
  Successful logon auditing is not established. `audit_trail=NONE` describes
  traditional auditing; it does not invalidate the observed unified policies.
  No traditional statement audit options were observed. Collection/retention were
  not verified because audit trail contents are intentionally out of scope.
- Both expose `remote_login_passwordfile=EXCLUSIVE` and
  `sec_case_sensitive_logon=TRUE`; O7_DICTIONARY_ACCESSIBILITY is absent and
  explicitly N/A. The account lifecycle check reports p1 SHOPAPP's unrecorded
  last login conservatively; d1 has no lifecycle findings.
- HR.EMPLOYEES paths are HR ownership, HARNESS_LAB SELECT, and OE SELECT/REFERENCES.
  SHOPAPP.ORDERS paths are SHOPAPP ownership and HARNESS_RO SELECT. Neither object
  showed a non-Oracle role, PUBLIC or matching ANY path in the live sample;
  those branches are covered by unit fixtures without altering grants.

### Full d1 smoke

<details>
<summary>piagent security --target d1-19c-lab</summary>

```text
# Security Posture: d1-19c-lab

Status: ok. Read-only findings; no database changes.

## High Severity

### Open Accounts with Default Passwords (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| HR | OPEN; default credential listed by DBA_USERS_WITH_DEFPWD | DBA_USERS_WITH_DEFPWD, DBA_USERS |
| IX | OPEN; default credential listed by DBA_USERS_WITH_DEFPWD | DBA_USERS_WITH_DEFPWD, DBA_USERS |
| OE | OPEN; default credential listed by DBA_USERS_WITH_DEFPWD | DBA_USERS_WITH_DEFPWD, DBA_USERS |
| PM | OPEN; default credential listed by DBA_USERS_WITH_DEFPWD | DBA_USERS_WITH_DEFPWD, DBA_USERS |
| SH | OPEN; default credential listed by DBA_USERS_WITH_DEFPWD | DBA_USERS_WITH_DEFPWD, DBA_USERS |

Have a DBA rotate default credentials and review whether these accounts need to remain open.

### Powerful Privileges (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| HARNESS_APP | ALTER ANY PROCEDURE via HARNESS_APP → HARNESS_MAINTENANCE_ROLE | DBA_SYS_PRIVS |
| HARNESS_APP | ANALYZE ANY via HARNESS_APP → HARNESS_MAINTENANCE_ROLE | DBA_SYS_PRIVS |
| IX | SELECT ANY DICTIONARY via IX | DBA_SYS_PRIVS |
| IX | DEQUEUE ANY QUEUE via IX → AQ_ADMINISTRATOR_ROLE | DBA_SYS_PRIVS |
| IX | ENQUEUE ANY QUEUE via IX → AQ_ADMINISTRATOR_ROLE | DBA_SYS_PRIVS |
| IX | MANAGE ANY QUEUE via IX → AQ_ADMINISTRATOR_ROLE | DBA_SYS_PRIVS |
| HARNESS_MAINTENANCE_ROLE | ALTER ANY PROCEDURE via HARNESS_MAINTENANCE_ROLE | DBA_SYS_PRIVS |
| HARNESS_MAINTENANCE_ROLE | ANALYZE ANY via HARNESS_MAINTENANCE_ROLE | DBA_SYS_PRIVS |

Review privilege paths with the account owner and retain only privileges required for their duties.

## Medium Severity

### PUBLIC Grants (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| SYS.DBMS_JAVA | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_LDAP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SCHEDULER | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SQL | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_FILE | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_HTTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_INADDR | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_SMTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_TCP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |

Review PUBLIC access to network, file and dynamic SQL packages and application data; prefer narrowly scoped access where practical.

### Password Profiles for Open Users (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| BI | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| CO | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| HARNESS_APP | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| HARNESS_LAB | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| HARNESS_RESTRICTED | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| HR | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| IX | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| OE | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| PM | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| SH | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |

Review effective profile limits, password verification and application authentication requirements with a DBA.

## Low Severity

### Security Parameters (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| audit_trail | NONE | V$PARAMETER |
| remote_login_passwordfile | EXCLUSIVE | V$PARAMETER |
| sec_case_sensitive_logon | TRUE | V$PARAMETER |

Review password-file administration, case-sensitive authentication and audit mode with a DBA against the site security policy.

## Info Severity

### Audit Configuration (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| ORA_LOGON_FAILURES | Enabled BY USER ALL USERS (USER); success=NO, failure=YES; 1 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| ORA_SECURECONFIG | Enabled BY USER ALL USERS (USER); success=YES, failure=YES; 49 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| Logon coverage | ORA_LOGON_FAILURES: success=NO, failure=YES, scope=BY USER ALL USERS; policy scope and conditions require review. | AUDIT_UNIFIED_POLICIES |
| Privilege-use coverage | 30 distinct system privilege options in enabled policies: ADMINISTER KEY MANAGEMENT, ALTER ANY PROCEDURE, ALTER ANY SQL TRANSLATION PROFILE, ALTER ANY TABLE, … (complete list in JSON evidence). This does not establish coverage of all privilege use. | AUDIT_UNIFIED_POLICIES |

Have a DBA validate logon and privilege-use coverage for every relevant principal, including success and failure, policy conditions and the active audit mode. Policy configuration does not prove events are being collected.

## Check Status

- Open Accounts with Default Passwords [default-passwords]: ok.
- Powerful Privileges [powerful-privileges]: ok.
  Role reachability includes grants regardless of default/enabled role state; roles may require activation. Expansion stops at ten role edges.
- PUBLIC Grants [public-grants]: ok.
- Password Profiles for Open Users [profiles]: ok.
- Account Lifecycle [accounts]: ok; no findings in available evidence.
- Audit Configuration [audit]: ok.
  No traditional statement audit options observed in available evidence.
- Security Parameters [parameters]: ok.
  O7_DICTIONARY_ACCESSIBILITY: N/A (not exposed on this Oracle 19c target).
- Who Can Access an Object [who-can]: skipped.
  Supply --who-can OWNER.OBJECT.
```

</details>

### Full p1 smoke

<details>
<summary>piagent security --target p1-19c-prod</summary>

```text
# Security Posture: p1-19c-prod

Status: ok. Read-only findings; no database changes.

## Medium Severity

### PUBLIC Grants (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| SYS.DBMS_JAVA | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_LDAP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SCHEDULER | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SQL | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_FILE | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_HTTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_INADDR | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_SMTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_TCP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |

Review PUBLIC access to network, file and dynamic SQL packages and application data; prefer narrowly scoped access where practical.

### Password Profiles for Open Users (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| HARNESS_RO | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |
| SHOPAPP | Profile DEFAULT: PASSWORD_VERIFY_FUNCTION=NULL | DBA_PROFILES |

Review effective profile limits, password verification and application authentication requirements with a DBA.

## Low Severity

### Security Parameters (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| audit_trail | NONE | V$PARAMETER |
| remote_login_passwordfile | EXCLUSIVE | V$PARAMETER |
| sec_case_sensitive_logon | TRUE | V$PARAMETER |

Review password-file administration, case-sensitive authentication and audit mode with a DBA against the site security policy.

## Info Severity

### Account Lifecycle (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| SHOPAPP | OPEN; expiry=2027-04-23T05:41:35.000Z; last login=not recorded (does not prove the password was never used) | DBA_USERS |

Confirm unused accounts and retained object ownership with application owners before planning account lifecycle changes.

### Audit Configuration (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| ORA_LOGON_FAILURES | Enabled BY USER ALL USERS (USER); success=NO, failure=YES; 1 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| ORA_SECURECONFIG | Enabled BY USER ALL USERS (USER); success=YES, failure=YES; 49 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| Logon coverage | ORA_LOGON_FAILURES: success=NO, failure=YES, scope=BY USER ALL USERS; policy scope and conditions require review. | AUDIT_UNIFIED_POLICIES |
| Privilege-use coverage | 30 distinct system privilege options in enabled policies: ADMINISTER KEY MANAGEMENT, ALTER ANY PROCEDURE, ALTER ANY SQL TRANSLATION PROFILE, ALTER ANY TABLE, … (complete list in JSON evidence). This does not establish coverage of all privilege use. | AUDIT_UNIFIED_POLICIES |

Have a DBA validate logon and privilege-use coverage for every relevant principal, including success and failure, policy conditions and the active audit mode. Policy configuration does not prove events are being collected.

## Check Status

- Open Accounts with Default Passwords [default-passwords]: ok; no findings in available evidence.
- Powerful Privileges [powerful-privileges]: ok; no findings in available evidence.
  Role reachability includes grants regardless of default/enabled role state; roles may require activation. Expansion stops at ten role edges.
- PUBLIC Grants [public-grants]: ok.
- Password Profiles for Open Users [profiles]: ok.
- Account Lifecycle [accounts]: ok.
- Audit Configuration [audit]: ok.
  No traditional statement audit options observed in available evidence.
- Security Parameters [parameters]: ok.
  O7_DICTIONARY_ACCESSIBILITY: N/A (not exposed on this Oracle 19c target).
- Who Can Access an Object [who-can]: skipped.
  Supply --who-can OWNER.OBJECT.
```

</details>

### Who-can output from the full reports

```text
### Who Can Access HR.EMPLOYEES (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| HR | OWNER: HR → HR.EMPLOYEES (owner) | DBA_OBJECTS |
| HARNESS_LAB | SELECT: HARNESS_LAB → HR.EMPLOYEES (direct) | DBA_TAB_PRIVS |
| OE | REFERENCES: OE → HR.EMPLOYEES (direct) | DBA_TAB_PRIVS |
| OE | SELECT: OE → HR.EMPLOYEES (direct) | DBA_TAB_PRIVS |

Review privilege paths with the account owner and retain only privileges required for their duties.
```

```text
### Who Can Access SHOPAPP.ORDERS (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| SHOPAPP | OWNER: SHOPAPP → SHOPAPP.ORDERS (owner) | DBA_OBJECTS |
| HARNESS_RO | SELECT: HARNESS_RO → SHOPAPP.ORDERS (direct) | DBA_TAB_PRIVS |

Review privilege paths with the account owner and retain only privileges required for their duties.
```

## Verification results

- `npm run typecheck`: passed.
- `npm test`: 83 files passed, 1,201 tests passed (including 20 new security tests).
- `PIAGENT_BROWSER_LIVE=0 npm run test:browser`: 44 passed, 3 skipped.
  Existing opt-in live captures/Strata test skipped; fake-server browser tests
  ran without LLM calls. No browser implementation was changed in WP-20A.
- `PIAGENT_SECRET_DIR=… npx vitest run tests/integration/security.test.ts`:
  2 passed, no skips. Only this new integration file was run; the full suite
  and evals were deliberately not run while the eval gate uses Strata.
- Unit fixtures cover nested/cyclic roles, depth and row caps, owner/direct/role/
  PUBLIC/ANY paths, profile inheritance, missing views, audit scopes, lifecycle
  semantics, Markdown escaping and usage errors. The SQL scan covers every
  SQL literal under src/security, rejects forbidden credential/hash columns and
  USER$ access, and checks the SQL registry against the read-only classifier.

No shared contract, dependency or grant changes are needed. `PLAN.md`,
`package.json` and `src/contracts.ts` were not modified.
No live nested-role/ANY fixture was created: read-only constraints prohibit that.
Other unverified behavior is explicitly described above (effective session access,
column grants, proxy access, dictionary ANY semantics, and actual audit collection).

## Review follow-up (M1, L2, L3), 2026-11-05

All three findings in review-wp-20a section 4 are addressed:

- **M1:** the source gate recursively parses every TypeScript file under
  `src/security/`, using the parser already installed with the test tooling.
  It inspects every string/template literal, reconstructs adjacent `+` pieces
  and template interpolations, resolves unambiguous local constants, and decodes
  escaped characters without executing inspected source. Quote/whitespace
  normalization catches quoted SYS."USER$" and qualified/quoted forbidden views.
  Forbidden names include UNIFIED_AUDIT_TRAIL, V$SQL_BIND_CAPTURE (also its
  dictionary/global spellings), VALUE_STRING, PASSWORD_VERSIONS and all HASH
  identifiers, alongside the original credential columns. Negative fixtures
  cover every review bypass, nested/concatenated fragments and encoded characters.
  SQL profile resource literals and advisory prose are distinguished from column
  identifiers; source parse failures fail the gate.
- **L2:** every returned check's advice starts with `For a human DBA:`, including
  skipped/unavailable checks. A fixture asserts this across all check IDs.
  The full smoke transcripts above record the initial pre-review wording;
  current output adds the prefix to each advice paragraph.
- **L3:** live integration assertions now require a non-empty default-password
  subject set including HR on d1, an empty set on p1, and the complete
  SHOPAPP → SHOPAPP.ORDERS owner path on p1.

Validation after these changes:

- `npm run typecheck`: passed.
- `npm test`: 84 files passed, 1,248 tests passed.
- `PIAGENT_BROWSER_LIVE=0 PIAGENT_ALERTLOG_LIVE=0 PIAGENT_SQL_LIVE=0 npm run test:browser`:
  44 passed, 3 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/security.test.ts`:
  2 passed, no skips; both live baseline assertions passed.

Only the security integration file ran. No LLM calls, new dependencies,
shared contract changes, database writes or permission changes were needed.

### Parser dependency follow-up

The SQL gate now uses only the declared `typescript` devDependency. TypeScript
7.0.2 no longer exports the legacy `ts.createSourceFile` API, so a small local
`createSourceFile` adapter obtains a compiler SourceFile through TypeScript's
native API in an isolated virtual project. The walker uses TypeScript node
kinds/guards for string literals, templates, constants and `+` expressions.
The adapter rejects parse errors and missing projects/source files, disposes
compiler resources, and never executes inspected code. No rolldown import or
package changes remain.

All existing bypass tests still pass. A new non-vacuity test asserts that the
source walk discovers a non-zero number of real SQL strings and contains every
statement in the current SQL catalog.

Validation: `npm run typecheck` passed; `npm test` passed (84 files, 1,249 tests).
This follow-up changes test infrastructure only; no DB or LLM calls were made.

### Profile finding aggregation (WP-20C coordinator review)

Current profile findings use one row per profile/resource/effective limit, with
the profile as subject and a sorted list/count of affected open custom users in
the detail. DEFAULT inheritance resolves before grouping. The d1 DEFAULT verify
function finding therefore lists ten users once, and p1 lists two users once;
the earlier smoke transcripts above retain the historical per-user format.
Core findings drive CLI Markdown, reports and the web tab, so all consumers get
the aggregation. Counts of profile findings now mean profile-limit groups, not
users. Complete DBA_USERS/DBA_PROFILES evidence rows are retained in JSON.
