/**
 * Dados abertos (ADR-005 §7): as entidades e os locais publicados, tal como estão no D1.
 * Substitui os YAML públicos do repositório.
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ locals }) => {
  const dados = locals.dados;
  if (!dados) return new Response(null, { status: 503 });
  const publicados = dados.locais.filter((l) => l.publicar);
  const entidades = new Set(publicados.map((l) => l.entidade));
  const corpo = {
    gerado_em: new Date().toISOString(),
    entidades: dados.entidades.filter((e) => entidades.has(e.id)),
    locais: publicados.map(({ revisao: _r, confirmado_por: _c, ...publico }) => publico),
  };
  return new Response(JSON.stringify(corpo), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" },
  });
};
