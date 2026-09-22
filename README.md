# Figure Chess

A board-first, casual Xiangqi prototype built with Next.js, React, and strict TypeScript.

## Run locally

Use Node 22 or later and npm 11.9.0.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Development automatically initializes embedded Postgres in `.local-db/`. CPU and same-device play need no account. Create two distinct username/password accounts in separate browser profiles to try invitations or the casual 10+5 queue. There is no password recovery; use unique test passwords.

## Included

- Owned Xiangqi rules core shared by the board, CPU, and authoritative online move service.
- Three bounded CPU levels in a browser worker, same-device play, board flip, Chinese/English labels, tap/keyboard/drag input, local resume, move journal, and replay.
- Accounts and hashed sessions, private invitations, casual matchmaking, clocks, draw/resign actions, persisted moves, and private history.
- Versioned/idempotent commands and Postgres transactions; Elo infrastructure with rated play hard-disabled.
- Rules/help, responsive layout, Vercel build configuration, and compact PR checks.

## Rules boundary

The versioned ruleset is `xiangqi-casual-v1`, **not certified WXF competition rules**. It enforces piece movement, horse legs, elephant eyes/river boundaries, cannon screens, palace limits, flying generals, self-check, checkmate, stalemate loss, and unilateral perpetual check. Other third repetitions and 120 non-capture plies stop for review, without a result or rating. Full chase/no-progress conformance is required before rated play.

Fairy-Stockfish (`ffish` 0.7.10, GPLv3) is a development-only independent legal-move oracle. It is not imported by the shipped application; runtime rules/CPU are owned TypeScript implementations. Legal-move agreement does not prove competition adjudication.

## Verification

```bash
npm run check          # TypeScript, ESLint, compact Vitest suite
npm run test:rules     # Rules/CPU/rating fixtures and independent legal-move comparison
npm run test:services  # Embedded Postgres auth/game/persistence checks
npm run build         # Production compilation and route generation
npx playwright install chromium
npm run test:browser   # Focused CPU/mobile and two-account online journeys
```

Service tests use disposable PGlite, not hosted multi-connection Postgres. They do not prove hosted lock contention, Supabase policies, or production service integration. Browser tests use a separate temporary local database and no hosted credentials.

## Vercel and hosted database

The app explicitly selects the Next.js framework. A Git-linked Vercel project can build the implementation branch as a preview. This repository does not itself prove a deployment is live or that required checks gate promotion.

Without `DATABASE_URL`, a Vercel preview enables guest CPU/local play only and displays that accounts/online play are unavailable. It never falls back to an ephemeral local database on Vercel.

For online play, provision an isolated preview Postgres database, configure its pooled `DATABASE_URL` as a **server-only** environment variable, and apply the migration explicitly:

```bash
npm run db:migrate
```

The migration command reads `.env.local` when present. See `.env.example`. Do not point preview tests or migrations at production. Use a dedicated database without public browser/Data API exposure; the migration's `PUBLIC` revocations are not a complete Supabase role/RLS policy. Review existing role grants before hosted rollout.

Polling reconciles game snapshots every 1.5 seconds. Participant requests settle expired clocks. An optional POST `/api/maintenance` sweep requires matching `Origin` and `Authorization: Bearer <CRON_SECRET>` (at least 32 characters); scheduling is not provisioned. Results use persisted deadlines even when settlement is delayed. Public launch still needs recoverable managed auth, multi-connection concurrency checks, timeout maintenance, and operational safeguards.

Original static landing-page files are retained as legacy assets; Next.js is the active application.

## Engineering documents

- [Implementation status and release gaps](docs/IMPLEMENTATION_STATUS.md)
- [Prototype decisions](docs/decisions/001-prototype-boundaries.md)

- [Technical plan](docs/TECHNICAL_PLAN.md)
- [Research and sources](docs/RESEARCH.md)
- [Lightweight PR evaluation](docs/PR_EVALUATION.md)
- [Agent development instructions](AGENTS.md)

The production plan is a target, not a claim that all milestones have shipped.
