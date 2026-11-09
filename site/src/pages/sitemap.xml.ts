/** Sitemap com as três versões da página (§6.5), já para o domínio final. */
import type { APIRoute } from "astro";
import { IDIOMAS, TEXTOS } from "../i18n/index.ts";

export const GET: APIRoute = ({ site }) => {
  const url = (caminho: string) => new URL(caminho, site).toString();
  const alternativas = IDIOMAS.map(
    (i) =>
      `    <xhtml:link rel="alternate" hreflang="${TEXTOS[i].idioma}" href="${url(TEXTOS[i].caminho)}"/>`,
  ).join("\n");
  const entradas = IDIOMAS.map(
    (i) =>
      `  <url>\n    <loc>${url(TEXTOS[i].caminho)}</loc>\n    <changefreq>daily</changefreq>\n${alternativas}\n  </url>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entradas}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
