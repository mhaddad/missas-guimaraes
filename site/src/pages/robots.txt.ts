/**
 * robots.txt de produção. Na homologação o Worker responde antes com `Disallow: /` (D26).
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site).toString()}\n`,
    {
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
