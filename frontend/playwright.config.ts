import { defineConfig } from "@playwright/test";

const PUERTO = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: `http://localhost:${PUERTO}` },
  webServer: {
    command: `npm run build && npx next start -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
