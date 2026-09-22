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
  const [user] = await db.query<Account & { password_hash: string }>('SELECT id,username,rating,rated_games,password_hash FROM accounts WHERE username=$1', [username]);
  // Run the same expensive hash even for an unknown account.
  const valid = await verifyPassword(password, user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
  if (!user || !valid) throw new ServiceError(401, 'Incorrect username or password.');
  const { password_hash: _password, ...profile } = user; void _password;
  return { user: profile, token: await db.transaction(tx => session(tx, user.id)) };
}
export async function authenticate(db: Database, token: string | undefined): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  const [user] = await db.query<Account>('SELECT a.id,a.username,a.rating,a.rated_games FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [digest(token)]);
  return user || null;
}
export async function logout(db: Database, token: string | undefined) { if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]); }
