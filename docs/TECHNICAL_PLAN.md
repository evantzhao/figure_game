# Figure Chess: technical delivery plan

Date: 2026-09-22
State: proposed implementation plan; this change adds no application code.
Product goal: a fast Xiangqi website with CPU practice, live human games, accounts, history, and Elo matchmaking, deployed on Vercel.

## 1. Verified starting point and scope

The connected GitHub repository evantzhao/figure_game was empty at initial inspection. During research, another change added a static landing page at commit cfaf220 (README.md, index.html, styles.css, script.js, and vercel.json). This planning branch is based on that commit and preserves its runtime files. The landing page displays decorative Western chess pieces; P2 replaces that concept with a playable Xiangqi board. GitHub access includes push permission. Vercel account access is verified, but no figure_game project/deployment appeared in the team project listing at the last check. This plan does not modify tablegames. No Supabase project, production credentials, or SMTP configuration has been verified.

Ship a focused first release: responsive board; rules/help; CPU practice; email accounts; friend challenges; live timed games; one rated rapid queue; profile/history/replay; a small leaderboard. Guests can practice against CPU. An account is required for online human games and server-backed history.

Proposed launch defaults: English interface, Chinese-character pieces with an optional labeled/international set; system light/dark theme; a primary 10+5 rapid queue; private friend games with custom casual time controls. Red moves first. No bullet launch. Split rating pools only after queue activity supports them.

Later: puzzles, analysis, opening explorer, studies, spectators, tournaments, social features, stronger hosted bots, and additional time-control pools. Chat, payments, native mobile apps, and claims of automated cheat detection are outside the first release.

## 2. Recommended stack and alternatives

| Layer | Choice | Reason and boundary |
| --- | --- | --- |
| Web | Next.js App Router, React, strict TypeScript | Fits Vercel and supports public pages, private account views, and HTTP game commands in one application. Pin supported stable versions at scaffold time. |
| UI | Tailwind CSS, accessible Radix/shadcn primitives, custom SVG board | Own the board interaction model; reuse dialog/menu/form accessibility primitives. SVG handles a 9-by-10 intersection board without a heavyweight game renderer. |
| Accounts | Supabase Auth | Email/password with verified email and recovery initially. Google sign-in can follow after provider setup. |
| Persistence | Supabase Postgres; Drizzle and a pooled Postgres driver on the server | Relational constraints and transactions suit game history, queues, and rating accounting. SQL migrations remain explicit. |
| Live updates | Supabase private Realtime Broadcast | Committed database events reach both players; reconnection always reconciles against durable state. |
| Rules | Framework-independent rules adapter; evaluate pinned ffish.js/WASM first | Prove legality, repetition behavior, server compatibility, and licensing before adopting. The UI never imports engine-specific objects. |
| CPU | Fairy-Stockfish WASM in a Web Worker, contingent on the engine spike | Lazy-load for practice. Bounded time per move and cancellation keep phones responsive. |
| Checks | Vitest, selected Playwright scenarios, GitHub Actions | Small behavior-focused suites selected by changed subsystem. |
| Hosting | Vercel Git integration | Branch previews and production from main, with explicit release gates. |

Supabase combines three needed capabilities and avoids assembling a separate identity provider, database, and message broker at launch. Drizzle is server-only and should not duplicate a second migration system: use reviewed SQL migrations as the canonical history and generated types for consumers.

A custom long-running game server or Durable Objects could become attractive for very large concurrency or subsecond competitive controls, but increases operational scope now. Vercel WebSockets entered public beta in June 2026; the choice of Supabase is about operating simplicity, not an assertion that Vercel cannot serve sockets. [R6]

Lichess itself uses a broader architecture; reproducing its entire infrastructure is unnecessary for this product. A single modular application is the right starting point.

## 3. UX and routes

Design direction: compact navigation, warm neutral board, dark ink and vermilion pieces, restrained accents, and no marketing hero displacing play. Keep color, spacing, typography, board/piece styles, and focus states in a token system.

| Route | User outcome |
| --- | --- |
| / | Choose quick match, challenge a friend, or practice with CPU; show real queue state. |
| /practice | Start CPU game, choose side/difficulty, restart, and use optional learning hints. |
| /game/[id] | Play with clocks, moves, connection status, resign/draw actions, and a clear result. |
| /login and /signup | Create/recover a verified account; return to the intended route safely. |
| /u/[username] | View public rating, record, and paginated public game history. |
| /games | View own games with result/opponent/date/mode filters and replay. |
| /leaderboard | View eligible human ratings with provisional status explained. |
| /learn | Learn pieces and special rules using small interactive examples. |
| /settings | Piece set, theme, sound, motion, and account/privacy controls. |

Desktop game layout: board as the dominant element, player clocks adjacent, move list and actions in a side panel. Mobile: opponent/clock, board, self/clock, compact actions; move list below or in a drawer. Avoid scrolling to make a move. Size intersection hit targets to available spacing and supply a zoom/enlarged-board option on narrow screens.

Support tap-source/tap-destination, pointer drag, keyboard navigation, flip board, last-move markers, check indication, sound toggle, reduced motion, and explanatory illegal-move feedback. Pending moves must be visibly pending until acknowledged. Do not silently autoqueue against a bot when human matching is empty.

Account history should include result reason, both ratings before/after, time control, timestamps, side, mode, and replayable moves. CPU games are marked practice and never included in competitive rankings.

## 4. Rules and engine acceptance

The basic model uses 90 intersections and 16 pieces per side. General/advisor palace restrictions, elephant river/eye restrictions, blocked horse legs, cannon capture screens, forward/sideways soldier movement, flying generals, and self-check must be implemented. Stalemate is a loss. These differences make a standard Western chess library unsuitable. [R3]

Proposed competitive ruleset identifier: wxf-2018-online-v1. Use the published WXF manual as the target and record online adaptations such as clock start, disconnection handling, and automated claims. Repetition is history-dependent; a FEN snapshot alone cannot adjudicate perpetual checking or chasing. Do not use an unconditional threefold draw. [R4]

The first implementation milestone includes an explicit engine spike:

1. Pin candidate engine and binding commits/versions. Verify WASM loading in a Node Vercel function and a single-thread browser worker on iOS Safari.
2. Audit legal moves, FEN/move encodings, terminal positions, history-dependent adjudication, and deterministic behavior. Compare independently specified fixtures, not only two wrappers around the same engine.
3. Create a documented conformance matrix for movement, stalemate, perpetual check, chase categories/exemptions, and no-progress rules. Translate the precise WXF move-count/reset/claim semantics into fixtures before rating is enabled. Do not assume Western fifty-move semantics.
4. Check source/binary/model/piece-asset licenses and exact build reproducibility. Fairy-Stockfish is GPLv3; a worker boundary alone does not settle application license obligations. Record the intended distribution model and compatible application licensing before bundling it. [R5]
5. Reject adoption if key behavior is missing. Fallback: an owned TypeScript rules core with an independently validated adjudicator and a bounded alpha-beta practice engine. This adds work; do not silently ship weaker rules under the same ruleset name.

The RulesEngine boundary exposes parse/serialize, legal moves, apply move, check state, and adjudicate with history. The CpuEngine boundary exposes cancellable best-move search with explicit time/strength budgets. This allows stronger engines later without rewriting UI, persistence, or matchmaking.

During casual beta, any deliberately simplified rule policy must have a distinct visible ruleset. Full target conformance is a release gate for rated play. Existing games remain pinned to their engine/ruleset versions; do not swap adjudication underneath an active game.

## 5. Modular application structure

Start with one deployable Next.js application; introduce workspaces only when a second consumer exists.

| Location | Responsibility |
| --- | --- |
| src/app | Pages, route handlers, layouts, and composition. |
| src/features/board | Rendering, coordinates, input, accessible labels, and board preferences. |
| src/features/games | Gameplay views, client state reducer, pending commands, and replay. |
| src/features/accounts | Profile/account forms and user-facing history. |
| src/domain/xiangqi | Pure types, rules contracts, notation, and ruleset policies. |
| src/domain/ratings | Elo policy and versioned rating calculations. |
| src/domain/clocks | Pure time arithmetic and time-control policies. |
| src/server/services | Submit move, accept challenge, match queue, finish game, and save practice. |
| src/server/adapters | Auth, SQL persistence, engine, rate limiting, and realtime integration. |
| src/workers | Browser CPU search with cancellation and engine asset loading. |
| db/migrations | Canonical reviewed SQL schema, indexes, roles, policies, functions, and triggers. |
| tests/fixtures | Compact positions, histories, clocks, and deterministic test users. |

Use validated command/event schemas and discriminated unions for domain outcomes. Avoid a generic game framework until a real second game is requested. Restrict server imports through lint rules and server-only boundaries.

## 6. Durable state and schema

| Entity | Main fields / constraints |
| --- | --- |
| profiles | auth user ID, case-insensitive unique username, display name, timestamps; no email in public profile. |
| preferences | user ID, theme, piece set, language, sound, motion; owner-only writes. |
| games | IDs, players, mode, status, ruleset/engine versions, initial/current FEN, turn, version, remaining milliseconds, turn start/deadline, result/reason, timestamps. |
| moves | game ID + ply unique, actor, canonical move, resulting FEN/hash, clock state, server timestamp; append-only. |
| game_events | game ID + sequence unique, schema version, event type, public payload; durable replay/reconnect history. |
| command_receipts | actor + command ID unique, payload hash, resulting version and response; replay returns the same result; key reuse with different payload is rejected. |
| queue_tickets | one live ticket per user, pool, rating snapshot, creation/heartbeat/expiry, claim state. |
| challenges | hashed random token, creator, opponent constraint if any, options, expiry, acceptance result; accepted once. |
| active_players | user ID unique, game ID; prevents simultaneous rated games and cross-queue double pairing. |
| ratings | user ID + pool unique, current value, games count, algorithm version. |
| rating_events | game ID + user ID unique, before/after/delta, policy version; append-only. |
| practice_sessions | owner, CPU settings, replay, client-reported outcome flag; isolated from competitive tables. |
| moderation_events | restricted actor/action/reason and account/game reference for report review and rating corrections. |

Use UUIDs or equivalent unguessable IDs and foreign keys. Index history by participant/date, moves by game/ply, queue by pool/expiry/creation, and active games by deadline. Keep snapshots for fast resume and append-only histories for auditing. Bound command/event retention and paginate all history APIs.

A separate public projection exposes allowed profile/game fields. Live games are participant-only at launch; completed human games can be public under a disclosed policy. Practice is private by default. Account deletion removes private account data and pseudonymizes retained competitive records according to the published retention policy.

## 7. Authoritative move and clock protocol

Commands use authenticated POST endpoints and contain command ID, game ID, expected version, and source/destination. Never accept a client-supplied actor, resulting position, winner, rating delta, or elapsed time.

A submit-move service opens a short database transaction, serializes on the game row, checks command deduplication, verifies participant/turn/version/status, obtains database time, checks deadline, and validates the move against the locked state and required history. It then persists the move, snapshot, clocks, ordered event, command receipt, and any terminal/rating changes together. No network engine call runs inside this transaction. Engine initialization occurs beforehand.

The selected clock policy charges elapsed database time through command validation/acceptance. Clients interpolate for display using server timestamps and measured offset. They cannot pause clocks or add lag credit. Benchmark this policy before adding faster pools; future compensation must use a separate documented server-side policy.

After a legal nonterminal move, add the increment to the moving side and set the opponent deadline. Check expiry before increment. A database trigger publishes a sanitized committed event through Realtime; the durable event log remains the recovery source. Do not publish full rows with private fields.

Duplicate command: return original receipt. Conflicting version: return 409 and current version/snapshot. Illegal move: structured reason, no state change. Expired deadline: adjudicate timeout through the same serialized terminal path. Time equality is defined as expired.

Reconnect: subscribe and buffer events, fetch snapshot plus latest sequence, discard older buffered events, apply only contiguous later events, and refetch on gaps. Repeat on visibility restore and detected disconnect. Presence affects the connection indicator only.

Clients call the timeout endpoint when a displayed clock expires; the server independently checks the deadline. Also run a small indexed Supabase Cron sweep, proposed every 5 seconds, to settle games when both players vanish. A late sweep does not change the winner: the stored deadline determines eligibility. Do not rely on Vercel Hobby cron for live clock settlement. [R8]

Game lifecycle: waiting -> active -> finished, or waiting -> aborted. The proposed first-move acceptance window aborts unstarted games without rating; after activation, disconnect does not stop the clock. Resign, draw acceptance, move, and timeout share one idempotent terminal transition. Clear active-player slots and apply ratings exactly once.

## 8. Multiplayer and matchmaking

Friend links use high-entropy tokens, expiry, atomic acceptance, and signed-in seats. Never permit joining one's own challenge. Offer draw, resign, and rematch; takebacks can be added only to casual games.

Start with one 10+5 rated rapid pool, and clearly separate casual friend games. Enqueue and heartbeat requests perform opportunistic matching. Candidate selection is oldest compatible first, with row locks and atomic ticket claims. Revalidate eligibility, rating, active-player slots, and ticket lease inside the transaction.

Proposed rating search band: +/-100 initially, widen by 50 every 10 seconds, cap at +/-400. Both players' bands must admit the pairing. Queue tickets expire after 30 seconds without a heartbeat; a visible queued page refreshes every 10 seconds. On waking a suspended tab, reconcile before rejoining. Widening advances through heartbeats even when no new user joins.

Lock player rows in stable ID order; atomic unique active-player slots prevent multiple concurrent matchers from seating a player twice. Cancellation racing with matching returns either confirmed cancellation or the committed game ID. Randomize colors with a bounded preference for balancing recent assignments.

Provide wait/cancel/friend/CPU choices when the queue is sparse. Never manufacture online-player counts or present bots as humans.

## 9. Elo and ranking

Use literal Elo v1 initially because the requested feature is Elo and its accounting is easy to audit. Proposed initial rating 1500 and constant K=32. Mark the first 10 rated games provisional without changing K. Expected score for A is 1 / (1 + 10^((Rb-Ra)/400)); actual score is 1, 0.5, or 0. Compute a single signed delta for A from pregame ratings, round deterministically, and use its exact negative for B.

Keep both players' updates and immutable rating events in the terminal transaction, locking ratings in stable user order. Eligible results are completed server-authoritative human games in the rated queue. Abort, CPU, imports, casual play, and invalidated games do not directly produce normal Elo updates.

Initially require 10 rated games and activity within 30 days for leaderboard inclusion; these are product defaults, not federation ratings. Record algorithm version and pregame ratings for audit. This is a local player pool, not transferable FIDE or WXF Elo.

Lichess actually uses Glicko-2. It is a sensible future option for uncertainty and inactivity, but should be introduced through a versioned migration, not silently substituted for Elo. [R2] Block/report controls and repeat-opponent abuse signals should ship with rated beta. Do not equate an engine-like move with proof of cheating.

## 10. CPU, accounts, and history trust

CPU runs in a lazy-loaded single-thread Web Worker for the first release; no LLM is needed. Choose levels via measured search time/strength controls, not claimed human Elo. Cancel stale searches on restart/navigation, verify each returned move, and handle loading/memory failure with a visible retry.

Browser CPU sessions are locally resumable. Signed-in users can save a bounded replay; the server checks replay legality before storing it as client-reported practice. A modified browser can fabricate practice outcomes, so practice never grants competitive rating or official achievements. Guest practice remains device-local unless explicitly imported after sign-in.

Use verified-email signup, password recovery, secure session refresh, unique usernames, and owner-only preferences. Configure production email delivery before public signup. Auth callbacks accept allowlisted redirects and preview environments use their own callback/database configuration.

SSR pages verify server identity; a client session indicator does not authorize operations. Rate-limit signup, game creation, moves, queue heartbeats, and replay uploads using shared storage and bounded request sizes.

## 11. Security, operations, deployment

RLS protects browser-accessible data. Competitive writes are server-only. Database mutation access uses a restricted application role, not a blanket client-facing admin key. If a privileged role is unavoidable for an adapter, isolate it and document all bypassed policies. RPC execute grants must deny public mutation shortcuts. Private Realtime read membership is limited to participants; clients cannot insert authoritative broadcasts. [R7]

Use origin checks for cookie-authenticated mutations, validated identifiers, safe HTML handling, and no shared-cache storage of personalized responses. Keep service secrets out of NEXT_PUBLIC variables. Record request/game IDs and error codes without tokens or emails.

Environments: isolated local development, a preview Supabase project (or supported per-branch databases), and production. Preview migrations must never touch production. Configure auth redirect allowlists, DB pooling, regions close to users, engine static asset cache headers, CSP, and private cache policies.

Deployment sequence: link only figure_game to Vercel; configure scoped environment variables; apply backward-compatible migrations through one protected release job; verify migration state; deploy code; run a short real-service smoke; enable multiplayer/rated flags progressively. Do not use application build hooks to migrate production.

Use expand/contract migrations so the previous application version remains safe to restore. Roll back application releases via Vercel; fix schema forward unless a reviewed reversible migration is proven safe. Protect main from merging failed checks. Ensure production deployment waits for required checks or an explicit gated promotion; default Git auto-deploy alone is not a test gate.

Track move acknowledgment latency, version conflicts, illegal-move rejections, reconnect recovery, queue wait, transaction contention, timeout-sweeper lag, auth failures, and engine worker failures. Add a small health endpoint without exposing private state. Use database constraints for correctness; alerts do not replace them.

Initial targets (to measure, not claims): under 100 ms local board feedback; under 500 ms p95 move acknowledgment for regional users in a warm service; normal PR feedback under 5 minutes; focused larger database/browser checks under 8 minutes. Test a modest 20-game concurrent session before rated beta, then size limits from observed performance.

Do not promise a zero-cost public service. Verify current quotas/plan eligibility before provisioning. Major cost drivers are realtime connections/messages, database compute/storage, function requests, email, backups, and preview databases. Set budget alerts and explicit concurrency/rate caps; upgrade only when an observed limit justifies it. Exact provider prices are intentionally not fixed in this plan.

## 12. Delivery milestones and acceptance gates

| Milestone | Work | Done when |
| --- | --- | --- |
| P0: planning foundation | Research, technical plan, AGENTS.md, PR evaluation contract/template | Documents reviewed; implementation has not begun. |
| P1: foundation + engine spike | Preserve useful landing-page design/security headers while migrating to Next; pin tools; rules/CPU/license feasibility; domain contracts; small CI base | Production build passes; candidate runs in server and phone browser; rule gaps and license decision documented. |
| P2: playable practice | Board, pieces, input, basic rules/help, worker CPU, replay, responsive shell | Complete CPU game and replay work on desktop and mobile Safari; stale worker results cannot change a new game; deploy playable Vercel preview. |
| P3: accounts + persistence | Auth, profiles, schema/RLS, private practice history, replay filters | Sign up/sign in/recover; cross-account access denied; saved game resumes/replays after reload. |
| P4: live casual games | Challenges, authoritative commands/clocks, realtime/reconnect, draw/resign/rematch, timeout sweep | Two separate sessions complete a game; duplicate requests, disconnect, and timeout/resign races produce one result. |
| P5: rated beta | Full declared rules conformance, matchmaking, Elo/leaderboard, report/block, rate limits | Atomic pairing and exactly-once rating tests pass; no unsupported rules; modest concurrency exercise passes. |
| P6: production launch | Real service setup, email, migration/release gate, restore rehearsal, mobile/performance pass, monitoring | Public URL verified with real accounts and two-client play; checks/rules/version recorded; backups and rollback verified. |

Each milestone should be one or a few small PRs with independent evidence. Estimated effort should be set after P1 because engine adjudication and licensing can materially change the scope. The current deliverable is P0; do not describe the application as deployed.

## 13. Initial decisions to revisit only when evidence changes

- One application, one database provider, one rated queue.
- Server-authoritative human play; local unrated CPU.
- Literal Elo v1 with versioned future rating strategies.
- WXF-based declared rules with a hard conformance gate.
- No custom socket infrastructure at launch.
- No runtime/framework/library version guesses: verify and pin at scaffold time.
- Default visual direction and time control are reversible product decisions.
- Account/service provisioning, license selection, engine conformance, and verified production email remain implementation prerequisites.

Sources R1-R8 are in docs/RESEARCH.md. The lightweight validation policy is in docs/PR_EVALUATION.md.
