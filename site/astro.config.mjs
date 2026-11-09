// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // O domínio final só entra no E8; até lá o site corre em *.workers.dev (homologação).
  output: "static",
  // URL pública, para o canónico, a partilha e o sitemap. Na homologação aponta já para o domínio
  // final (as páginas não são indexadas, D26).
  site: process.env.SITE_URL ?? "https://missasemguimaraes.pt",
  trailingSlash: "always",
  vite: {
    plugins: [tailwindcss()],
  },
});
