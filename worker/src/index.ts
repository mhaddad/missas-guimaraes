/**
 * Worker do projeto (PLANO §9.2). No E0: serve o site e protege a homologação da indexação (D26).
 * A API, a identidade pelo Access e os crons entram a partir do E3.
 */

export interface Env {
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
