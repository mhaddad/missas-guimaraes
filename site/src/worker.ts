/**
 * Ponto de entrada do Worker (ADR-005). Primeiro as rotas próprias (API, login Google, relatos);
 * depois as páginas, geradas pelo Astro. As páginas públicas passam pela cache (por idioma, dia
 * de Lisboa e versão dos dados); as do painel nunca.
 */
import { handle } from "@astrojs/cloudflare/handler";
import {
  chavePagina,
  ePaginaPublica,
  guardarPagina,
  obterPagina,
  semIndexacao,
  tratarRotas,
  type Env as EnvServidor,
} from "@missas/worker";

type Env = EnvServidor & {
  ASSETS: Fetcher;
  /** Versão do código publicada (para a chave da cache das páginas). */
  VERSAO_CODIGO?: { id: string };
};

const CABECALHOS_PAGINA = {
  "content-type": "text/html; charset=utf-8",
  // O navegador volta sempre a perguntar; a cópia pronta está no Worker.
  "cache-control": "no-cache",
};

async function pagina(pedido: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(pedido.url);
  const bd = env.BD;
  if (pedido.method !== "GET" || !bd || !ePaginaPublica(pathname))
    return handle(pedido, env as never, ctx);

  const chave = await chavePagina(bd, pathname, env.VERSAO_CODIGO?.id ?? "local");
  const pronta = await obterPagina(bd, chave);
  if (pronta !== null) return new Response(pronta, { headers: CABECALHOS_PAGINA });

  const gerada = await handle(pedido, env as never, ctx);
  if (gerada.status !== 200) return gerada;
  const html = await gerada.text();
  ctx.waitUntil(guardarPagina(bd, chave, html));
  return new Response(html, { headers: CABECALHOS_PAGINA });
}

export default {
  async fetch(pedido, env, ctx) {
    const resposta = (await tratarRotas(pedido, env)) ?? (await pagina(pedido, env, ctx));
    return env.AMBIENTE !== "producao" ? semIndexacao(resposta) : resposta;
  },
} satisfies ExportedHandler<Env>;
