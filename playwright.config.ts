import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  env: { DATABASE_URL: '', VERCEL: '', LOCAL_DATABASE_PATH: mkdtempSync(join(tmpdir(), 'figure-browser-')) },
  timeout: 60000,
 },
});
