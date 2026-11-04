# PL/SQL documentation

These commands read Oracle 19c metadata without LLM calls or executing PL/SQL:

```sh
piagent plsql list --target p1-19c-prod --owner SHOPAPP
piagent plsql doc --target p1-19c-prod --object SHOPAPP.WORKLOAD
piagent plsql doc --target d1-19c-lab --object HR.ADD_JOB_HISTORY --json --out ./plsql-docs
```

`list` accepts `--json`. `doc` accepts `--json` and `--out dir`; exports always
contain Markdown and JSON. Only configured targets and ordinary unquoted
OWNER.NAME identifiers are accepted. Owner/name filters use binds.

The typed read API lives in `src/plsql/dictionary.ts`; `documentPlsql` and
`listPlsql` in `src/plsql/index.ts` accept the existing `ToolContext`.
Every dictionary section is an `Evidence<T>` with `status`, `view`, `rows`,
`truncated`, and `attempts` (view and ORA code). DBA views fall back to ALL views
only on ORA-00942/01031. A successful empty ALL result means no visible records,
not proof that no object exists. Other failures are unavailable, with an ORA code
when supplied by Oracle, otherwise QUERY_FAILED. Connection/version failures
propagate. Audit events contain hashes and result counts, never source or binds.

Source is paged within configured session row limits, to at most 2,000 rows
combined across specification and body. All quoted literals are conservatively
redacted, including q quotes and multiline literals; numeric defaults remain
visible. Signatures retain subprogram IDs, overloads, argument sequence and
nesting, modes, return types, named types and default flags. Oracle does not
expose usable default expressions through these views: DEFAULT / := expressions
are parsed from the matched specification declaration and attached as argument
`default` values (null when unavailable). A missing
comment or declaration remains empty rather than being invented.

Table operations come from a static scan with comments and literals removed.
The package/object-level union is retained. Each signature additionally has
`bodyRange` (source type, startLine, endLine, heuristic) or null, and `tables`
containing only operations observed in that range. These remain heuristic hints,
not runtime proof. The range scanner tracks nested blocks, excludes local nested
routine bodies from the enclosing routine scan, and skips forward declarations.
Overloads match parameter names/types; ambiguous or incomplete bodies stay
unavailable. A single non-overloaded routine may match names/counts when `%TYPE`
cannot be resolved statically. Dynamic SQL, synonyms, quoted identifiers and indirect calls can be
missed. Scheduler matching is also a lexical hint; indirect scheduler program
references are not resolved. A cap or unavailable section makes `complete: false`.
List line counts are visible fetched counts; `sourceTruncated` marks lower bounds.

Exports use private exclusive temp files (0600) in the destination directory
(created 0700), rename Markdown first, and publish JSON last as the commit
marker. Failed publication removes staging files and uncommitted Markdown.
A symlink destination is rejected. Existing directories retain their permissions.

## Stable graph contract (schemaVersion 1 document)

`graph` has exactly `{nodes, edges}`. Nodes have `id`, `kind`, `label`; kinds are
`object`, `subprogram`, `table`, `job`. IDs are deterministic strings:

- `object:OWNER.NAME`, `table:OWNER.NAME`, `job:OWNER.NAME`
- `subprogram:OWNER.NAME:SUBPROGRAM_ID:OVERLOAD` (empty final field if absent)

Edges have `from`, `to` (node IDs), `kind`, `heuristic` (boolean), and an optional
`label` string (additive schemaVersion 1 field). Kinds:
`contains` object → subprogram; `depends-on` object → dictionary dependency;
`may-use` subprogram → table observed in its range, with `label` set to the
operation (SELECT/INSERT/UPDATE/DELETE/MERGE), one edge per operation;
`references` job → matching entry point parsed from OWNER.PACKAGE.SUBPROGRAM,
or root object when no entry point can be identified. Object-level depends-on
edges remain for unresolved ranges, unattributed tables, and non-table
dependencies. Only contains/depends-on are non-heuristic. Overloaded job entry points yield
multiple candidates. Nodes and deduplicated edges are sorted for deterministic
JSON; UI code must treat IDs/labels as text, never markup. `mermaid` renders
this graph with generated safe node IDs and sanitized labels.

WP-16B can reuse the dictionary and source evidence without changing shared
contracts. WP-16C can render `graph` directly as SVG; no Mermaid runtime is needed.

## WP-16A verification (2026-11-04)

- `npm run typecheck`: pass.
- `npm test`: 837 tests passed across 51 files.
- `PIAGENT_SECRET_DIR=… npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask)'`:
  28 passed, one deliberately filtered LLM test skipped, ten files passed.
- Live `plsql doc` on SHOPAPP.WORKLOAD: complete evidence from DBA views,
  both VALID objects, three signatures, three tables and three scheduler jobs.
- Live HR list: four objects; integration documents an HR procedure.
- Live Markdown and JSON exports created successfully; failure cleanup and private
  modes covered by unit tests. No database writes or LLM calls were made.

The [WORKLOAD Markdown sample](plsql-workload-example.md) is the full live command
output, including the graph and line-numbered source appendix. It is a snapshot,
not a claim that scheduler state remains unchanged.

No shared contract changes or dependencies are needed. Remaining limits are the
explicit static-analysis caveats above; runtime call paths, dynamic SQL and
indirect scheduler program resolution were not verified or inferred.


The coordinator review added per-subprogram operations and body ranges, parsed
argument defaults, operation-labelled graph edges and fully qualified job entry
point matching. Callers omit the PACKAGE BODY → PACKAGE self-dependency.
Markdown includes a summary, tight lists and fenced declarations where no spec
comment exists. Live WORKLOAD ranges: PLACE_ORDERS 2–18, SHIP_ORDERS 19–23,
NIGHTLY_PURGE 24–29. HR.ADD_JOB_HISTORY spans lines 1–13 and inserts JOB_HISTORY.


Antigravity findings fixed: DELETE target FROM clauses no longer count as
SELECT, while nested subqueries still contribute reads of their own tables.
MERGE USING sources contribute SELECT, including direct table references.
The shared scanner masks comments and ordinary/q-quoted literals first.
Declaration boundaries and parameter matching ignore comment/literal semicolons;
trailing line-comment newlines are preserved before the terminating semicolon.
The refreshed live WORKLOAD example shows ORDER_LINES as DELETE-only inside
NIGHTLY_PURGE; ORDERS retains SELECT from the subquery and DELETE as a target.
