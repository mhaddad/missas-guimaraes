/** Sitemap com as três versões da página principal e a página de cada paróquia (§6.5). */
import type { APIRoute } from "astro";
import { IDIOMAS, TEXTOS } from "../i18n/index.ts";

export const GET: APIRoute = ({ site, locals }) => {
  const url = (caminho: string) => new URL(caminho, site).toString();
  const entrada = (sufixo: string, frequencia: string) => {
    const alternativas = IDIOMAS.map(
      (i) =>
        `    <xhtml:link rel="alternate" hreflang="${TEXTOS[i].idioma}" href="${url(TEXTOS[i].caminho + sufixo)}"/>`,
    ).join("\n");
    return IDIOMAS.map(
      (i) =>
        `  <url>\n    <loc>${url(TEXTOS[i].caminho + sufixo)}</loc>\n    <changefreq>${frequencia}</changefreq>\n${alternativas}\n  </url>`,
    ).join("\n");
  };
  // Só paróquias com pelo menos um local publicado (as outras dão 404).
  const comLocais = new Set(
    (locals.dados?.locais ?? []).filter((l) => l.publicar).map((l) => l.entidade),
  );
  const paroquias = (locals.dados?.entidades ?? [])
    .filter((e) => comLocais.has(e.id))
    .map((e) => entrada(`paroquia/${e.id}/`, "weekly"));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[entrada("", "daily"), ...paroquias].join("\n")}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
