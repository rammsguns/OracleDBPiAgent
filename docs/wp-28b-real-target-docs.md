# WP-28B completion report

Branch: `wp-28b-real-target-docs`. Scope: owner documentation and PDB grant template
from phase 28; no product source, contracts, package manifest or PLAN edits.

## Built and changed

- `docs/real-targets.md`: DBA/owner path from fresh local PDB account through
  reviewed grants, private files, preflight, deterministic commands and ask.
  Documents WP-28A's agreed flags and selection rules as pending parallel work,
  privileged-account checks, root refusal and live-PDB limitations.
- `docs/grants-template-pdb.sql`: identity inspection with `&pdb_name`, then
  CREATE SESSION and 107 unique SYS SELECT grants to `&ro_user`, all local to
  the current container. No object creation, container switch, write/ANY/EXECUTE
  privilege, role grant, grant option or excluded source. The DBA must execute
  the identity inspection separately and confirm it before applying grants.
- `docs/grants.md`: reproducible grep method and reviewed query-builder expansion;
  comparison of seven historical files with fixed SQL. Historical union: 59 SYS
  views plus 20 sample base tables. Resolved fixed SQL: 98 views; 48 additions to
  historical SYS views and 9 historical-only retained dependencies. Union: 107.
  Sample base tables omitted. V$TEMPSEG_USAGE normalized to SYS.V_$SORT_USAGE.
- `config/targets.example.json`: strict JSON owner-PDB example with placeholders,
  production environment, no credentials and tabs for indentation.
- `README.md`, `docs/install.md`: owner guide links, configured-target behavior,
  targets check and private target-file selection, preserving lab instructions.

The optional SELECT_CATALOG_ROLE shortcut is described in prose, with its broader
exposure and account-check limitations. It is absent from executable template SQL
so that the template itself grants only SELECT and CREATE SESSION and cannot
implicitly grant excluded sources.

## Validation

`node_modules` was missing; created the requested ignored symlink to
`../needlefish/node_modules`. No dependencies or package files changed.

```text
$ npm run typecheck
> oracledb-pi-agent@1.3.0 typecheck
> tsc -p tsconfig.json --noEmit
Exit 0; no diagnostics.

$ npm test -- --maxWorkers=2
Test Files  103 passed (103)
     Tests  1606 passed (1606)
  Duration  67.88s
Exit 0.
```

Static validation passed: strict JSON example parses; 107 unique SELECT grants;
all 59 historical SYS grant targets retained; excluded sources absent; all 108
GRANT statements are exactly SELECT or CREATE SESSION with CONTAINER=CURRENT.
`git diff --check` passed. This validates the artifact, not execution in a PDB.

Required filtered integration run:

```bash
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

```text
Test Files  26 passed (26)
     Tests  61 passed | 1 skipped (62)
  Duration  160.31s
Exit 0. The excluded Strata e2e test is the single skipped test.
```

Implementation/docs commit: `b8f690e` (`docs: add owner PDB setup guide and explicit read-only grants`).
This report is committed separately after recording the required check results.

## Coordinator changes and unverified work

No TypeScript contract change is needed by this documentation WP. The existing
coordinator phase 28 contract changes and WP-28A/WP-28C implementations are assumed;
the documented new flags were not implemented or smoke-tested on this branch.
Reconcile their final view catalogs (especially the new USER_TAB_PRIVS account
check, normally public) with this inventory before release. Do not interpret
these documentation tests as verification of the parallel implementations.

Packaging follow-up outside this WP: package.json's files allowlist includes only
`config/targets.json`, not `config/targets.example.json`, and omits `docs/`.
The coordinator should include the example, owner guide and PDB grant template
(and linked docs as appropriate) in the release artifact, or provide a stable
release-matched documentation download. No package.json edit was made here.

No grants or account creation were executed. No real-owner endpoint was contacted.
No LLM/Strata calls, e2e ask, browser health checks or eval runs were made. The
required integration filter excludes the Strata e2e test; dedicated non-19c gate
tests may use the explicit localhost:1521/FREEPDB1 refusal exception.

Live PDB behavior, template execution on a fresh account, remote listener setup,
RAC, Data Guard standby, TCPS/wallets and release updates beyond lab 19.9.1 remain
unverified. No LLM answer quality gate was attempted. Oracle 19c primary docs for
local users, local grants and DBMS_XPLAN prerequisites are linked in the owner guide.
