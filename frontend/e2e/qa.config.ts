import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['qa.spec.ts', 'checks.selftest.spec.ts'],
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './globalSetup.ts',
  globalTeardown: './globalTeardown.ts',
  use: {
    baseURL: 'http://localhost:3100',
    channel: 'msedge',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'msedge',
      use: {
        channel: 'msedge',
      },
    },
  ],
});
