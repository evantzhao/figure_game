# Prototype boundaries (2026-09-22)

The user authorized the whole prototype in one pass, with rules correctness first.

- Use an owned TypeScript rules core and bounded worker CPU. Fairy-Stockfish is a development-only differential oracle, not a shipped runtime or copied implementation. This avoids making an unreviewed GPL distribution/license decision.
- Standard piece movement, check, checkmate, stalemate, and unilateral perpetual check are enforced. Third repetition requiring chase classification and 120 non-capture plies end in **review required**, with no winner/rating. These are explicitly casual prototype policies, not WXF certification. Rated availability is a hard false constant until conformance is complete; Elo arithmetic and casual queue behavior have focused tests, while exactly-once rated transaction accounting remains unverified.
- Use server-only Postgres with parameterized SQL, rather than Drizzle for this small schema. Local development uses PGlite's real Postgres engine and persistent local files; Vercel requires DATABASE_URL and never falls back to ephemeral local data. Explicit migrations are used on hosted databases.
- Prototype accounts use usernames, scrypt password hashes, and random opaque cookie sessions stored only as hashes. No email is collected and password recovery/verification is not offered. This permits a complete local account/history/multiplayer journey without a connected identity provider. Replacing the auth adapter with Supabase remains the recommended public-launch path.
- Use versioned authoritative snapshots with short polling (1.5 seconds during online play, paused when hidden) instead of an unprovisioned Realtime subscription. Commands and locks remain database-authoritative. Polling is suitable for prototype rapid games, not bullet or a high-concurrency production launch.
- All queues/challenges are casual until rated conformance passes. Ratings are not fabricated from local or CPU games.
