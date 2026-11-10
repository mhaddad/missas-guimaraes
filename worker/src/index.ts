/**
 * Worker do projeto (§9.2): serve o site e o painel, protege a homologação da indexação (D26),
 * recebe os relatos do público (E2.9) e responde à API do painel (E3). Os crons entram no E6.
 */
import { tratarApiPainel, type EnvPainel } from "./api/painel.ts";
import { tratarRelato, type EnvRelato } from "./relato.ts";

export interface Env extends EnvRelato, EnvPainel {
  ASSETS: { fetch(pedido: Request): Promise<Response> };
  AMBIENTE: "homologacao" | "producao";
}

const ROBOTS_BLOQUEADO = "User-agent: *\nDisallow: /\n";

export default {
  async fetch(pedido: Request, env: Env): Promise<Response> {
    const url = new URL(pedido.url);
    const homologacao = env.AMBIENTE !== "producao";

    if (homologacao && url.pathname === "/robots.txt") {
      return semIndexacao(
        new Response(ROBOTS_BLOQUEADO, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }

    if (url.pathname === "/api/saude") {
      const resposta = Response.json({ ok: true, ambiente: env.AMBIENTE });
      return homologacao ? semIndexacao(resposta) : resposta;
    }

    if (url.pathname === "/api/relato") {
      const resposta = await tratarRelato(pedido, env);
      return homologacao ? semIndexacao(resposta) : resposta;
    }

    if (url.pathname.startsWith("/api/")) {
      const resposta = await tratarApiPainel(pedido, env);
      return homologacao ? semIndexacao(resposta) : resposta;
    }

    const resposta = await env.ASSETS.fetch(pedido);
    return homologacao ? semIndexacao(resposta) : resposta;
  },
};

/** Acrescenta `X-Robots-Tag: noindex` sem alterar o resto da resposta. */
function semIndexacao(resposta: Response): Response {
  const nova = new Response(resposta.body, resposta);
  nova.headers.set("X-Robots-Tag", "noindex, nofollow");
  return nova;
}
