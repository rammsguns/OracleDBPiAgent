# Answer grounding (WP-2A)

**Status: incomplete, blocked on the coordinator's Strata handover.** The checker,
eval capture and config/audit adapters are committed. The production agent does not
yet invoke the checker, and CLI JSON does not yet expose `unverified`.

The coordinator's message `msg_80fb144488cd` instructed: “when your current eval run
finishes, do NOT start another LLM run until I send you 'GO'.” The dev run completed
at 06:22:56 UTC; no GO arrived despite the pending question
`msg_9e3d566c3173`, repeated waits and escalation through Orca. Strata remained
healthy and loaded when rechecked. Only **one eval run** was used.

The prepared correction hook, CLI JSON field and eight fake-model tests are in
[grounding-pending.patch](grounding-pending.patch), deliberately **unapplied** until
the required holdout capture and offline measurement complete. The patch passes
`git apply --check`; in an isolated source copy it passes typecheck and all eight
tests, including one correction only, residual facts, question exemptions, failed
correction, fresh evidence, chat reset and preservation of exhausted budgets.

To finish in a fresh dispatch after the coordinator releases Strata:

1. Check `pgrep -af '[e]vals/run.ts|[p]iagent'` and Strata `/health`, then run
   `npm run eval -- --suite evals/cases-hard --split holdout --repeat 1` with `.env`
   loaded. Do not tune on holdout answers. The detector SHA below identifies the
   candidate to measure; use case questions/turns as the third checker argument.
2. Record flags on passing answers and flags on failed answers, then apply
   `git apply docs/grounding-pending.patch`. This enables one correction by default;
   `PIAGENT_GROUNDING_CHECK=0` disables it. Existing budgets remain in force.
3. Run typecheck, unit tests and the filtered integration command below, commit,
   and return the measurements for the coordinator's full A/B gate.

The pending patch returns `agent.unverified: string[]`, includes it in CLI JSON,
and emits only `unverifiedCount` at audit `run_end`. Coordinator-approved adapter
changes already implemented: `HarnessTunables.groundingCheck?: boolean` with strict
`PIAGENT_GROUNDING_CHECK=0|1`, plus `AuditEvent.unverifiedCount?: number` and the
product/eval audit allowlists. No further shared contract change is needed.

The checker is deterministic and makes no model or database calls. `checkFacts(answer,
texts, question?)` returns distinct extracted facts and unsupported facts. The optional
question text exempts facts supplied by the user; the agent supplies user messages from
the conversation, excluding its own correction instructions.

It checks quoted identifiers, uppercase Oracle identifiers, SQL IDs, and numbers with
at least four significant digits. Identifier matching uses case-insensitive whole
names, with owner and object components accepted when tools show them separately.
Numeric matching removes thousands separators and rounds to the displayed precision.
Direct numeric comparisons use exact decimal coefficients, retaining Oracle NUMBER
digits beyond JavaScript floating-point precision. Derived ratios use floating point
and conservatively refuse to certify precision below its numeric resolution.
Byte conversions accept both decimal and binary KB/MB/GB/TB (explicit KiB etc. use
binary only). Percentages can match directly or be derived from two tool values, including
ratios, growth and complements.
SQL vocabulary, units, years and Oracle 19c are exempt. An explicit list of standard
Oracle dictionary views and column names is also exempt: referring to `V$SESSION`
or `ALL_CONSTRAINTS` as a source does not assert that the view returned that name.
This is not a blanket exemption for `V$*`/`ALL_*`; invented view names still fail.
Tool names, standard lock/process abbreviations and Oracle number format masks
are treated as vocabulary. The checker also handles compact plan quantities
(`282K` → `282000`), labelled microseconds → seconds, and per-execution ratios
of two returned values. These last normalizations were motivated by the dev run.
A percentage-sum statement can use the constant 100.00.

This is a lexical evidence check: it does not prove a value belongs to the right row,
validate reasoning, or catch every invented claim. Small numbers and unquoted lowercase
names are outside its scope. The same precision rule that accepts rounded answers can
also accept a different value that rounds identically. Percentage support checks pairs
of values, without proving their semantic relationship.

Eval records retain `toolResultTexts` next to `toolDetails`, capped at 4,096 UTF-8 bytes
per result. Only text blocks are captured, never tool arguments or result metadata.
Long results can lose evidence at this cap; the product checker uses the conversation's
actual bounded tool results, rather than the eval capture.

## Verification

Capture-only dev run: `2026-10-29T06-22-56-120Z-f680277b-08c1-4b41-ad33-2dba3d30e9c2`.
All 20 cases passed. Initially 15/20 passing answers were flagged; generic vocabulary
and conversion handling reduced this to **1/20 (5%)**. The remaining answer asserted
HARNESS_LAB's access to HR/OE/CO and lack of access to IX without querying those
grants. It remains flagged. This metric is flags on scorer-passing answers, not
an independent proof that every flag is false.

No holdout measurement has run. The current detector candidate SHA-256 is
`8a75ab2e39528c1ef6eb14f3911362d4fac78b98a3f09c9fb504badb7c923456`.
No failed dev answers were observed, so measured true-positive rate is unavailable.
The two known real misses are both caught by exact regression fixtures: `PROMO`
versus `PROMOTIONS`, and `3,331,394.74` versus `3,313,394.74`.

Actual correction turns in the captured run: **0** (the hook was not wired).
Offline it would flag 1/20 dev answers. No live correction or holdout behavior was
verified; the eight correction tests use fake streams and make no LLM/DB calls.
The coordinator still owns the full alternating A/B and regression gate.

Final checks on the committed product source:

```text
npm run typecheck
  exit 0
npm test
  Test Files 20 passed (20)
  Tests 425 passed (425)
set -a; . ./.env; set +a; npm run test:integration -- -t "^(?!.*answers one end-to-end)"
  Test Files 5 passed (5)
  Tests 20 passed | 1 skipped (21)
```

The excluded test is the live end-to-end LLM answer test. The unapplied patch was
also checked in `/tmp/wp2a-preview`: typecheck passed; 8/8 fake-model hook tests
passed. No database data or objects were changed, no dependencies were added,
and no Strata configuration was changed.

Changed files: `src/agent/grounding.ts`, `evals/runtime.ts`, `evals/run.ts`,
`src/config/tunables.ts`, `src/contracts.ts`, `src/audit/index.ts`,
`tests/unit/grounding.test.ts`, this document and `grounding-pending.patch`.
