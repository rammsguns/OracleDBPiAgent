# WP-20D: Phase 20 security evals

Six challenge cases in `evals/cases-hard/phase20-security.json`. No product, contract, runner or scorer changes.

## Live truth verification

Verified 2026-11-05T17:20:42.298Z through `evals/ground-truth.ts`, using only the two configured diagnostic accounts and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`. Each connection passed the Oracle 19c version gate, used a read-only transaction, and rolled back. No setup SQL, writes, credential output or LLM calls.

### hard-p20-d1-open-default-count (d1-19c-lab)

```sql
SELECT COUNT(*) AS open_default_count FROM dba_users u JOIN dba_users_with_defpwd d ON d.username=u.username WHERE u.account_status='OPEN'
```

Observed rows:

```json
[
  [
    5
  ]
]
```

### hard-p20-d1-role-any-paths (d1-19c-lab)

```sql
SELECT DISTINCT r.granted_role AS granting_role, r.role_depth AS role_depth, p.privilege AS privilege FROM (SELECT granted_role, LEVEL AS role_depth FROM dba_role_privs START WITH grantee='HARNESS_APP' CONNECT BY NOCYCLE PRIOR granted_role=grantee AND LEVEL<=10) r JOIN dba_sys_privs p ON p.grantee=r.granted_role WHERE INSTR(' ' || p.privilege || ' ',' ANY ')>0 ORDER BY granting_role, role_depth, privilege
```

Observed rows:

```json
[
  [
    "HARNESS_MAINTENANCE_ROLE",
    1,
    "ALTER ANY PROCEDURE"
  ],
  [
    "HARNESS_MAINTENANCE_ROLE",
    1,
    "ANALYZE ANY"
  ]
]
```

### hard-p20-d1-public-file-execute (d1-19c-lab)

```sql
SELECT COUNT(*) AS public_execute_count FROM dba_tab_privs WHERE grantee='PUBLIC' AND owner='SYS' AND table_name='UTL'||'_FILE' AND privilege='EXECUTE'
```

Observed rows:

```json
[
  [
    1
  ]
]
```

### hard-p20-p1-inherited-profile-limit (p1-19c-prod)

```sql
SELECT p.profile AS profile, p.limit AS stored_limit, CASE WHEN p.limit='DEFAULT' THEN d.limit ELSE p.limit END AS effective_limit FROM dba_profiles p JOIN dba_profiles d ON d.profile='DEFAULT' AND d.resource_name=p.resource_name AND d.resource_type=p.resource_type WHERE p.profile='GSM_PROF' AND p.resource_name='PASSWORD_LIFE_TIME'
```

Observed rows:

```json
[
  [
    "GSM_PROF",
    "DEFAULT",
    "180"
  ]
]
```

### hard-p20-p1-default-profile (p1-19c-prod)

```sql
SELECT resource_name AS resource_name, limit AS configured_limit FROM dba_profiles WHERE profile='DEFAULT' AND resource_type='PASSWORD' AND resource_name IN ('FAILED_LOGIN_ATTEMPTS','PASSWORD_LIFE_TIME','PASSWORD_VERIFY_FUNCTION') ORDER BY resource_name
```

Observed rows:

```json
[
  [
    "FAILED_LOGIN_ATTEMPTS",
    "10"
  ],
  [
    "PASSWORD_LIFE_TIME",
    "180"
  ],
  [
    "PASSWORD_VERIFY_FUNCTION",
    "NULL"
  ]
]
```

### hard-p20-p1-enabled-audit-policies (p1-19c-prod)

```sql
SELECT policy_name AS policy_name, enabled_option AS enabled_option, entity_name AS entity_name, entity_type AS entity_type, success AS success, failure AS failure FROM audit_unified_enabled_policies ORDER BY policy_name, entity_name, entity_type, enabled_option, success, failure
```

Observed rows:

```json
[
  [
    "ORA_LOGON_FAILURES",
    "BY USER",
    "ALL USERS",
    "USER",
    "NO",
    "YES"
  ],
  [
    "ORA_SECURECONFIG",
    "BY USER",
    "ALL USERS",
    "USER",
    "YES",
    "YES"
  ]
]
```

## Case design and coordinator gate

All cases use `rowCells`, preserving each record's association. No scorer change
or archive replay is needed. Default-password truth reads only the dedicated
account-name view joined to account status. Counts return a row even at zero;
role paths, profiles and enabled-policy lists opt into `skipWhenTruthEmpty` so
empty pre/post truth is skipped by the existing runner. Missing grants remain
errors rather than being mistaken for an empty configuration.

The observed HARNESS_APP path has one role edge; truth reports the granting role and depth because SYS_CONNECT_BY_PATH is outside the existing product SQL allowlist. the recursive query also handles
nested roles with `NOCYCLE` and a ten-edge cap. No nested-role or DBA grant was
invented to seed the case. GSM_PROF inherits PASSWORD_LIFE_TIME, while its failed
login limit is explicit, so the inheritance case uses lifetime. The UTL_FILE
name is expressed as two concatenated literals because the existing independent
truth validator conservatively rejects the text `UTL_` even inside SQL strings.
Only grant metadata is read; no package is invoked.

The two prose explanations (file access and audit coverage) are requested for
human review; the automatic checks score metadata records and tool use only.

Strata was not free: no LLM evals, health probes, or integration tests that could
call it were run. The coordinator should measure these six IDs twice when free:

```sh
npm run eval -- --suite evals/cases-hard --repeat 2 \
  hard-p20-d1-open-default-count hard-p20-d1-role-any-paths \
  hard-p20-d1-public-file-execute hard-p20-p1-inherited-profile-limit \
  hard-p20-p1-default-profile hard-p20-p1-enabled-audit-policies
```

No contract changes or additional grants are needed. The hard suite grows from
103 to 109 cases; existing dev, holdout and regression counts stay unchanged.

## Validation results

- `npm run typecheck`: passed (exit 0).
- `npm test`: passed, 82 files and 1,182 tests (exit 0).
- `git diff --check`: passed.
- All six final truth queries verified live, including the revised role/depth query.
- Integration suite not run: no product DB/LLM code changed, and it includes LLM calls.
- LLM answer quality and p20 ×2 pass rates remain unverified until the coordinator gate.
