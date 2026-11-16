// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Todas as páginas são geradas no Worker a partir do D1 (ADR-005).
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  // Sem sessões do Astro (precisariam de um KV): as sessões do painel estão no D1.
  session: false,
  // URL pública, para o canónico, a partilha e o sitemap. Na homologação aponta já para o domínio
  // final (as páginas não são indexadas, D26).
  site: process.env.SITE_URL ?? "https://missasemguimaraes.pt",
  trailingSlash: "always",
  vite: {
    plugins: [tailwindcss()],
  },
});
