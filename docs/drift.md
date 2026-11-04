# Cross-target drift (WP-13A)

`piagent drift` compares metadata on the two configured, approved Oracle 19c
targets. It uses no agent or LLM. All database queries use the existing SQL
policy, read-only session provider, statement timeout and row cap. Each query
records a SQL hash, target, section, row count and truncation flag in the audit
log; errors record a fixed error class, never driver text or bind values.

```sh
piagent drift --left d1-19c-lab --right p1-19c-prod --scope parameters
piagent drift --left d1-19c-lab --right p1-19c-prod --scope schema:HR --json
piagent drift --left d1-19c-lab --right p1-19c-prod --scope objects:HR --out ./drift-results
```

Scopes:

- `parameters`: non-default initialization parameters from `V$PARAMETER`.
  A parameter present as non-default on just one side appears in that side's
  group. This does not infer the other database's default value.
- `schema:OWNER`: tables, columns (position, datatype and type owner, byte and
  character length, precision, scale, nullability), constraints (including ordered
  columns, checks, referenced table/columns and validation state), indexes
  (ordered columns, expressions, direction, uniqueness, status, type, visibility),
  object counts by type and invalid objects.
- `objects:OWNER`: object inventory by type/name/subobject and status, object
  counts by type and invalid objects. This is the lighter inventory comparison;
  use `schema` for structural details.

Owners are unquoted Oracle identifiers and are uppercased, validated and bound.
Both sides use the same owner. Results describe metadata visible to each
read-only account through `ALL_*`; an absent object means absent from that
account's visible inventory, not proof it does not exist. These views do not
establish a schema's existence or prove equal grants. No row contents are read.

Results group entries into `onlyLeft`, `onlyRight` and `different`. Entries
use JSON-encoded composite keys; differences carry both normalized values.
Whitespace outside quoted SQL literals/identifiers is collapsed, while literal
contents and case remain significant. Oracle-generated constraint names and
`SYS_C` numeric index names match by full structure, retaining duplicate
structures. A changed generated structure appears as only-left/only-right.
Storage attributes and DDL storage clauses are excluded by selecting logical
metadata rather than comparing DDL text. User-assigned names remain significant.

Every section must be readable and uncapped on **both** sides to be compared.
A failed or capped section says `unavailable`, includes a sanitized reason
(and the needed SELECT grant for ORA-00942/ORA-01031), and has empty difference
groups. Potentially truncated 4000-byte check expressions are also withheld.
Sections use individual read-only transactions, not a cross-database snapshot;
concurrent metadata changes can affect comparisons. No pagination silently
circumvents the configured row cap. Larger schemas can therefore be incomplete.

Exit codes: **0** = complete with no drift, **3** = observed drift, **1** =
incomplete without observed drift (or command failure). Inspect `complete` even
when exit code is 3: some sections may be unavailable. An incomplete self-compare
has no differences but is not evidence of equality.

`--json` prints one `DriftResult` with `left`, `right`, canonical `scope`,
`generatedAt`, `complete`, `hasDrift`, and `sections`. Each section has `name`,
`source`, `status`, `notes`, `onlyLeft`, `onlyRight`, and `different`.
`--out` additionally writes a uniquely named JSON/Markdown pair, mode 0600,
creating the directory with mode 0700 if necessary. It does not change an
existing directory's permissions. The directory itself must not be a symlink.
Output files contain database metadata and parameter values; choose a private
local directory. No saved drift files are read or executed by this command.

## Engine interface for WP-13B

Import `compareTargets(ctx: ToolContext, options: DriftOptions)` and the exported
`DriftResult`, `DriftSection`, `DriftEntry` types from `src/drift/index.ts`.
Options are `{ left, right, scope }`. Configuration membership and pinned-target
restrictions are validated before opening sessions. Collection is sequential;
each session is closed after its query. `UnsupportedVersionError` propagates.
Other query failures produce unavailable sections. Render web values with
`textContent`; keys and values contain untrusted database identifiers/text.
`renderDriftMarkdown(result)` escapes database text for Markdown output.
No changes to shared contracts or dependencies are required.

## Verification

Unit tests cover normalization (including quoted whitespace), generated-name
multiplicity, named and ordered components, every result category, scope/target
validation, policy-approved SQL, query caps/timeouts/audit, missing grants,
truncated check text, 19c refusal, output escaping, CLI exit codes, private
saved files and cleanup. Integration tests compare each target to itself for
all scopes, then compare d1/p1 twice and require identical sections.

Live verification on 2026-11-03 found p1 lacks SELECT on `SYS.V_$PARAMETER`;
parameter comparison correctly reports unavailable. Security review by
Antigravity remains a coordinator gate.

WP-13A checks: `npm run typecheck` passed; `npm test` passed 670 tests
in 38 files. `npm run test:integration --
--testNamePattern='^(?!.*(?:end-to-end ask|localhost:1521|out-of-scope database)).*$'`
passed 23 tests in 8 files, excluding the LLM e2e and two non-19c gate tests
under the owner's narrower execution restrictions. A direct drift integration
run also passed. Schema/object comparisons were complete and stable across two
runs; all self-comparisons had empty difference groups. The live CLI parameter
check exited 1 for the missing grant. CLI schema:HR with JSON and a temporary
output directory exited 3 with a complete result and two saved files.
