import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pgliteDatabase, type Database } from '@/server/db';
import { authenticate, login, logout, rateLimit, register } from '@/server/auth';
import { command, createChallenge, getGame, history, joinGame, queue, savePractice } from '@/server/games';
import { parseMove } from '@/domain/xiangqi/rules';
import type { Command } from '@/domain/contracts';

let db: Database;
const red = randomUUID(), black = randomUUID(), outsider = randomUUID();
const action = (version: number, name: Command['action'] = 'move', move = 'a3a4'): Command => ({ commandId: randomUUID(), version, action: name, ...(name === 'move' ? { move: parseMove(move) } : {}) });
async function table() { const waiting = await createChallenge(db, red); return joinGame(db, black, waiting.id); }
beforeAll(async () => {
 const pg = new PGlite();
 await pg.exec(await readFile('db/migrations/001_initial.sql', 'utf8'));
 db = pgliteDatabase(pg);
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
 await db.query('TRUNCATE accounts, rate_limits CASCADE');
 for (const [id, username] of [[red, 'red_user'], [black, 'black_user'], [outsider, 'other_user']]) {
  await db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)', [id, username, 'fixture-only']);
 }
});

describe('database-backed prototype services (embedded Postgres; not multi-connection proof)', () => {
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
});
