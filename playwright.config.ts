import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta do site (§14): build com os dados fixos de `site/e2e/dados/` e servidor
 * estático. Correr com `npm run e2e`.
 */
export default defineConfig({
  testDir: "site/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4322", locale: "pt-PT", timezoneId: "Europe/Lisbon" },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    { name: "telemovel", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "MISSAS_DADOS=e2e/dados npm run build -w site -- --outDir dist-e2e && tsx scripts/servir-estatico.ts site/dist-e2e 4322",
    url: "http://127.0.0.1:4322/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
