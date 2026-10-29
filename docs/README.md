# Documentation index

Start with [the project README](../README.md). Reports and reviews describe the
revision they checked; use the status page and current code for today's behavior.

## Status and plans

- [mvp-status.md](mvp-status.md) — Current state, verification history and closed experiments.
- [Project plan](../PLAN.md) — Scope, hard rules, architecture and work-package ownership.
- [README.md](README.md) — This documentation index.

## Evals and optimization

- [evals-hard.md](evals-hard.md) — Hard-suite cases, splits and ground-truth checks.
- [model-optimization.md](model-optimization.md) — Variant results, promotions and rejected token-saving experiments.

## Reports, grounding and web UI

- [report.md](report.md) — Read-only DBA report sections, CLI options, summary grounding and live verification.
- [grounding.md](grounding.md) — Evidence checks, numeric-only corrections, unverified facts and measurement results.
- [web-ui.md](web-ui.md) — Local server API, authentication, chat, Report tab and Markdown export.

## Compatibility and grants

- [compatibility-19c.md](compatibility-19c.md) — Oracle 19c access, fallbacks, SQL policy and source limits.
- [grants-request-2026-10-26.sql](grants-request-2026-10-26.sql) — Historical SELECT-grant script applied with owner authorization; not an agent setup step.

## WP reports

- [wp-a.md](wp-a.md) — Agent, LLM, CLI and audit integration notes.
- [wp-c-evals.md](wp-c-evals.md) — Initial eval runner and integration-test handoff.
- [wp-e-allowlist-doctor.md](wp-e-allowlist-doctor.md) — Shared target allowlist and doctor failure checks.
- [wp-f-chat-budget-evals.md](wp-f-chat-budget-evals.md) — Multi-turn and budget eval implementation report.
- [wp-l-compact-describe.md](wp-l-compact-describe.md) — Compact metadata rendering and validation.
- [wp-n-cache-tokens.md](wp-n-cache-tokens.md) — Cached-token accounting in evals and optimizer reports.
- [wp-o-reasoning-budget.md](wp-o-reasoning-budget.md) — Opt-in Strata thinking-budget setting.
- [wp-p-tool-error-diagnostics.md](wp-p-tool-error-diagnostics.md) — Per-tool-call eval diagnostics.
- [wp-q-error-hints.md](wp-q-error-hints.md) — Bounded dictionary-column and query-error hints.
- [wp-r-request-usage.md](wp-r-request-usage.md) — Per-request token and message-size diagnostics.
- [wp-s-short-prefix.md](wp-s-short-prefix.md) — Shorter system prompt and tool definitions.
- [wp-ab-browser-tests.md](wp-ab-browser-tests.md) — Browser coverage, phone layout fix and opt-in live smoke.
- [wp-u-web-server-report.md](wp-u-web-server-report.md) — Web-server implementation and validation report.

## Reviews

- [review-mvp-2026-10-26.md](review-mvp-2026-10-26.md) — Initial MVP review and requested fixes.
- [review-round2-2026-10-26.md](review-round2-2026-10-26.md) — Fallbacks, target allowlist and doctor review.
- [review-round3-2026-10-27.md](review-round3-2026-10-27.md) — Paged source, chat evals and budget scoring review.
- [review-wp-jk-2026-10-27.md](review-wp-jk-2026-10-27.md) — Promoted defaults and function-call policy review.
- [review-post-jk-2026-10-27.md](review-post-jk-2026-10-27.md) — Follow-up SQL-policy, guidance and grant review.
- [review-fixes-2026-10-27.md](review-fixes-2026-10-27.md) — Charset checks, doctor dependencies, ledger versioning and guidance review.
- [review-wp-l-2026-10-27.md](review-wp-l-2026-10-27.md) — Compact describe-result review.
- [review-wp-n-2026-10-27.md](review-wp-n-2026-10-27.md) — Cached-token accounting review.
- [review-wp-o-2026-10-27.md](review-wp-o-2026-10-27.md) — Optional thinking-budget review.
- [review-wp-p.md](review-wp-p.md) — Tool-error diagnostics review.
- [review-wp-q.md](review-wp-q.md) — Query-error hints review.
- [review-wp-r.md](review-wp-r.md) — Request-usage diagnostics review.
- [review-wp-s.md](review-wp-s.md) — Short-prefix safety and wording review.
