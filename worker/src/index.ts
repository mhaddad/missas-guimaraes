/**
 * Worker do projeto (§9.2): serve o site, protege a homologação da indexação (D26) e recebe os
 * relatos do público (E2.9). A identidade pelo Access, o resto da API e os crons entram no E3.
 */
import { tratarRelato, type EnvRelato } from "./relato.ts";

export interface Env extends EnvRelato {
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
