/**
 * Middleware do Astro (ADR-005). REVISÃO DE SEGURANÇA OBRIGATÓRIA (acesso ao painel).
 *
 * - Painel (`/admin/…`): a sessão é verificada **antes** de gerar a página. Sem sessão, vai para
 *   a entrada. *Visão geral* e *Acessos* só para `admin`: quem é de uma paróquia vai direto para
 *   a sua. `/admin/paroquia/<id>/` só abre se a pessoa puder ver essa entidade (a API volta a
 *   verificar em cada pedido). As páginas do painel nunca vão para a cache.
 * - Páginas públicas e dados abertos: lê do D1 as entidades e os locais (`locals.dados`).
 *
 * Verificado pelo projeto TypeScript do Worker (tipos da Cloudflare), não pelo do site.
 */
import { env } from "cloudflare:workers";
import { lerCalendario } from "@missas/dados";
import type { Calendario } from "@missas/horarios";
import {
  estadoDasParoquias,
  lerEntidade,
  lerLocais,
  lerSessao,
  lerTudo,
  visaoGeral,
} from "@missas/worker";
import CALENDARIO_YAML from "../../dados/calendario.yml?raw";

interface Contexto {
  request: Request;
  url: URL;
  locals: Record<string, unknown>;
  redirect(caminho: string, estado?: 301 | 302 | 303 | 307 | 308): Response;
}

const LIVRES = new Set(["/admin/entrar/", "/admin/sem-acesso/"]);
const SO_ADMIN = ["/admin/acessos/", "/admin/relatos/"];
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
/** Página de uma entidade no painel. */
const PAINEL_PAROQUIA = new RegExp(`^/admin/paroquia/${ID}/$`);

let calendario: Calendario | undefined;

function semCache(resposta: Response): Response {
  resposta.headers.set("cache-control", "private, no-store");
  return resposta;
}

/**
 * Dados e redirecionamentos de cada página do painel. Devolve uma resposta só quando a pessoa
 * deve ir para outra página.
 */
async function rotaDoPainel(
  contexto: Contexto,
  bd: D1Database,
  eu: { perfil: "admin" | "entidade"; entidades: string[] },
  admin: boolean,
): Promise<Response | null> {
  const { pathname, searchParams } = contexto.url;
  const paginaDe = (id: string) => `/admin/paroquia/${encodeURIComponent(id)}/`;

  if (pathname === "/admin/" || pathname === "/admin") {
    // Endereço antigo do painel: /admin/?entidade=<id>.
    const pedida = searchParams.get("entidade");
    if (pedida && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(pedida))
      return contexto.redirect(paginaDe(pedida));
    if (!admin) {
      const [unica, ...outras] = eu.entidades;
      return contexto.redirect(
        unica && outras.length === 0 ? paginaDe(unica) : "/admin/paroquias/",
      );
    }
    contexto.locals.visaoGeral = await visaoGeral(bd);
    return null;
  }

  if (pathname === "/admin/paroquias/") {
    const todas = await estadoDasParoquias(bd);
    const minhas = admin ? todas : todas.filter((p) => eu.entidades.includes(p.id));
    const [unica] = minhas;
    if (!admin && minhas.length === 1 && unica) return contexto.redirect(paginaDe(unica.id));
    contexto.locals.paroquiasPainel = minhas;
    return null;
  }

  const paroquia = PAINEL_PAROQUIA.exec(pathname);
  if (paroquia) {
    const id = paroquia[1] ?? "";
    if (!admin && !eu.entidades.includes(id)) return contexto.redirect("/admin/");
    const entidade = await lerEntidade(bd, id);
    // Inexistente: a página diz que não a encontrou (sem redirecionar, para não haver ciclos).
    if (entidade) contexto.locals.entidadePainel = { id, nome: entidade.dados.nome };
  }
  return null;
}

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
      const admin = eu.perfil === "admin";
      if (SO_ADMIN.some((p) => pathname.startsWith(p)) && !admin)
        return contexto.redirect("/admin/");
      contexto.locals.eu = { id: eu.id, nome: eu.nome, perfil: eu.perfil, entidades: eu.entidades };
      const resposta = await rotaDoPainel(contexto, bd as D1Database, eu, admin);
      if (resposta) return semCache(resposta);
    }
    return semCache(await seguinte());
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
