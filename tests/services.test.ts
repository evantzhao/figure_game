import { randomUUID } from 'node:crypto';
import { migrate } from '@/server/migrations';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectPostgres, pgliteDatabase, type Database } from '@/server/db';
import { createRecoveryCode, recoverAccount, deleteAccount, authenticate, login, logout, rateLimit, register } from '@/server/auth';
import { sweep, command, createChallenge, getGame, history, joinGame, queue, savePractice } from '@/server/games';
import { parseMove } from '@/domain/xiangqi/rules';
import type { Command } from '@/domain/contracts';

let db: Database;
const red = randomUUID(), black = randomUUID(), outsider = randomUUID();
const action = (version: number, name: Command['action'] = 'move', move = 'a3a4'): Command => ({ commandId: randomUUID(), version, action: name, ...(name === 'move' ? { move: parseMove(move) } : {}) });
async function table() { const waiting = await createChallenge(db, red); return joinGame(db, black, waiting.id); }
beforeAll(async () => {
 const testUrl = process.env.TEST_DATABASE_URL;
 if (testUrl) {
  const url = new URL(testUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/figure_chess_test') {
   throw new Error('Destructive service fixtures require localhost/figure_chess_test; hosted databases are forbidden.');
  }
  db = await connectPostgres(testUrl);
  await migrate(db);
  return;
 }
 const pg = new PGlite();
 db = pgliteDatabase(pg);
 await migrate(db);
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
 await db.query('TRUNCATE accounts, rate_limits CASCADE');
 for (const [id, username] of [[red, 'red_user'], [black, 'black_user'], [outsider, 'other_user']]) {
  await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)', [id, username, 'fixture-only']);
 }
});

describe(`database-backed prototype services (${process.env.TEST_DATABASE_URL ? 'multi-connection Postgres' : 'embedded Postgres'})`, () => {
 it.skipIf(!process.env.TEST_DATABASE_URL)('uses distinct backend connections for overlapping transactions', async () => {
  const pids = await Promise.all([0, 1].map(() => db.transaction(async tx => {
   const [row] = await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid, pg_sleep(0.1)');
   return row.pid;
  })));
  expect(new Set(pids).size).toBe(2);
 });
 it('registers, authenticates, rejects bad passwords, and revokes logout sessions', async () => {
  const account = await register(db, 'new_user', 'long test password');
  expect(await authenticate(db, account.token)).toEqual(account.user);
  expect(await authenticate(db, 'forged')).toBeNull();
  await expect(login(db, 'new_user', 'wrong password')).rejects.toMatchObject({ status: 401 });
  const signedIn = await login(db, 'new_user', 'long test password');
  await logout(db, signedIn.token);
  expect(await authenticate(db, signedIn.token)).toBeNull();
  await expect(register(db, 'new_user', 'another long password')).rejects.toMatchObject({ status: 409 });
 });
 it('persists rate-limit attempts even when a request is rejected', async () => {
  await rateLimit(db, 'test', 1, 60000);
  await expect(rateLimit(db, 'test', 1, 60000)).rejects.toMatchObject({ status: 429 });
  await expect(rateLimit(db, 'test', 1, 60000)).rejects.toMatchObject({ status: 429 });
  expect((await db.query('SELECT count FROM rate_limits WHERE key=$1', ['test']))[0].count).toBe(3);
 });
 it('rejects non-player reads and moves, wrong turns, and illegal moves', async () => {
  const game = await table();
  await expect(getGame(db, outsider, game.id)).rejects.toMatchObject({ status: 403 });
  await expect(command(db, outsider, game.id, action(game.version))).rejects.toMatchObject({ status: 403 });
  await expect(command(db, black, game.id, action(game.version))).rejects.toMatchObject({ status: 409 });
  await expect(command(db, red, game.id, action(game.version, 'move', 'a3a5'))).rejects.toMatchObject({ status: 422 });
  expect((await getGame(db, red, game.id)).state.moves).toHaveLength(0);
 });
 it('deduplicates retried commands and rejects payload reuse', async () => {
  const game = await table(), input = action(game.version);
  const first = await command(db, red, game.id, input);
  // Receipts are persisted JSON; compare the actual wire representation of timestamps.
  expect(JSON.parse(JSON.stringify(await command(db, red, game.id, input)))).toEqual(JSON.parse(JSON.stringify(first)));
  await expect(command(db, red, game.id, { ...input, move: parseMove('c3c4') })).rejects.toMatchObject({ status: 409 });
  expect(await db.query('SELECT * FROM moves')).toHaveLength(1);
 });
 it('persists game state, receipts, and practice moves as JSON structures rather than encoded strings', async () => {
  const game = await table();
  const next = await command(db, red, game.id, action(game.version));
  await savePractice(db, red, randomUUID(), next.state.moves, 'JSON regression');
  expect((await db.query('SELECT jsonb_typeof(state) AS kind FROM games'))[0].kind).toBe('object');
  expect((await db.query('SELECT jsonb_typeof(response) AS kind FROM commands'))[0].kind).toBe('object');
  expect((await db.query('SELECT jsonb_typeof(moves) AS kind FROM practice'))[0].kind).toBe('array');
  expect((await history(db, red, 0)).find(row => row.kind === 'practice')?.moves).toEqual([parseMove('a3a4')]);
 });
 it('accepts only one competing move at the same version', async () => {
  const game = await table();
  const results = await Promise.allSettled([command(db, red, game.id, action(game.version)), command(db, red, game.id, action(game.version, 'move', 'c3c4'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await getGame(db, red, game.id)).state.moves).toHaveLength(1);
 });
 it('adds an increment after a legal move and changes the running side', async () => {
  const game = await table();
  const next = await command(db, red, game.id, action(game.version));
  expect(next.red_ms).toBeGreaterThan(600000);
  expect(next.red_ms).toBeLessThanOrEqual(605000);
  expect(next.black_ms).toBe(600000);
  expect(next.state.position.turn).toBe('black');
 });
 it('settles expired clocks before a late move or resignation', async () => {
  const game = await table();
  await db.query('UPDATE games SET red_ms=0 WHERE id=$1', [game.id]);
  const results = await Promise.all([command(db, red, game.id, action(game.version)), command(db, black, game.id, action(game.version, 'resign'))]);
  for (const result of results) expect(result).toMatchObject({ status: 'finished', winner: 'black', reason: 'timeout' });
  expect(await db.query('SELECT * FROM moves')).toHaveLength(0);
  expect(await db.query('SELECT * FROM active_players')).toHaveLength(0);
 });
 it('resignation is terminal and casual play never changes ratings', async () => {
  const game = await table(), input = action(game.version, 'resign');
  const ended = await command(db, red, game.id, input);
  expect(ended).toMatchObject({ status: 'finished', winner: 'black', rated: false });
  expect(JSON.parse(JSON.stringify(await command(db, red, game.id, input)))).toEqual(JSON.parse(JSON.stringify(ended)));
  expect(await db.query('SELECT * FROM rating_events')).toHaveLength(0);
  expect(await db.query('SELECT * FROM active_players')).toHaveLength(0);
  expect((await history(db, black, 0))[0]).toMatchObject({ id: game.id, reason: 'resignation' });
 });
 it('requires an opponent offer to accept a draw', async () => {
  const game = await table();
  await expect(command(db, red, game.id, action(game.version, 'accept-draw'))).rejects.toMatchObject({ status: 409 });
  const offered = await command(db, red, game.id, action(game.version, 'offer-draw'));
  await expect(command(db, red, game.id, action(offered.version, 'accept-draw'))).rejects.toMatchObject({ status: 409 });
  expect(await command(db, black, game.id, action(offered.version, 'accept-draw'))).toMatchObject({ status: 'finished', winner: null, reason: 'agreement' });
 });
 it('pairs two distinct users once and keeps rated matchmaking locked', async () => {
  expect(await queue(db, red)).toMatchObject({ queued: true, gameId: null });
  const match = await queue(db, black);
  expect(match.gameId).toBeTruthy();
  expect((await queue(db, red)).gameId).toBe(match.gameId);
  expect(await db.query('SELECT * FROM active_players')).toHaveLength(2);
  expect(await db.query('SELECT * FROM queue_tickets')).toHaveLength(0);
  await expect(queue(db, outsider, false, true)).rejects.toMatchObject({ status: 409 });
 });
 it('does not self-join or accept a cancelled invitation', async () => {
  const game = await createChallenge(db, red);
  expect(await joinGame(db, red, game.id)).toMatchObject({ status: 'waiting', black_id: null });
  await command(db, red, game.id, action(game.version, 'cancel'));
  await expect(joinGame(db, black, game.id)).rejects.toMatchObject({ status: 409 });
 });
 it('validates saved replays and isolates practice history by owner', async () => {
  const id = randomUUID();
  await savePractice(db, red, id, [parseMove('a3a4')], 'Practice');
  expect(await history(db, red, 0)).toHaveLength(1);
  expect(await history(db, black, 0)).toHaveLength(0);
  await expect(savePractice(db, black, id, [], 'Overwrite')).rejects.toMatchObject({ status: 409 });
  await expect(savePractice(db, red, randomUUID(), [parseMove('a3a5')], 'Illegal')).rejects.toMatchObject({ status: 422 });
 });
 it('concurrent queue requests never seat a user twice', async () => {
  const fourth = randomUUID();
  await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)', [fourth, 'fourth_user', 'fixture-only']);
  await Promise.all([red, black, outsider, fourth, red, black].map(id => queue(db, id)));
  const seats = await db.query<{ user_id: string; game_id: string }>('SELECT user_id,game_id FROM active_players');
  expect(seats).toHaveLength(4);
  expect(new Set(seats.map(row => row.user_id)).size).toBe(4);
  expect(new Set(seats.map(row => row.game_id)).size).toBe(2);
  expect(await db.query('SELECT * FROM queue_tickets')).toHaveLength(0);
 });
 it('cancel racing with a match returns either cancellation or the committed game', async () => {
  await queue(db, red);
  const [cancelled, matched] = await Promise.all([queue(db, red, true), queue(db, black)]);
  const seats = await db.query('SELECT * FROM active_players');
  if (matched.gameId) {
   expect(cancelled.gameId).toBe(matched.gameId);
   expect(seats).toHaveLength(2);
  } else {
   expect(cancelled).toMatchObject({ queued: false, gameId: null });
   expect(seats).toHaveLength(0);
  }
 });
 it('competing terminal requests apply rating events exactly once in an isolated rated fixture', async () => {
  const game = await table();
  // Fixture-only opt-in. No application endpoint can create rated games.
  await db.query('UPDATE games SET rated=true WHERE id=$1', [game.id]);
  const results = await Promise.all([
   command(db, red, game.id, action(game.version, 'resign')),
   command(db, black, game.id, action(game.version, 'resign')),
  ]);
  expect(results[0].winner).toBe(results[1].winner);
  expect(results.every(result => result.status === 'finished')).toBe(true);
  expect(await db.query('SELECT * FROM rating_events')).toHaveLength(2);
  const accounts = await db.query<{ rating: number; rated_games: number }>('SELECT rating,rated_games FROM accounts WHERE id=$1 OR id=$2', [red, black]);
  expect(accounts.map(row => row.rating).sort()).toEqual([1484, 1516]);
  expect(accounts.every(row => row.rated_games === 1)).toBe(true);
  expect(await db.query('SELECT * FROM active_players')).toHaveLength(0);
 });
});

describe('account lifecycle, rematches, and scheduled settlement', () => {
 it('recovery codes rotate, are single-use, and revoke every old session', async () => {
  const a = await register(db, 'recover_me', 'old long password');
  const first = await createRecoveryCode(db, a.user.id, 'old long password');
  const second = await createRecoveryCode(db, a.user.id, 'old long password');
  await expect(recoverAccount(db, 'recover_me', first.recoveryCode, 'new long password')).rejects.toMatchObject({status:401});
  const attempts = await Promise.allSettled([0,1].map(() => recoverAccount(db, 'recover_me', second.recoveryCode, 'new long password')));
  expect(attempts.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(await authenticate(db, a.token)).toBeNull();
  await expect(login(db,'recover_me','old long password')).rejects.toMatchObject({status:401});
  expect((await login(db,'recover_me','new long password')).user.id).toBe(a.user.id);
  expect((await db.query('SELECT recovery_hash FROM accounts WHERE id=$1',[a.user.id]))[0].recovery_hash).toBeNull();
 });
 it('deletion verifies password, refuses active games, erases private data, and anonymizes shared history', async () => {
  const a=await register(db,'delete_me','long delete password');
  const waiting=await createChallenge(db,a.user.id);
  await expect(deleteAccount(db,a.user.id,'wrong long password')).rejects.toMatchObject({status:401});
  await expect(deleteAccount(db,a.user.id,'long delete password')).rejects.toMatchObject({status:409});
  const game=await joinGame(db,black,waiting.id);
  await command(db,a.user.id,game.id,action(game.version,'resign'));
  await savePractice(db,a.user.id,randomUUID(),[],'Private title');
  await createRecoveryCode(db,a.user.id,'long delete password');
  await deleteAccount(db,a.user.id,'long delete password');
  expect(await authenticate(db,a.token)).toBeNull();
  await expect(login(db,'delete_me','long delete password')).rejects.toMatchObject({status:401});
  await expect(createChallenge(db,a.user.id)).rejects.toMatchObject({status:401});
  expect(await db.query('SELECT * FROM practice WHERE user_id=$1',[a.user.id])).toHaveLength(0);
  expect(await db.query('SELECT * FROM commands WHERE user_id=$1',[a.user.id])).toHaveLength(0);
  const records=await history(db,black,0);
  expect(records[0].label).not.toContain('delete_me');
  expect(records[0].label).toContain('deleted_');
 });
 it('requires mutual rematch consent, swaps sides, and deduplicates concurrent acceptance', async () => {
  const game=await table();
  await expect(command(db,red,game.id,action(game.version,'offer-rematch'))).rejects.toMatchObject({status:409});
  const ended=await command(db,red,game.id,action(game.version,'resign'));
  await expect(command(db,outsider,game.id,action(ended.version,'offer-rematch'))).rejects.toMatchObject({status:403});
  const offer=await command(db,red,game.id,action(ended.version,'offer-rematch'));
  await expect(command(db,red,game.id,action(offer.version,'accept-rematch'))).rejects.toMatchObject({status:409});
  const input=action(offer.version,'accept-rematch');
  const results=await Promise.all([command(db,black,game.id,input),command(db,black,game.id,input)]);
  expect(results[0].rematch_id).toBe(results[1].rematch_id);
  const next=await getGame(db,red,results[0].rematch_id!);
  expect(next).toMatchObject({red_id:black,black_id:red,status:'active',rated:false});
  expect(await db.query('SELECT * FROM active_players')).toHaveLength(2);
  expect(await db.query('SELECT * FROM games')).toHaveLength(2);
 });
 it('a rematch cannot steal a seat from another active game and a declined offer cannot be accepted', async () => {
  const game=await table();
  const ended=await command(db,red,game.id,action(game.version,'resign'));
  const offered=await command(db,red,game.id,action(ended.version,'offer-rematch'));
  const declined=await command(db,black,game.id,action(offered.version,'decline-rematch'));
  await expect(command(db,black,game.id,action(declined.version,'accept-rematch'))).rejects.toMatchObject({status:409});
  const reoffered=await command(db,red,game.id,action(declined.version,'offer-rematch'));
  await createChallenge(db,black);
  await expect(command(db,black,game.id,action(reoffered.version,'accept-rematch'))).rejects.toMatchObject({status:409});
 });
 it('scheduled settlement skips live clocks, settles an overdue game beyond 100 newer deadlines, and is idempotent', async () => {
  const game=await table();
  await db.query(`INSERT INTO games(id,red_id,black_id,status,state,turn_started,ruleset,created_at)
    SELECT gen_random_uuid(),red_id,black_id,status,state,turn_started+3600000,ruleset,created_at-interval '1 minute' FROM games CROSS JOIN generate_series(1,110) WHERE id=$1`,[game.id]);
  await db.query('UPDATE games SET red_ms=0 WHERE id=$1',[game.id]);
  expect((await db.query('SELECT chess_private.settle_casual_timeouts() AS count'))[0].count).toBe(1);
  const ended=await getGame(db,black,game.id);
  expect(ended).toMatchObject({status:'finished',winner:'black',reason:'timeout',version:game.version+1});
  expect((await db.query('SELECT chess_private.settle_casual_timeouts() AS count'))[0].count).toBe(0);
  expect(await sweep(db)).toEqual({finished:0});
  expect(await db.query('SELECT * FROM rating_events')).toHaveLength(0);
 });
 it('scheduled settlement races safely with a terminal command and excludes rated games', async () => {
  const game=await table();
  await db.query('UPDATE games SET red_ms=0 WHERE id=$1',[game.id]);
  await Promise.all([db.transaction(tx=>tx.query('SELECT chess_private.settle_casual_timeouts()')),command(db,black,game.id,action(game.version,'resign'))]);
  expect(await getGame(db,red,game.id)).toMatchObject({winner:'black',reason:'timeout',version:game.version+1});
  const next=await table();
  await db.query('UPDATE games SET rated=true,red_ms=0 WHERE id=$1',[next.id]);
  expect((await db.query('SELECT chess_private.settle_casual_timeouts() AS count'))[0].count).toBe(0);
  expect(await sweep(db)).toEqual({finished:1});
  expect(await db.query('SELECT * FROM rating_events')).toHaveLength(2);
 });
});

describe('additive migration compatibility', () => {
 it('can be reapplied without losing existing accounts, moves, or sessions', async () => {
  const account=await register(db,'upgrade_user','upgrade test password');
  const game=await table();
  await command(db,red,game.id,action(game.version));
  await migrate(db);
  expect(await authenticate(db,account.token)).toEqual(account.user);
  expect((await getGame(db,red,game.id)).state.moves).toEqual([parseMove('a3a4')]);
  expect((await db.query('SELECT recovery_hash,deleted_at FROM accounts WHERE id=$1',[account.user.id]))[0]).toMatchObject({recovery_hash:null,deleted_at:null});
 });
});
