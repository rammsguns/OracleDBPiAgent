# WP-AB browser validation

Adds Playwright 1.64.1 (exact dev dependency), `npm run test:browser`, and a
headless Chromium configuration with one worker and no retries. Global setup
starts the real loopback web server on a random port with an injected fake
agent, stubbed health/provider factories, a temporary session-scoped JSONL audit
file, and an explicit test clock. A separate loopback test-control listener
advances that clock for deterministic session expiry and exposes abort counters.
The token URL stays in process memory. No fake test reads passwords or API keys,
opens Oracle connections, or calls Strata.

The nine default browser tests cover fragment-token removal and authentication,
API-driven target options and replacement sessions, incremental/final answers,
running/success/error tool traces, Stop and server-side abort, concurrent 409 and
busy UI, actual server session expiry/recovery, filtered session audit, health
refresh/status, literal hostile text and CSP/dialog checks, and phone typing and
submission at 390×844. The phone test includes a populated audit table.

Product bug found: the target selector's long option labels produced a roughly
1,589px right edge on a 390px viewport. `src/web/static/app.css` now constrains
selects with `min-width: 0; max-width: 100%`. The browser regression test verifies
that document width stays within the viewport after an answer and audit render.
No server seam or shared contract changes were necessary.

Chromium source: `npx playwright install chromium` downloaded Chrome for Testing
156.0.8078.4, Chromium/headless-shell revision 1248, from Playwright's CDN into
`~/.cache/ms-playwright`. Cached revision 1234 did not match Playwright 1.64.1;
the installer removed that unused revision. No sudo or system dependency install
was used. FFmpeg 1013 is installed by the Chromium installer as a supporting
artifact; Firefox and WebKit were not installed.

Optional live smoke: `PIAGENT_BROWSER_LIVE=1 npx playwright test tests/browser/live.spec.ts`.
It checks Strata `/health` first and skips when unavailable/unloaded, starts the
real `piagent web` CLI, selects d1, and submits exactly one read-only question.
The real server and temporary audit directory are cleaned up afterward. The
coordinator reserved Strata before integration and live validation; these runs
were sequential and the live smoke was invoked exactly once.

Validation on 2026-10-28 (workspace clock):

- `npm run typecheck`: passed.
- Separate strict TypeScript check of browser/config files: passed (the product
  tsconfig intentionally includes only `src`).
- `npm test`: 19 files passed, 346 tests passed (1.40s).
- `npm run test:integration` with `PIAGENT_SECRET_DIR` set to the approved secret
  directory: 5 files passed, 21 tests passed (10.48s). An initial invocation with
  the variable unset skipped all 21 with dependency messages.
- `npm run test:browser`: 9 passed, 1 skipped by default (10.0s).
- Live smoke, once, with the approved secret directory: 1 passed (13.9s); Strata
  was healthy and loaded before the run.
- `git diff --check`: passed.

The initial browser run overlapped the Chromium download and failed to launch
some tests; subsequent runs after installation passed. The phone regression
failed before the CSS fix and passed afterward. Unit and integration scripts
already filter to `tests/unit` and `tests/integration`, respectively; neither
collected browser tests, so no Vitest configuration changes were needed.

Files changed: `package.json`, `package-lock.json`, `playwright.config.ts`,
`tests/browser/fake-server.ts`, `tests/browser/setup.ts`,
`tests/browser/ui.spec.ts`, `tests/browser/live.spec.ts`,
`src/web/static/app.css`, and this report. No outstanding verification gaps,
contract requests, database changes, or Strata configuration changes.
