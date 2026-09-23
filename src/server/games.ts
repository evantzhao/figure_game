import { randomUUID, randomInt } from 'node:crypto';
import { newGame, play, replay, moveUci, toFen, opposite, RULESET, RATED_AVAILABLE, type Color, type GameState, type Move } from '@/domain/xiangqi/rules';
import { elo, ratingBand } from '@/domain/ratings';
import type { Command, OnlineGame, HistoryGame } from '@/domain/contracts';
import { digest, type Account } from './auth';
import { databaseNow, ServiceError, type Database, type Executor } from './db';
type GameRow = Omit<OnlineGame, 'serverNow'>;
const gameSql = 'SELECT g.*,r.username AS red_name,b.username AS black_name FROM games g JOIN accounts r ON r.id=g.red_id LEFT JOIN accounts b ON b.id=g.black_id';
async function loadGame(tx: Executor, id: string, lock = false): Promise<GameRow> {
  const [game] = await tx.query<GameRow>(`${gameSql} WHERE g.id=$1${lock ? ' FOR UPDATE OF g' : ''}`, [id]);
  if (!game) throw new ServiceError(404, 'Game not found.');
  return game;
}
function player(game: GameRow, user: string): Color {
  if (game.red_id === user) return 'red'; if (game.black_id === user) return 'black';
  throw new ServiceError(403, 'Only the two players can access this game.');
}
async function finish(tx: Executor, game: GameRow, winner: Color | null, reason: string, review = false) {
  if (!['active','waiting'].includes(game.status)) return;
  game.status = review ? 'review' : reason === 'cancelled' || reason === 'expired' ? 'aborted' : 'finished';
  game.winner = winner; game.reason = reason; game.version++; game.draw_by = null;
  await tx.query('UPDATE games SET status=$2,winner=$3,reason=$4,version=$5,draw_by=NULL,updated_at=now() WHERE id=$1', [game.id, game.status, winner, reason, game.version]);
  await tx.query('DELETE FROM active_players WHERE game_id=$1', [game.id]);
  if (game.rated && !review && game.status === 'finished' && game.black_id) {
    const users = await tx.query<Account>('SELECT id,username,rating,rated_games FROM accounts WHERE id=$1 OR id=$2 ORDER BY id FOR UPDATE', [game.red_id, game.black_id]);
    const red = users.find(u => u.id === game.red_id)!, black = users.find(u => u.id === game.black_id)!;
    const next = elo(red.rating, black.rating, winner === null ? 0.5 : winner === 'red' ? 1 : 0);
    for (const [user, value] of [[red, next.red], [black, next.black]] as const) {
      await tx.query('INSERT INTO rating_events(game_id,user_id,before_rating,after_rating) VALUES($1,$2,$3,$4)', [game.id, user.id, user.rating, value]);
      await tx.query('UPDATE accounts SET rating=$2,rated_games=rated_games+1 WHERE id=$1', [user.id, value]);
    }
  }
}
async function settle(tx: Executor, game: GameRow, now: number) {
  if (game.status === 'waiting' && now - new Date(game.created_at).getTime() >= 30 * 60 * 1000) await finish(tx, game, null, 'expired');
  if (game.status !== 'active' || game.turn_started === null) return;
  const remaining = game.state.position.turn === 'red' ? game.red_ms : game.black_ms;
  if (now - game.turn_started >= remaining) await finish(tx, game, opposite(game.state.position.turn), 'timeout');
}
async function existing(tx: Executor, user: string): Promise<string | null> {
  const [row] = await tx.query<{ game_id: string }>('SELECT game_id FROM active_players WHERE user_id=$1', [user]);
  if (!row) return null;
  const game = await loadGame(tx, row.game_id, true);
  await settle(tx, game, await databaseNow(tx));
  return ['waiting','active'].includes(game.status) ? game.id : null;
}
async function create(tx: Executor, red: string, black: string | null, now: number): Promise<GameRow> {
  const id = randomUUID();
  // Bind encoded JSON as text before casting: postgres.js otherwise JSON-encodes the string again.
  await tx.query('INSERT INTO games(id,red_id,black_id,status,state,turn_started,ruleset) VALUES($1,$2,$3,$4,$5::text::jsonb,$6,$7)', [id, red, black, black ? 'active' : 'waiting', JSON.stringify(newGame()), black ? now : null, RULESET]);
  await tx.query('INSERT INTO active_players(user_id,game_id) VALUES($1,$2)', [red, id]);
  if (black) await tx.query('INSERT INTO active_players(user_id,game_id) VALUES($1,$2)', [black, id]);
  return loadGame(tx, id);
}
export async function createChallenge(db: Database, user: string): Promise<OnlineGame> {
  return db.transaction(async tx => {
    await tx.query('SELECT id FROM queue_guard WHERE id=1 FOR UPDATE');
    const current = await existing(tx, user);
    const now = await databaseNow(tx);
    if (current) return { ...await loadGame(tx, current), serverNow: now };
    await tx.query('DELETE FROM queue_tickets WHERE user_id=$1', [user]);
    return { ...await create(tx, user, null, now), serverNow: now };
  });
}
export async function joinGame(db: Database, user: string, id: string): Promise<OnlineGame> {
  return db.transaction(async tx => {
    await tx.query('SELECT id FROM queue_guard WHERE id=1 FOR UPDATE');
    const current = await existing(tx, user);
    if (current && current !== id) throw new ServiceError(409, 'Finish or cancel your current game first.');
    const game = await loadGame(tx, id, true), now = await databaseNow(tx);
    await settle(tx, game, now);
    if (game.red_id === user || game.black_id === user) return { ...game, serverNow: now };
    if (game.status !== 'waiting' || game.black_id) throw new ServiceError(409, 'This invitation is no longer available.');
    await tx.query('INSERT INTO active_players(user_id,game_id) VALUES($1,$2)', [user, id]);
    await tx.query('UPDATE games SET black_id=$2,status=\'active\',turn_started=$3,version=version+1,updated_at=now() WHERE id=$1', [id, user, now]);
    await tx.query('DELETE FROM queue_tickets WHERE user_id=$1', [user]);
    return { ...await loadGame(tx, id), serverNow: now };
  });
}
export async function getGame(db: Database, user: string, id: string): Promise<OnlineGame> {
  return db.transaction(async tx => {
    const game = await loadGame(tx, id, true); player(game, user);
    const now = await databaseNow(tx); await settle(tx, game, now);
    return { ...game, serverNow: now };
  });
}
export async function invitation(db: Database, id: string) {
  const [game] = await db.query<{ red_name: string; status: string; created_at: string }>('SELECT a.username AS red_name,g.status,g.created_at FROM games g JOIN accounts a ON a.id=g.red_id WHERE g.id=$1', [id]);
  if (!game || game.status !== 'waiting' || Date.now() - new Date(game.created_at).getTime() >= 1800000) throw new ServiceError(404, 'This invitation is unavailable.');
  return { host: game.red_name };
}
export async function command(db: Database, user: string, id: string, input: Command): Promise<OnlineGame> {
  return db.transaction(async tx => {
    const game = await loadGame(tx, id, true), color = player(game, user);
    const hash = digest(JSON.stringify({ game: id, ...input }));
    const [receipt] = await tx.query<{ payload_hash: string; response: OnlineGame }>('SELECT payload_hash,response FROM commands WHERE user_id=$1 AND command_id=$2', [user, input.commandId]);
    if (receipt) { if (receipt.payload_hash !== hash) throw new ServiceError(409, 'Command ID has already been used for another action.'); return receipt.response; }
    const now = await databaseNow(tx); await settle(tx, game, now);
    if (!['active','waiting'].includes(game.status)) return { ...game, serverNow: now };
    if (game.version !== input.version) throw new ServiceError(409, 'The position changed. Reconnect and try again.');
    if (input.action === 'cancel') {
      if (game.status !== 'waiting' || game.red_id !== user) throw new ServiceError(409, 'Only an unjoined challenge can be cancelled.');
      await finish(tx, game, null, 'cancelled');
    } else {
      if (game.status !== 'active') throw new ServiceError(409, 'Waiting for an opponent.');
      if (input.action === 'resign') await finish(tx, game, opposite(color), 'resignation');
      else if (input.action === 'accept-draw') {
        if (!game.draw_by || game.draw_by === user) throw new ServiceError(409, 'There is no opponent draw offer to accept.');
        await finish(tx, game, null, 'agreement');
      } else if (input.action === 'offer-draw' || input.action === 'decline-draw') {
        game.draw_by = input.action === 'offer-draw' ? user : null; game.version++;
        await tx.query('UPDATE games SET draw_by=$2,version=$3,updated_at=now() WHERE id=$1', [id, game.draw_by, game.version]);
      } else {
        if (game.state.position.turn !== color || !input.move) throw new ServiceError(409, 'It is not your turn.');
        let next: GameState;
        try { next = play(game.state, input.move); } catch (error) { throw new ServiceError(422, error instanceof Error ? error.message : 'Illegal move.'); }
        const elapsed = now - (game.turn_started ?? now);
        if (color === 'red') game.red_ms = Math.max(0, Math.ceil(game.red_ms - elapsed)) + 5000;
        else game.black_ms = Math.max(0, Math.ceil(game.black_ms - elapsed)) + 5000;
        game.state = next; game.version++; game.turn_started = now; game.draw_by = null;
        await tx.query('INSERT INTO moves(game_id,ply,actor_id,move,fen) VALUES($1,$2,$3,$4,$5)', [id, next.moves.length, user, moveUci(input.move), toFen(next.position)]);
        await tx.query('UPDATE games SET state=$2::text::jsonb,version=$3,red_ms=$4,black_ms=$5,turn_started=$6,draw_by=NULL,updated_at=now() WHERE id=$1', [id, JSON.stringify(next), game.version, game.red_ms, game.black_ms, now]);
        if (next.outcome) await finish(tx, game, next.outcome.winner, next.outcome.reason, next.outcome.review);
      }
    }
    const response: OnlineGame = { ...game, serverNow: now };
    await tx.query('INSERT INTO commands(user_id,command_id,payload_hash,response) VALUES($1,$2,$3,$4::text::jsonb)', [user, input.commandId, hash, JSON.stringify(response)]);
    return response;
  });
}
export async function queue(db: Database, user: string, cancel = false, rated = false): Promise<{ gameId: string | null; queued: boolean; since: number | null }> {
  if (rated && !RATED_AVAILABLE) throw new ServiceError(409, 'Rated play is locked until competition-rule verification is complete.');
  return db.transaction(async tx => {
    await tx.query('SELECT id FROM queue_guard WHERE id=1 FOR UPDATE');
    const current = await existing(tx, user);
    if (current) return { gameId: current, queued: false, since: null };
    if (cancel) { await tx.query('DELETE FROM queue_tickets WHERE user_id=$1', [user]); return { gameId: null, queued: false, since: null }; }
    const now = await databaseNow(tx);
    await tx.query('DELETE FROM queue_tickets WHERE heartbeat_ms<$1', [now - 30000]);
    await tx.query('INSERT INTO queue_tickets(user_id,created_ms,heartbeat_ms) VALUES($1,$2,$2) ON CONFLICT(user_id) DO UPDATE SET heartbeat_ms=$2', [user, now]);
    const tickets = await tx.query<{ user_id: string; created_ms: number; rating: number }>('SELECT q.user_id,q.created_ms,a.rating FROM queue_tickets q JOIN accounts a ON a.id=q.user_id ORDER BY q.created_ms');
    const own = tickets.find(t => t.user_id === user)!;
    const opponent = tickets.find(t => t.user_id !== user && Math.abs(t.rating - own.rating) <= Math.min(ratingBand(now-own.created_ms),ratingBand(now-t.created_ms)));
    if (!opponent) return { gameId: null, queued: true, since: own.created_ms };
    const [red, black] = randomInt(2) ? [user, opponent.user_id] : [opponent.user_id, user];
    const game = await create(tx, red, black, now);
    await tx.query('DELETE FROM queue_tickets WHERE user_id=$1 OR user_id=$2', [red, black]);
    return { gameId: game.id, queued: false, since: null };
  });
}
export async function savePractice(db: Database, user: string, id: string, moves: Move[], label: string) {
  let state: GameState;
  try { state = replay(moves); } catch { throw new ServiceError(422, 'This replay contains an illegal move or continues after the game ended.'); }
  const rows = await db.query('INSERT INTO practice(id,user_id,label,moves,reason) VALUES($1,$2,$3,$4::text::jsonb,$5) ON CONFLICT(id) DO UPDATE SET moves=excluded.moves,reason=excluded.reason WHERE practice.user_id=excluded.user_id RETURNING id', [id,user,label,JSON.stringify(moves),state.outcome?.reason ?? null]);
  if (!rows.length) throw new ServiceError(409, 'Save ID is already in use.');
  return { id };
}
export async function history(db: Database, user: string, offset: number): Promise<HistoryGame[]> {
  const online = await db.query<GameRow>(`${gameSql} WHERE g.red_id=$1 OR g.black_id=$1 ORDER BY g.created_at DESC LIMIT $2`, [user, offset + 21]);
  const practice = await db.query<{ id:string; label:string; moves:Move[]; reason:string|null; created_at:string }>('SELECT id,label,moves,reason,created_at FROM practice WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [user, offset + 21]);
  const rows: HistoryGame[] = [
    ...online.map(g => ({id:g.id,label:`${g.red_name} vs ${g.black_name || 'waiting'}`,kind:'online' as const,created_at:g.created_at,status:g.status,reason:g.reason,moves:g.state.moves,winner:g.winner})),
    ...practice.map(g => ({...g,kind:'practice' as const,status:'saved practice',winner:null}))
  ];
  return rows.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(offset,offset+21);
}
export async function leaderboard(db: Database) { return db.query<Account>('SELECT id,username,rating,rated_games FROM accounts WHERE rated_games>=10 ORDER BY rating DESC,username LIMIT 50'); }
export async function sweep(db: Database) {
  return db.transaction(async tx => {
    const ids = await tx.query<{id:string}>('SELECT id FROM games WHERE status IN (\'active\',\'waiting\') ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED');
    let finished = 0;
    for (const {id} of ids) { const game = await loadGame(tx,id); const before=game.status; await settle(tx,game,await databaseNow(tx)); if(game.status!==before) finished++; }
    return { finished };
  });
}
