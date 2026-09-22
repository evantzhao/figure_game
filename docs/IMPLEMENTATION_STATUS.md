# Prototype implementation status

Date: 2026-09-22. This is a casual prototype for review, not a production or rated release.

## Implemented

- Next.js/TypeScript application with a responsive Xiangqi board, tap/keyboard/drag controls, Chinese/English pieces, board flip, move journal, replay, and learning pages.
- Shared owned legal-move engine, worker-based CPU with three bounded levels, same-device play, and local practice persistence.
- Username/password registration/login, scrypt hashes, opaque hashed sessions, same-origin mutation checks, and database-backed rate limits.
- Postgres schema and services for private invitations, casual 10+5 matching, participant-only games, server clocks, legal moves, idempotent command receipts, draw/resign/cancel, and history.
- Elo arithmetic/finalization scaffolding and leaderboard page. Rated creation is deliberately unavailable.
- Explicit Next.js Vercel configuration. Missing hosted database configuration disables online functions while retaining guest practice.
- Compact GitHub Actions workflow with docs-only skipping, static checks, the small full test suite, and a production build. Browser checks are a separate manual command.

## Validation actually run

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 63 tests passed across 3 files; final run 22.14 seconds |
| `npm run build` | Passed; production routes generated |
| `git diff --check` | Passed before commit |
| `npm run test:browser` | Blocked before page launch: initially missing Chromium; retry with installed full Chromium failed because this environment denies its `socket()` operation |
| `npx playwright install chromium` | Full Chromium installed after a retry; headless-shell archive downloads failed. No browser verification claimed |

The 50 standalone fixtures cover the seven pieces, blockers, palace/river boundaries, flying generals, self-check, mate/stalemate, serialization/replay, conservative repetition handling, CPU legality, and Elo arithmetic. The independent `ffish` test compares exact legal move sets and check flags over at least 650 deterministic reachable positions (12 games, up to 60 plies each). Its generic 1–10 rank notation is explicitly converted to the app's 0–9 notation.

The 12 service tests use an isolated in-memory PGlite database with the actual SQL migration. They cover auth/session revocation, rate-limit persistence, participant authorization, illegal/wrong-turn moves, duplicate/payload-conflicting commands, competing same-version moves, increments, timeout-before-action, terminal resignation/no casual ratings, draw authorization, pairing/rated gating, challenge cancellation, and owner-only legal practice history.

PGlite serializes embedded transactions; these tests are **not** proof of multi-connection hosted lock behavior. Persisted command timestamps are compared at the JSON wire boundary, because Postgres dates and stored JSON strings have different in-process representations.

Two Playwright journeys are included but not verified here: guest CPU/replay/mobile bounds, and two-account invitation/moves/reload/resignation/history. Install Chromium, build, then run `npm run test:browser`. Its production server uses a fresh temporary local database, never a hosted connection. Actual iOS Safari remains untested.

## Release gaps

1. Full WXF perpetual-chase and no-progress conformance is incomplete. `xiangqi-casual-v1` stops ambiguous repetition/non-capture-limit positions for review; there is no review moderation UI. Do not enable rated play by simply changing the constant.
2. Hosted database/service provisioning, managed auth/recovery, private realtime, and production email are not done. Prototype auth and polling intentionally differ from the production plan; see the decision record.
3. Multi-connection pairing/terminal races, exactly-once rated accounting, hosted grants/RLS, real-service two-client play, and load tests remain release gates. Server-only `PUBLIC` revocations alone do not verify existing provider-role grants.
4. Clock acceptance samples database time before move validation (not after it); benchmark/refine before faster or rated controls. Disconnect never pauses time. Timeout sweep exists but has no provisioned scheduler; inactive games settle on a later request.
5. Public profiles, account deletion/recovery, moderation/block/report, advanced preferences, and production observability/backup/rollback rehearsal are not complete.
6. No claim of a verified live preview/production deployment or passing remote CI is made by this document. Opening the PR does not establish those outcomes.

## Rollback

Revert the implementation commit to restore the legacy static application and its Vercel configuration. Do not drop database tables as part of application rollback. This migration creates prototype tables only; hosted migration/promotion requires explicit environment review and must not target production from an untrusted PR.
