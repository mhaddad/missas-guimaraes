import { describe, expect, it } from "vitest";
import { indexavel, semIndexacao, tratarRotas, type Env } from "./index.ts";
import { novaBase } from "./teste-util.ts";

const env = (ambiente: Env["AMBIENTE"]): Env => ({ AMBIENTE: ambiente, BD: novaBase().comoD1() });
const pedir = (caminho: string, ambiente: Env["AMBIENTE"] = "homologacao", init?: RequestInit) =>
  tratarRotas(new Request(`https://exemplo.workers.dev${caminho}`, init), env(ambiente));

describe("tratarRotas", () => {
  it("na homologação, o robots.txt bloqueia tudo; em produção fica para o Astro", async () => {
    expect(await (await pedir("/robots.txt"))?.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(await pedir("/robots.txt", "producao")).toBeNull();
  });

  it("estado, relato (fora de /api/), login e API são do Worker; páginas ficam para o Astro", async () => {
    expect(await (await pedir("/api/saude"))?.json()).toEqual({
      ok: true,
      ambiente: "homologacao",
    });
    for (const caminho of ["/relato", "/api/relato"])
      expect((await pedir(caminho))?.status).toBe(405); // só POST
    expect((await pedir("/auth/entrar"))?.status).toBe(503); // sem GOOGLE_* nos testes
    expect((await pedir("/api/eu"))?.status).toBe(401);
    for (const caminho of ["/", "/en/", "/admin/", "/dados/horarios.json"])
      expect(await pedir(caminho)).toBeNull();
  });

  it("indexável só em produção e nunca os fragmentos", () => {
    expect(indexavel("/", "producao")).toBe(true);
    expect(indexavel("/paroquia/nespereira/", "producao")).toBe(true);
    expect(indexavel("/fragmentos/pt-PT/nespereira/", "producao")).toBe(false);
    expect(indexavel("/fragmentos/en/nespereira/", "producao")).toBe(false);
    expect(indexavel("/", "homologacao")).toBe(false);
  });

  it("semIndexacao acrescenta X-Robots-Tag sem mudar o resto", async () => {
    const r = semIndexacao(new Response("ola", { headers: { "content-type": "text/plain" } }));
    expect(r.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await r.text()).toBe("ola");
  });
});
