import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseUrl = process.env.TEST_BROWSER_DATABASE_URL || '';
if (databaseUrl) {
 const url = new URL(databaseUrl);
 if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/figure_chess_test') {
  throw new Error('Browser fixtures require localhost/figure_chess_test; hosted databases are forbidden.');
 }
}

export default defineConfig({
 testDir: './tests/browser',
 fullyParallel: false,
 workers: 1,
 timeout: 60000,
 use: { baseURL: 'http://127.0.0.1:3100', channel: 'chromium', trace: 'retain-on-failure' },
 webServer: {
  command: 'npm run start -- --port 3100',
  url: 'http://127.0.0.1:3100',
  reuseExistingServer: false,
  env: { DATABASE_URL: databaseUrl, VERCEL: '', LOCAL_DATABASE_PATH: mkdtempSync(join(tmpdir(), 'figure-browser-')) },
  timeout: 60000,
 },
});
