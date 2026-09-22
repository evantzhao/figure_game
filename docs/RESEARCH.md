# Research notes

Checked 2026-09-22. Findings below distinguish observed products from proposed design. Links are primary product, federation, or vendor sources.

## R1. Interface references

- [Lichess](https://lichess.org/): browser inspection showed a central quick-pairing grid, lobby/correspondence tabs, and nearby friend/computer actions. Adopt the low-friction play entry and restrained chrome. Our initial layout will offer fewer queues because a new service has fewer opponents.
- [PyChess](https://www.pychess.org/): browser inspection showed a lobby table, game/friend/AI actions, variant navigation, and leaderboards. This is the closest functional reference for a Lichess-like regional chess service. Avoid exposing a large variant taxonomy in a Xiangqi-only product.
- [Xiangqi.com](https://www.xiangqi.com/): product-page research confirms human/CPU play and endgame learning across web/mobile. Use it as a category benchmark; its interactive play interface was not inspected in this session.

Proposed visual design is original: neutral surfaces, warm board, vermilion accents, strong contrast, Chinese-character and labeled piece options. These are design recommendations rather than copied assets. No screenshots or third-party assets are committed.

## R2. Ratings

[Lichess FAQ](https://lichess.org/faq) documents Glicko-2, including rating uncertainty and provisional ratings. We propose literal Elo initially to match the requested scope. Glicko-2 remains a future option through an explicit migration; the two systems should not be described as identical.

## R3. Practical Xiangqi rules

[PyChess Xiangqi guide](https://www.pychess.org/variants/xiangqi) explains the board and movement differences:

| Piece/rule | Required behavior |
| --- | --- |
| General | One orthogonal step within palace; opposing generals cannot face along an empty file. |
| Advisor | One diagonal step within palace. |
| Elephant | Two diagonal steps, blocked at midpoint, cannot cross river. |
| Horse | Orthogonal step followed by diagonal step; occupied leg blocks the move. |
| Chariot | Orthogonal sliding move. |
| Cannon | Slides freely without capture; capture requires exactly one intervening screen. |
| Soldier | One forward step; may also move sideways after crossing; never retreats or promotes. |
| Ending | No legal move loses, even when not in check. |
| Repetition | Perpetual check/chase requires adjudication; ordinary chess repetition logic is insufficient. |

These are implementation requirements; competitive edge cases must be resolved against R4.

## R4. Competition-rule target

[World Xiangqi Federation rules page](https://www.wxf-xiangqi.org/index.php?Itemid=291&id=269&lang=en&option=com_content&view=article)

[World Xiangqi Rules, English 2018 PDF](https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf)

The federation manual is the proposed normative basis, with online adaptations documented separately. The manual was located and opened, but this planning pass does not claim a completed conformance audit of its examples. That audit is explicit implementation work before rated release.

[Complete Implementation of WXF Chinese Chess Rules](https://arxiv.org/abs/2412.17334), Daniel Tan and Neftali Watkinson Medina, describes an algorithm covering the manual's 110 examples. This is useful research for the engine spike, not proof that a selected engine implements it.

## R5. Engine candidates

[Fairy-Stockfish repository](https://github.com/fairy-stockfish/Fairy-Stockfish) explicitly supports Xiangqi, documents JavaScript bindings and WASM, and states GPLv3 licensing and matching-source distribution requirements. Its existing search engine is a stronger starting point than building competitive AI from scratch. Engine support does not by itself demonstrate full WXF adjudication.

Before adoption: pin versions; inspect binding/engine licenses; confirm exact build provenance; test iOS worker and Vercel runtime behavior; measure download/memory/search cost; audit adjudication. Keep piece graphics and NNUE model provenance separate. No engine dependency was installed during planning.

## R6. Vercel and realtime

[Vercel WebSocket public beta announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta), June 22, 2026, states that Functions can serve WebSockets on Fluid compute, subject to function limits. Earlier blanket statements that Vercel cannot host WebSockets are outdated.

[Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast) documents database-triggered broadcasts. Proposed use: publish sanitized committed game events, with durable game state and replay in Postgres.

The choice of Supabase is an architecture recommendation, not a vendor requirement.

## R7. Auth and authorization

[Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)

[Postgres row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

These support separate browser/server auth clients, table policies, and private channel permissions. Our design adds explicit game participant checks and denies client writes to authoritative game/rating state. Test both SQL/RPC and realtime access; protecting a page alone is insufficient.

## R8. Clock settlement and deployment

[Supabase Cron](https://supabase.com/docs/guides/cron) supports database job scheduling, including second-based schedules in its documented setup.

[Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) lists Hobby schedule limits unsuitable for live clock settlement. Proposed design uses database deadlines, request-triggered settlement, and a small database sweeper.

[Vercel agent setup](https://vercel.com/get-started.md) was fetched successfully via HTTPS. Existing Vercel guidance and the authenticated connector are available. This does not imply a CLI login or a project deployment.

[Vercel Git integration](https://vercel.com/docs/git) is the intended preview/production delivery path. Required check gating and database release order must be configured explicitly.
