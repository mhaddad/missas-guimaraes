/**
 * Middleware do Astro (ADR-005). REVISÃO DE SEGURANÇA OBRIGATÓRIA (acesso ao painel).
 *
 * - Painel (`/admin/…`): a sessão é verificada **antes** de gerar a página. Sem sessão, vai para
 *   a entrada; *Acessos* só para `admin`. As páginas do painel nunca vão para a cache.
 * - Páginas públicas e dados abertos: lê do D1 as entidades e os locais (`locals.dados`).
 *
 * Verificado pelo projeto TypeScript do Worker (tipos da Cloudflare), não pelo do site.
 */
import { env } from "cloudflare:workers";
import { lerCalendario } from "@missas/dados";
import type { Calendario } from "@missas/horarios";
import { lerSessao, lerTudo } from "@missas/worker";
import CALENDARIO_YAML from "../../dados/calendario.yml?raw";

interface Contexto {
  request: Request;
  url: URL;
  locals: Record<string, unknown>;
  redirect(caminho: string, estado?: 301 | 302 | 303 | 307 | 308): Response;
}

const LIVRES = new Set(["/admin/entrar/", "/admin/sem-acesso/"]);
const SO_ADMIN = ["/admin/acessos/"];
const COM_DADOS = new Set(["/", "/en/", "/es/", "/dados/horarios.json"]);

let calendario: Calendario | undefined;

export async function onRequest(
  contexto: Contexto,
  seguinte: () => Promise<Response>,
): Promise<Response> {
  const bd = (env as { BD?: D1Database }).BD;
  const { pathname, search } = contexto.url;

  if (pathname.startsWith("/admin/") || pathname === "/admin") {
    if (!LIVRES.has(pathname)) {
      const eu = bd ? await lerSessao(bd, contexto.request) : null;
      if (!eu)
        return contexto.redirect(`/admin/entrar/?voltar=${encodeURIComponent(pathname + search)}`);
      if (SO_ADMIN.some((p) => pathname.startsWith(p)) && eu.perfil !== "admin")
        return contexto.redirect("/admin/");
      contexto.locals.eu = { id: eu.id, nome: eu.nome, perfil: eu.perfil, entidades: eu.entidades };
    }
    const resposta = await seguinte();
    resposta.headers.set("cache-control", "private, no-store");
    return resposta;
  }

  if (COM_DADOS.has(pathname) && bd) {
    calendario ??= lerCalendario(CALENDARIO_YAML);
    contexto.locals.dados = { ...(await lerTudo(bd)), calendario };
  }
  return seguinte();
}
