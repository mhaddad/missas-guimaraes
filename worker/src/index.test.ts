import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index.ts";

function env(ambiente: Env["AMBIENTE"]): Env {
  return {
    AMBIENTE: ambiente,
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><title>teste</title>", {
          headers: { "content-type": "text/html" },
        }),
    },
  };
}

const pedir = (caminho: string, ambiente: Env["AMBIENTE"]) =>
  worker.fetch(new Request(`https://exemplo.workers.dev${caminho}`), env(ambiente));

describe("worker", () => {
  it("na homologação, marca todas as páginas com noindex", async () => {
    const resposta = await pedir("/", "homologacao");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(resposta.headers.get("content-type")).toBe("text/html");
  });

  it("na homologação, o robots.txt bloqueia tudo", async () => {
    const resposta = await pedir("/robots.txt", "homologacao");
    expect(await resposta.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("em produção, não acrescenta noindex", async () => {
    const resposta = await pedir("/", "producao");
    expect(resposta.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("responde ao teste de saúde com o ambiente", async () => {
    const resposta = await pedir("/api/saude", "homologacao");
    expect(await resposta.json()).toEqual({ ok: true, ambiente: "homologacao" });
  });

  it("o aviso interno não passa pelo Access: vale só a assinatura", async () => {
    const resposta = await worker.fetch(
      new Request("https://exemplo.workers.dev/api/interno/estado", {
        method: "POST",
        headers: { "x-assinatura": "0".repeat(64) },
        body: "{}",
      }),
      {
        ...env("homologacao"),
        AVISO_HMAC: "segredo-dos-avisos-com-mais-de-32-caracteres",
        KV: {} as KVNamespace,
      },
    );
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toMatchObject({ erro: "assinatura" });
    expect(resposta.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
