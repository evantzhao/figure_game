# Chinese Chess backlog and acceptance record

Updated 2026-10-02. “Implemented” means in this PR, not necessarily deployed.

| Item | State | Evidence / remaining gate |
| --- | --- | --- |
| Chinese Chess name | Implemented | Header, metadata, footer, CPU label, docs and package name. Existing storage/cookies/repo URLs retained. |
| Friend sharing | Implemented | Native share, clipboard, selectable fallback URL, invitation expiry explanation. |
| Rematch | Implemented | Participant/version checks, mutual consent, color swap, deduplication, active-seat conflict and concurrent acceptance tests. |
| Reconnect | Implemented | Offline/focus/visibility listeners, manual retry, 15s request timeout; server snapshots remain authoritative. |
| Post-game analysis | Implemented | Local worker only, move evaluations, suggested alternatives, progress, cancellation and replay; no analysis persistence/network calls. Lightweight search, not a strong competition engine. |
| Password recovery | Implemented via recovery codes | Password-verified code creation; single-use reset and all-session revocation. Users without a saved code still cannot recover. Verified-email recovery remains a separate auth migration. |
| Account deletion | Implemented | Password/confirmation, active-game guard, private-data removal, session revocation, shared-game anonymization. |
| Automatic timeouts | Enabled in Supabase | Migration applied; named Cron job active every minute; first run succeeded at 2026-10-02 05:20 UTC. Browser execution denied; security advisor clear. |
| Live two-player play | Blocked by deployed configuration | `/api/me` returned 503 on Oct 2. Verify exact Production DATABASE_URL environment and redeployed commit; then signup/invite/moves/reconnect/result/history on the live custom domain. |
| Mobile verification | Browser coverage added | Chromium plus mobile WebKit CI. Actual iPhone Safari touch/audio/background-resume must still be checked on a device. |
| Rated games / leaderboard launch | Blocked by rule conformance | Movement differential and exactly-once rating tests pass; no complete WXF chase/no-progress fixtures. Keep hard gate off. |
| Broader public launch | Pending | Managed email auth, block/report/moderation, backup restore rehearsal, live load/latency evidence and protected deployment gates. |

## Rated conformance gate

Do not convert ambiguous repetitions into draws or silently rename the current casual policy to WXF.

| Area | Current evidence | Missing acceptance |
| --- | --- | --- |
| Piece movement, self-check, stalemate | Independent legal-move differential plus fixtures | Ongoing regression coverage |
| Unilateral perpetual check | Owned rules fixtures | Full manual examples with mixed threats |
| Perpetual chase | Stops for review | Threat classification, exemptions, alternating/mixed obligations, independently sourced examples |
| No-progress | Stops at 120 non-capture plies for review | Published reset/count/claim semantics and independent boundary fixtures |
| Rating finalization | Isolated real-Postgres race test in CI | Complete rules, modest hosted concurrency/latency check, abuse controls |

## Local evidence

- TypeScript, lint, production build and compact suite run for this PR; exact final counts/results are recorded in its description.
- Hosted additive migration version `20261002050221` verified. Cron `chinese-chess-casual-timeouts` is active, and its first run succeeded. No test fixtures were created in the live database.
- Local Chromium download returned invalid/truncated archives. Browser execution is delegated to ordinary GitHub Actions against disposable Postgres, never live credentials.
- WebKit emulation is not physical iOS Safari verification. Audio hardware/autoplay and background suspension require a device check.

## Release / rollback

Apply the additive migration explicitly, enable and verify Cron, merge only after CI passes, then deploy. Production DB access must not be added to PR previews. Revert the application commit to roll back; keep the additive columns so existing accounts and games survive. Disable only the named Cron job with `cron.unschedule` if necessary. Never drop live tables during rollback.
