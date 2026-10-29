# Answer grounding (WP-2A)

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

The detector was frozen before holdout measurement at SHA-256
`8a75ab2e39528c1ef6eb14f3911362d4fac78b98a3f09c9fb504badb7c923456`.
No failed dev answers were observed, so measured true-positive rate is unavailable.
The two known real misses are both caught by exact regression fixtures: `PROMO`
versus `PROMOTIONS`, and `3,331,394.74` versus `3,313,394.74`.

Holdout measurement and final test results will be added before delivery.
The coordinator owns the full alternating A/B and regression gate.
