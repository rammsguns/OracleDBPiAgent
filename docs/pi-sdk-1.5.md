# PI SDK 1.5.0 audit (WP-14B)

Audited before changing code on 2026-11-04. Owner authorized exact 1.5.0 pins
for `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`.

## Evidence and method

Read the upstream [AI changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/CHANGELOG.md)
and [agent changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/agent/CHANGELOG.md),
1.5.0 sections dated 2026-11-02. Packed both packages at both 1.4.0 and
1.5.0 with `npm pack` into `.scratch/pi-sdk-audit/` under this worktree,
extracted them, and compared full `dist/` trees (including source maps) and
`package.json` with `diff -ru`. Also produced readable diffs excluding maps.
This fresh worktree had no installed node_modules, so the published tarballs
are the source comparison. Audited telemetry 1.4.0 vs 1.5.0 and schema 1.5.0
tarballs as well. Scratch artifacts are local, not committed.

## API changes affecting this project

- `AgentTool<TParameters extends object>` and `Tool` accept JSON Schema;
  `AgentToolParams`/`prepareArguments` infer through pi-schema `Static`.
  `outputSchema` accepts `object`. Common TypeBox kinds retain inference;
  Enum/Tuple/Intersect and other uncommon kinds infer unknown. This project's
  tools import TypeBox directly and use supported kinds, so keep those schemas.
- AI no longer re-exports TypeBox Type/Static/TSchema. No src import uses those
  re-exports. `StringEnum` returns a pi-schema schema with unchanged JSON;
  model/compat schemas use pi-schema and export ProviderCompat.
- Runtime tool validation now uses pi-schema compile/parse with coercion.
  Required null strings become "null", fractional integer strings truncate,
  scalars can wrap into arrays, and errors use pi-schema wording. Optional null
  removal remains supported. TypeBox refinements, codecs and custom registered
  formats no longer execute; BigInt/Undefined/Void reject JSON. Property names
  are literal and additionalProperties converts only undeclared keys. Unresolved
  refs reject only the value at that location. No src tool uses those unsupported
  extensions. Existing tool/agent tests must pass unchanged; behavior on new model
  argument shapes still requires the coordinator's eval gate.
- All providers (and agent streamProxy) use incremental ToolCallArgumentsStream;
  temporary raw arguments/index/custom-input state no longer leaks into partial
  content. Partial argument snapshots remain stable; final argument validation
  still applies. No application code depends on scratch fields.
- Usage.cost gains optional totalFromProvider (false for catalog calculations).
  OpenRouter may supply billed total including upstream BYOK costs. Strata usage
  input/output/cache counts and the application contracts are unchanged.
- New streaming parser exports, grammar delta/close helper signature, device-code
  browser/clipboard flags and pi-messages responseModel are unused by src.
  Agent loop and Agent constructor implementation are unchanged.

## OpenAI-compatible wire behavior

For custom provider `strata`, no request-builder change: POST to
`http://127.0.0.1:8080/v1/chat/completions`; bearer authentication, JSON content
and SSE response handling remain. Identity handling is unchanged except the
version embedded in the default User-Agent becomes `pi/1.5.0`. Attribution is
already disabled by the product Agent; no new attribution headers are added.
OpenAI SDK stays 7.19.0, including its existing x-stainless headers.

The body still contains model, messages, stream=true, stream_options.include_usage,
max_tokens/max_completion_tokens according to compatibility, reasoning_effort
according to the configured thinking level, and function tools with JSON Schema.
No new reasoning object or strict-schema encoding is introduced for Strata.
The optional reasoning_budget_tokens sampling parameter is passed unchanged.
Usage still reads prompt/completion/cached/reasoning token fields; only the cost
provenance field is new. Streamed argument parsing changes locally, not on wire.
Other provider changes include Kimi effort/history, OpenCode protocol endpoints,
OpenRouter Anthropic routing/billed cost, Gemini const-to-enum and Bedrock strict
fallback; none is selected by our custom provider.

## Network surface and dependencies

No new automatic provider, telemetry exporter, update check or network request
is introduced on this application's import/createModels/custom-provider path.
createModels starts with an empty provider map; only strata is registered.
Built-in catalog changes are static bundled data, not runtime discovery calls.
OAuth URL validation changes restrict schemes; device-code UI defaults apply
only to explicitly invoked OAuth flows, which the product does not use.

Telemetry existed in 1.4.0. pi-telemetry's entire dist is identical in 1.5.0;
it provides contracts and no-op adapters, no network exporter. AI defaults to
NOOP_TELEMETRY_CONTEXT/NOOP_TELEMETRY_METRICS unless explicitly supplied a span.
The only AI telemetry implementation change copies a bounded error string.
No telemetry adapter is supplied here. The mandatory stop condition is absent.

New transitive package: `@earendil-works/pi-schema@1.5.0` (no runtime dependencies).
pi-telemetry moves 1.4.0 to 1.5.0. SDK-local typebox 1.3.27 is removed; the
application retains its direct typebox dependency. Anthropic, AWS, Google,
OpenAI and proxy SDK dependencies are unchanged from 1.4.0; none is newly
registered or configured. No new direct dependency is requested.

## Validation plan

Pin both approved packages exactly; adapt only if compilation/tests require it.
Keep production loopback guards and eval-only secondary isolation unchanged.
Add a fake-fetch wire regression test using fixture credentials, with no actual
socket, DB, Strata, eval or LLM e2e request. Run typecheck, existing unit tests,
integration excluding the LLM e2e by name, and npm audit. Same-day model quality,
token comparisons and Antigravity review remain coordinator gates.
