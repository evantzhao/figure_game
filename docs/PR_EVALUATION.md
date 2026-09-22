# Lightweight PR evaluation

Status: specification to implement during P1, not an existing CI system.

## Principles and budget

Run checks that can catch a regression in the changed behavior. Use small deterministic fixtures and a real database only when database behavior matters. Keep normal feedback below 5 minutes and focused integration/browser runs below 8 minutes as targets. Measure actual runtime before promising them.

Do not aim at an arbitrary coverage percentage or multiply every test across every browser. A hundred tiny rules fixtures can be cheaper and more valuable than a single brittle end-to-end journey.

## Change-to-check mapping

| Changed surface | Required evidence |
| --- | --- |
| Documentation only | Diff/format/link review; no application build or browser tests. |
| Copy or styling | Type/lint if relevant; inspect affected desktop/mobile views; no new tests unless behavior changed. |
| Board/input/accessibility | Type/lint; affected interaction tests; one targeted Playwright journey; screenshot at desktop and narrow mobile widths. |
| Rules/notation/engine | Entire compact rules fixture suite, including all adjudication fixtures; replay/serialization properties with fixed seeds; one short CPU or board smoke. |
| Clock/game service | Fake-clock boundaries plus real database duplicate-command, stale-version, and terminal-race tests. |
| Matchmaking/ratings | Pure rating fixtures plus concurrent pairing, cancel/claim race, single-active-game, and exactly-once rating transaction tests. |
| Auth/RLS/RPC/realtime policy | Two-user authorization matrix against isolated services; cross-user writes/reads and forged broadcasts denied; targeted login/reconnect browser test. |
| Schema/migrations | Apply from empty and previous release on disposable DB; check generated types and touched authorization/transaction behavior. |
| Framework/build/lockfile/shared contracts/CI selector | Full compact suite and production build; expand affected tests conservatively because dependency impact is broad. |
| Deployment/environment | Preview build, health check, real-service auth/game smoke, and check secret/environment separation. |

Every application-code PR gets typecheck, lint, affected tests, and a production build. Vercel's required preview build may satisfy the build gate; do not rebuild identical artifacts in multiple jobs without a reason. Documentation-only changes skip these workloads.

Selection uses changed paths plus transitive dependency information; core/shared/config changes trigger the full compact suite. Changes to selection itself trigger a full run. Unknown paths default to conservative validation, not a silent skip. One aggregate required status always reports success/failure, including intentional docs-only skips, so branch protection cannot hang on absent checks.

## Minimal regression inventory

1. Rules: initial position; all seven piece types; blocking and river/palace edges; self-check/facing generals; mate/stalemate; pinned examples for every declared repetition/chase/no-progress category; replay/FEN round-trip.
2. Clocks: before/exactly-at/after deadline; increment; first-move policy; reconnect display reconciliation; timeout versus final move.
3. Persistence: duplicate request returns receipt; same key with new payload rejected; two commands at same version yield one move; crash/retry cannot double-finalize.
4. Ratings: equal and unequal ratings, win/draw/loss, inverse deltas, no rating on casual/CPU/abort; finalization retries create one event per player.
5. Queue: two concurrent matchers cannot allocate a player twice; expired ticket ignored; cancel versus claim converges; self-pair denied; widening obeys both users' limits.
6. Authorization: anonymous, player A, player B, unrelated signed-in user, and restricted server actor; test denied table writes, RPC calls, and broadcast injection.
7. Browser: guest starts CPU practice; two authenticated contexts play/reload/reconnect/resign and find matching history; mobile board accepts tap input.

Rules fixtures must include externally reasoned expected outcomes. Reusing the production implementation to calculate expected values is not a correctness test. Add one regression fixture for each real defect fixed.

Use a tiny curated subset for always-on smoke; subsystem changes expand only that subsystem. Full WXF conformance examples remain mandatory for engine/rules changes and rated-release candidates because their runtime should be small.

## CI and release design

P1 adds a frozen-lockfile install with caching, check selector, static job, affected Vitest job, conditional isolated database job, and conditional Playwright job. Pin trusted actions and runtime versions; minimize token permissions. Cancel obsolete runs on the same PR.

Never run untrusted fork code with production or preview secrets. Use ordinary pull_request checks with disposable local fixtures. Trusted preview integration checks are a separate protected path. Do not use pull_request_target to execute arbitrary PR code with credentials.

Browser matrix: Chromium for the affected main journey; WebKit mobile-sized smoke only for board/layout/input changes and release candidates. A release candidate also gets a brief actual iOS Safari check when available; WebKit emulation is not equivalent to an iPhone. Keep screenshots deterministic; review affected views instead of a large pixel-diff suite.

Use a small real-Supabase preview test at multiplayer/rated release to verify hosted auth and Realtime; local mocks cannot prove vendor behavior. Provider cost or access limitations must be recorded rather than silently replacing this evidence.

No nightly exhaustive testing by default. Run a short fixed concurrency scenario before rated launch and after changes to contention-sensitive paths. Broader load/security testing follows measured growth or a concrete regression.

The release job applies only backward-compatible migrations, verifies required checks, and deploys/promotes the intended commit. Configure the Vercel/GitHub relationship so main cannot deploy failing code. Rollback evidence includes compatibility with the prior app version; destructive schema reversal is not the default rollback.

## PR evidence

Use .github/pull_request_template.md. Include changed behavior, selected check category and reason, commands/results, relevant screenshot/preview, database/API compatibility, and rollback. List skipped checks and limitations candidly. No test claims based only on a plan or generated test files.

For P0, review documents, paths, and diff only. There is a static landing page, but no gameplay application, test runner, or implemented CI yet.
