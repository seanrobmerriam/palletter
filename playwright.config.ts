import { defineConfig, devices } from '@playwright/test';

const port = 4322;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Set PW_CHROMIUM_PATH to use a Chromium that's already installed instead of `playwright install`.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: `bun run build && PORT=${port} bun run start`,
    // Use the fake ACP agent, and ignore any agent settings in a local .env.
    env: {
      PALLETTER_AGENT: 'custom',
      PALLETTER_AGENT_COMMAND: 'bun test/fake-agent.ts',
      MINIMAX_API_KEY: '',
    },
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
