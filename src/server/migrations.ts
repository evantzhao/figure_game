import { readdir, readFile } from 'node:fs/promises';
import type { Database } from './db';

/** Explicit for hosted databases; local development runs the same ordered migrations. */
export async function migrate(db: Database) {
  const files = (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    await db.transaction(async tx => { await tx.script(await readFile(`db/migrations/${file}`, 'utf8')); });
  }
}
