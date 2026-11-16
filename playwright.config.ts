import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta do site (§14, ADR-005): build do Worker, base D1 local com os dados
 * fixos de `site/e2e/dados/` e duas sessões de teste (`scripts/semear-e2e.ts`), servidos pelo
 * `wrangler dev`. Correr com `npm run e2e`. Em `localhost`: o cookie de sessão é `Secure`.
 */
export default defineConfig({
  testDir: "site/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4322", locale: "pt-PT", timezoneId: "Europe/Lisbon" },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    { name: "telemovel", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "PUBLIC_TURNSTILE_SITE_KEY=chave-de-teste npm run build -w site && tsx scripts/semear-e2e.ts && cd site && npx wrangler dev --config dist/server/wrangler.json --port 4322 --persist-to .wrangler/e2e --var GOOGLE_CLIENT_ID:cliente-e2e --show-interactive-dev-session=false",
    url: "http://localhost:4322/api/saude",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
