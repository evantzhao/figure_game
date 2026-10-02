import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Database, Executor } from './db';
import { databaseNow, ServiceError } from './db';
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'figure_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
export type Account = { id: string; username: string; rating: number; rated_games: number };
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function rateLimit(db: Database, key: string, limit: number, windowMs: number): Promise<void> {
  await db.transaction(async tx => {
    const now = await databaseNow(tx);
    const [row] = await tx.query<{ count: number }>(`INSERT INTO rate_limits(key,window_start,count) VALUES($1,$2,1)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_start < $2-$3 THEN 1 ELSE rate_limits.count+1 END,
      window_start=CASE WHEN rate_limits.window_start < $2-$3 THEN $2 ELSE rate_limits.window_start END RETURNING count`, [key, now, windowMs]);
    // Throw outside the transaction, otherwise the attempt counter would roll back.
    return row;
  }).then(row => { if (row.count > limit) throw new ServiceError(429, 'Too many attempts. Please try again later.'); });
}
async function passwordHash(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(':');
  const candidate = await passwordHash(password, salt);
  const actual = Buffer.from(candidate.split(':')[1], 'hex'), expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function session(tx: Executor, id: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'14 days\')', [digest(token), id]);
  return token;
}
export async function register(db: Database, username: string, password: string) {
  const hash = await passwordHash(password);
  return db.transaction(async tx => {
    const [user] = await tx.query<Account>('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id,username,rating,rated_games', [randomUUID(), username, hash]);
    if (!user) throw new ServiceError(409, 'That username is already in use.');
    return { user, token: await session(tx, user.id) };
  });
}
export async function login(db: Database, username: string, password: string) {
  return db.transaction(async tx => {
    const [user] = await tx.query<Account & { password_hash: string }>('SELECT id,username,rating,rated_games,password_hash FROM accounts WHERE username=$1 AND deleted_at IS NULL FOR UPDATE', [username]);
    const valid = await verifyPassword(password, user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!user || !valid) throw new ServiceError(401, 'Incorrect username or password.');
    const { password_hash: _password, ...profile } = user; void _password;
    return { user: profile, token: await session(tx, user.id) };
  });
}
export async function authenticate(db: Database, token: string | undefined): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  const [user] = await db.query<Account>('SELECT a.id,a.username,a.rating,a.rated_games FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.deleted_at IS NULL', [digest(token)]);
  return user || null;
}
export async function logout(db: Database, token: string | undefined) { if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]); }

/** Recovery codes are random bearer secrets. Only their SHA-256 digest is retained. */
export async function createRecoveryCode(db: Database, userId: string, password: string) {
  const recoveryCode = randomBytes(32).toString('hex');
  await db.transaction(async tx => {
    const [user] = await tx.query<{ password_hash: string }>('SELECT password_hash FROM accounts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [userId]);
    if (!user || !await verifyPassword(password, user.password_hash)) throw new ServiceError(401, 'Incorrect password.');
    await tx.query('UPDATE accounts SET recovery_hash=$2 WHERE id=$1', [userId, digest(recoveryCode)]);
  });
  return { recoveryCode };
}

export async function recoverAccount(db: Database, username: string, recoveryCode: string, password: string) {
  const hash = await passwordHash(password);
  await db.transaction(async tx => {
    const [user] = await tx.query<{ id: string; recovery_hash: string | null }>('SELECT id,recovery_hash FROM accounts WHERE username=$1 AND deleted_at IS NULL FOR UPDATE', [username]);
    if (!user?.recovery_hash || !timingSafeEqual(Buffer.from(user.recovery_hash, 'hex'), Buffer.from(digest(recoveryCode), 'hex'))) {
      throw new ServiceError(401, 'Invalid username or recovery code.');
    }
    await tx.query('UPDATE accounts SET password_hash=$2,recovery_hash=NULL WHERE id=$1', [user.id, hash]);
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
  });
  return { ok: true };
}

/** Retain anonymized shared game records; remove private data and revoke every session. */
export async function deleteAccount(db: Database, userId: string, password: string) {
  await db.transaction(async tx => {
    await tx.query('SELECT id FROM queue_guard WHERE id=1 FOR UPDATE');
    const [user] = await tx.query<{ username: string; password_hash: string }>('SELECT username,password_hash FROM accounts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [userId]);
    if (!user || !await verifyPassword(password, user.password_hash)) throw new ServiceError(401, 'Incorrect password.');
    const active = await tx.query('SELECT user_id FROM active_players WHERE user_id=$1', [userId]);
    if (active.length) throw new ServiceError(409, 'Finish your game or cancel your invitation before deleting your account.');
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await tx.query('DELETE FROM practice WHERE user_id=$1', [userId]);
    await tx.query('DELETE FROM queue_tickets WHERE user_id=$1', [userId]);
    // Receipts can contain the previous display name. Terminal games no longer need retry receipts.
    await tx.query("DELETE FROM commands WHERE user_id=$1 OR response->>'red_id'=$2 OR response->>'black_id'=$2", [userId, userId]);
    await tx.query('DELETE FROM rate_limits WHERE key=$1 OR key=$2 OR key=$3', [`auth-user:${user.username}`, `requests:${userId}`, `account:${userId}`]);
    await tx.query('UPDATE games SET rematch_by=NULL,version=version+1 WHERE rematch_by=$1', [userId]);
    await tx.query('UPDATE accounts SET username=$2,password_hash=$3,recovery_hash=NULL,deleted_at=now() WHERE id=$1', [userId, `deleted_${randomBytes(6).toString('hex')}`, 'deleted']);
  });
  return { ok: true };
}
