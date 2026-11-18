/**
 * Rotas próprias do Worker (ADR-005). O ponto de entrada (`site/src/worker.ts`) chama
 * `tratarRotas` e, se devolver `null`, entrega o pedido ao Astro (as páginas).
 *
 *   /robots.txt (homologação)   tudo bloqueado (D26)
 *   /api/saude                  estado
 *   /relato (e /api/relato)     relatos do público (Turnstile)
 *   /auth/*                     login Google
 *   /api/*                      API do painel (sessão)
 *   /fotos/*                    imagens de capa (R2, públicas)
 */
import { tratarApiPainel, type EnvPainel } from "./api/painel.ts";
import { servirFoto } from "./fotos.ts";
import { tratarAuth, type EnvGoogle } from "./google.ts";
import { tratarRelato, type EnvRelato } from "./relato.ts";

export { lerEntidade, lerLocais, lerTudo } from "./bd.ts";
export { lerSessao } from "./sessao.ts";
export { estadoDasParoquias, visaoGeral } from "./visao-geral.ts";
export type { RelatoPainel } from "./relatos-painel.ts";
export type { AtualizacaoRecente, ParoquiaPainel, VisaoGeral } from "./visao-geral.ts";
export { chavePagina, ePaginaPublica, guardarPagina, obterPagina } from "./paginas.ts";
export { comCabecalhosDeSeguranca } from "./seguranca.ts";
export type { Contacto } from "./contactos.ts";

export interface Env extends EnvRelato, EnvPainel, EnvGoogle {
  AMBIENTE: "homologacao" | "producao";
}

const ROBOTS_BLOQUEADO = "User-agent: *\nDisallow: /\n";

export async function tratarRotas(pedido: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(pedido.url);
  if (env.AMBIENTE !== "producao" && pathname === "/robots.txt")
    return new Response(ROBOTS_BLOQUEADO, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  if (pathname === "/api/saude") return Response.json({ ok: true, ambiente: env.AMBIENTE });
  if (pathname === "/relato" || pathname === "/api/relato") return tratarRelato(pedido, env);
  if (pathname.startsWith("/auth/")) return tratarAuth(pedido, env);
  if (pathname.startsWith("/api/")) return tratarApiPainel(pedido, env);
  if (pathname.startsWith("/fotos/")) return servirFoto(pedido, env);
  return null;
}

/** Na homologação, nada é indexado: `X-Robots-Tag` em todas as respostas (D26). */
export function semIndexacao(resposta: Response): Response {
  const nova = new Response(resposta.body, resposta);
  nova.headers.set("X-Robots-Tag", "noindex, nofollow");
  return nova;
}
