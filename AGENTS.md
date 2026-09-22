# Agent instructions for Figure Chess

## Start here

Read docs/TECHNICAL_PLAN.md, docs/PR_EVALUATION.md, and the nearest scoped AGENTS.md before editing. Inspect the actual repository and git status; preserve unrelated changes. The current baseline is a static landing page with planning documents; the Xiangqi application and its test tooling are not implemented. Planned commands, architecture, and CI are proposals until implemented; never report them as available or passing.

Implement one coherent milestone at a time. Briefly describe the intended change and its acceptance criteria before application code. Record substantive architecture departures in a short decision record under docs/decisions. Keep the technical plan current when a milestone ships. Do not add services or broad abstractions without a concrete need.

## Architecture and code quality

- Use strict TypeScript, explicit domain types, and runtime validation at every external boundary. Do not suppress errors with any, unchecked casts, or broad catch-and-ignore blocks.
- Keep rules, clock arithmetic, and rating calculations deterministic and independent of React, Next.js, Supabase, and wall-clock access. Inject time, randomness, and persistence.
- Keep route handlers thin. Application services own use cases; adapters own database, auth, realtime, and engine integration.
- Use named modules with a single purpose. Prefer composition and plain functions. Extract only abstractions justified by real callers.
- Treat SQL migrations as reviewed source. Commit generated database types and lockfiles when they change. Pin the runtime/package-manager versions during scaffolding.
- Separate board coordinates and piece identities from their rendering and translated labels.
- Version rulesets, rating policies, API events, and saved game formats. Existing games retain their original semantics.
- Do not copy Lichess or PyChess code, branding, images, or piece sets without checking the exact license. Engine source and binary provenance must be recorded before shipping.

## Gameplay invariants

The server is authoritative for online moves, clocks, participants, results, and ratings. Browser state, messages, and local storage are untrusted. Realtime announces committed state; it never authorizes a move.

All commands have an idempotency key and expected game version. Validate ownership, side to move, legal move, deadline, and terminal status. Transactionally append moves, update snapshots, finalize results, and update both ratings. Duplicate commands and competing terminal events must not create duplicate moves or rating changes.

Use database-backed serialization and authoritative time, never process-local locks or timers for correctness. Reconnect from persisted state and ordered events. Never infer resignation from a dropped socket.

Do not enable rated play while the declared repetition/chase/no-progress rules are incomplete. Do not advertise full WXF compatibility without the documented conformance evidence. CPU and imported games cannot affect human ratings. Do not expose in-product engine assistance during live human games.

## Security and accounts

Verify sessions on the server. Deny client writes to competitive game state and ratings, and deny client publication of authoritative realtime events. Review RLS, RPC grants, and private-channel membership together. Restrict database roles and keep server credentials outside browser bundles, logs, and git.

Protect mutations with authorization, input limits, origin/CSRF controls as applicable, and shared rate limits. Account IDs come from verified sessions. Keep email/private account data separate from public profiles. Never connect preview deployments or test fixtures to production data.

## UX

Prioritize a responsive board on mobile Safari and desktop, touch selection as well as drag, keyboard operation, readable piece labels, visible focus, and clear reconnect/pending/error states. No interaction may rely only on color. Keep clocks and whose-turn status visible. Test the changed user journey, including failure states.

## Verification and delivery

Use docs/PR_EVALUATION.md to choose the smallest meaningful checks for changed behavior. Run cheap static checks once and affected tests; broaden only for a concrete risk or required gate. Never add snapshots of entire pages or tests that simply repeat implementation details.

Rules, auth, transaction concurrency, clocks, and ratings require behavior tests. Reversible copy/style changes normally do not need new automated tests. Use deterministic fixtures and fake clocks for timing logic; use a real isolated database for transactions and RLS.

Every PR explains the problem, changed behavior, evidence, untested limitations, and rollback. Report exact checks actually run. Never claim a preview, production deployment, migration, or service connection succeeded without verifying it. Do not weaken branch gates to make a change pass.
