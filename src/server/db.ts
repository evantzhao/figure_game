import postgres from 'postgres';
import type { PGlite } from '@electric-sql/pglite';
export type Row = Record<string, unknown>;
export interface Executor { query<T extends Row = Row>(text: string, values?: unknown[]): Promise<T[]> }
export interface Database extends Executor { transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>; close(): Promise<void> }
export class ServiceError extends Error { constructor(public status: number, message: string) { super(message); } }
function postgresExecutor(sql: postgres.Sql | postgres.TransactionSql): Executor {
  return { async query<T extends Row>(text: string, values: unknown[] = []) {
    return [...await sql.unsafe<T[]>(text, values as postgres.ParameterOrJSON<never>[])] as T[];
  } };
}
export async function connectPostgres(url: string): Promise<Database> {
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return { ...postgresExecutor(sql), transaction: async <T>(run: (tx: Executor) => Promise<T>) => {
    const result = await sql.begin(tx => run(postgresExecutor(tx)));
    return result as T;
  }, close: () => sql.end() };
}
export function pgliteDatabase(pg: PGlite): Database {
  // PGlite is one embedded connection; serialize its transactions locally. Hosted Postgres uses row locks.
  let tail = Promise.resolve();
  const exec = (client: Pick<PGlite, 'query'>): Executor => ({ async query<T extends Row>(text: string, values: unknown[] = []) { return (await client.query<T>(text, values)).rows; } });
  return { ...exec(pg), async transaction<T>(run: (tx: Executor) => Promise<T>) {
    const previous = tail; let release: () => void = () => {};
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await pg.transaction(tx => run(exec(tx))); } finally { release(); }
  }, close: () => pg.close() };
}
export function backendConfigured(): boolean { return Boolean(process.env.DATABASE_URL || (!process.env.VERCEL && (process.env.NODE_ENV !== 'production' || process.env.LOCAL_DATABASE_PATH))); }
const cache = globalThis as typeof globalThis & { figureDatabase?: Promise<Database> };
export async function getDb(): Promise<Database> {
  if (!backendConfigured()) throw new ServiceError(503, 'Online play is not available on this preview. CPU and same-device games are ready.');
  if (!cache.figureDatabase) cache.figureDatabase = (async () => {
    if (process.env.DATABASE_URL) return connectPostgres(process.env.DATABASE_URL);
    const { PGlite } = await import('@electric-sql/pglite');
    const { readFile } = await import('node:fs/promises');
    const pg = new PGlite(process.env.LOCAL_DATABASE_PATH || '.local-db');
    await pg.exec(await readFile('db/migrations/001_initial.sql', 'utf8'));
    return pgliteDatabase(pg);
  })().catch(error => { delete cache.figureDatabase; throw error; });
  return cache.figureDatabase;
}
export async function databaseNow(tx: Executor): Promise<number> {
  const [row] = await tx.query<{ ms: number }>('SELECT EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS ms');
  return Number(row.ms);
}
