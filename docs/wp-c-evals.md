# WP-C evals and integration handoff

32 cases cover both configured targets: schema discovery, live data, identity,
performance, storage, plan reading, access limitations, and three refusals. The
runner executes one complete agent ask at a time, writes JSON and Markdown to
ignored `evals/results/`, and exits nonzero below 80% or on any failed refusal.
Each scored case records required regex facts, required tools, forbidden claims,
and whether an explicit refusal is required. Fresh SQL values are checked with
numeric/token boundaries; displayed thousands separators are normalized.

## Commands

Set `PIAGENT_SECRET_DIR` to the existing harness secrets directory. Passwords are
read there only; no credentials are stored in eval artifacts.

- `npx tsx evals/validate.ts`: SELECT-only validation with an independent 19c gate;
  refreshes the checked-in aggregate/catalog-only validation evidence.
- `npm test`: offline scorer and case coverage checks.
- `npm run test:integration`: both real 19c gates, INSERT rejection at the driver
  boundary, non-19c gate rejection, and one sequential Strata ask. Dependency
  absence skips explicitly; product failures after prerequisites are present fail.
- `npm run eval`: coordinator only, after integration and merge. The full eval was
  deliberately not run in WP-C.
- Supplemental typecheck (project tsconfig includes only src):
  `npx tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck evals/*.ts tests/unit/wp-c-scoring.test.ts tests/integration/wp-c.integration.test.ts`

## Required coordinator interface confirmation

`src/contracts.ts` does **not** declare `createOracleAgent`, `loadConfig`, or a
session provider factory. The guarded local adapter in `evals/runtime.ts` assumes:

- `src/config/index.ts`: `loadConfig(process.env): AppConfig | Promise<AppConfig>`.
- `src/oracle/index.ts`: `createSessionProvider(config): SessionProvider | Promise<SessionProvider>`.
- `src/tools/index.ts`: `createDbTools(ctx)` per `CreateDbTools`.
- `src/agent/index.ts`: `createOracleAgent({ ...ToolContext, tools })` returns a PI
  Agent (or Promise), exposing `prompt`, `state.messages`, and optional `dispose`.

Reconcile these entrypoints in this local adapter after WP-A/B merge, or add the
factory signatures to contracts centrally. Missing module files are a clear
integration skip and a runner startup failure, never a pretend eval result.
The supplied audit sink persists safe audit fields in `config.auditFile`, omitting
raw SQL/detail and binds. Factory hooks must use that sink for lifecycle events.
No package.json change is needed: `npm run eval` already invokes `evals/run.ts`.

## Real database findings and limits

On 2026-10-26, the configured HARNESS_LAB account got ORA-00942 for
`HR.EMPLOYEES`; HR and OE tables were absent from its ALL_TABLES results. The
HR=107/OE=105 examples cannot be independently validated using this account.
We use accessible SH tables instead and include an honest HR-access case.
HARNESS_RO can SELECT SHOPAPP data. Validation evidence contains 19 queries:
`evals/ground-truth-validation.json`; these are observations, not scoring constants.

SHOPAPP counts change under load. A count can move between ground-truth capture
and tool execution; the exact-value scorer intentionally exposes this as a failure
rather than guessing a tolerance. Review timestamps/tool evidence for such cases.
Performance checks validate tool use and grounded answer shape, not an unstable
ranking snapshot. Plan reading permits an explicit read-only/unavailable result
because EXPLAIN PLAN writes are prohibited; WP-C never issues EXPLAIN PLAN.

The INSERT integration probe wraps the real driver's connection execute method
with a safety tripwire. It requires StatementRejectedError and zero attempted
INSERT calls. Even a broken classifier cannot transmit the probe INSERT.
The only non-19c DSN is constructed inside the dedicated gate test using the
explicitly authorized HARNESS_LAB/d2_lab.pw account. It is never registered in
config or used by ground-truth validation. Actual gate/policy/ask behavior remains
unverified until WP-A/B modules are merged; current tests skip missing modules.
Strata health was loaded/ok; no LLM request or reconfiguration was performed.
