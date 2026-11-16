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
import { lerEntidade, lerLocais, lerSessao, lerTudo } from "@missas/worker";
import CALENDARIO_YAML from "../../dados/calendario.yml?raw";

interface Contexto {
  request: Request;
  url: URL;
  locals: Record<string, unknown>;
  redirect(caminho: string, estado?: 301 | 302 | 303 | 307 | 308): Response;
}

const LIVRES = new Set(["/admin/entrar/", "/admin/sem-acesso/"]);
const SO_ADMIN = ["/admin/acessos/"];
const COM_DADOS = new Set([
  "/",
  "/en/",
  "/es/",
  "/paroquias/",
  "/en/paroquias/",
  "/es/paroquias/",
  "/dados/horarios.json",
  "/sitemap.xml",
]);
const ID = "([a-z0-9]+(?:-[a-z0-9]+)*)";
/** Página de uma paróquia (`/paroquia/<id>/`, também em /en/ e /es/). */
const PAROQUIA = new RegExp(`^/((?:en|es)/)?paroquia/${ID}/$`);
/** Endereço antigo de uma igreja: passa a ser uma secção da página da paróquia. */
const IGREJA = new RegExp(`^/((?:en|es)/)?igreja/${ID}/$`);
/** Fragmento com o detalhe de uma igreja (pedido ao abrir um cartão). */
const FRAGMENTO = new RegExp(`^/fragmentos/(?:pt-PT|en|es)/${ID}/$`);

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

  calendario ??= lerCalendario(CALENDARIO_YAML);
  const paroquia = PAROQUIA.exec(pathname);
  if (paroquia && bd) {
    // Só esta entidade e os seus locais publicados (e o calendário, para as celebrações).
    const entidade = (await lerEntidade(bd, paroquia[2] ?? ""))?.dados;
    if (entidade) {
      const locais = [...(await lerLocais(bd, entidade.locais)).values()]
        .map((r) => r.dados)
        .filter((l) => l.publicar);
      if (locais.length > 0) contexto.locals.paroquia = { entidade, locais, calendario };
    }
    return seguinte();
  }

  const antiga = IGREJA.exec(pathname);
  const fragmento = FRAGMENTO.exec(pathname);
  if ((antiga || fragmento) && bd) {
    const id = antiga?.[2] ?? fragmento?.[1] ?? "";
    const local = (await lerLocais(bd, [id])).get(id)?.dados;
    const entidade = local?.publicar ? (await lerEntidade(bd, local.entidade))?.dados : undefined;
    if (local && entidade) {
      // Endereços antigos /igreja/<id>/ → secção da página da paróquia.
      if (antiga)
        return contexto.redirect(`/${antiga[1] ?? ""}paroquia/${entidade.id}/#${local.id}`, 301);
      contexto.locals.igreja = { local, entidade };
    }
    if (antiga) return new Response("Não encontrado.", { status: 404 });
    return seguinte();
  }

  if (COM_DADOS.has(pathname) && bd) {
    contexto.locals.dados = { ...(await lerTudo(bd)), calendario };
  }
  return seguinte();
}
