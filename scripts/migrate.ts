import { readFile } from 'node:fs/promises';
import { connectPostgres } from '../src/server/db';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Local development migrates its own isolated database.');
const db = await connectPostgres(process.env.DATABASE_URL);
try { await db.transaction(async tx => { await tx.query(await readFile('db/migrations/001_initial.sql','utf8')); }); console.log('Migration 001 applied.'); }
finally { await db.close(); }
