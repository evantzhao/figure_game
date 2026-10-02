import { connectPostgres } from '../src/server/db';
import { migrate } from '../src/server/migrations';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Local development migrates its own isolated database.');
const db = await connectPostgres(process.env.DATABASE_URL);
try { await migrate(db); console.log('Chinese Chess migrations applied.'); }
finally { await db.close(); }
