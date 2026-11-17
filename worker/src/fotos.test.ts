import { beforeEach, describe, expect, it } from "vitest";
import type { Local } from "@missas/horarios";
import { tratarApiPainel } from "./api/painel.ts";
import { formatoDaImagem, servirFoto, TAMANHO_MAXIMO_FOTO } from "./fotos.ts";
import { comSessao, contacto, importar, novaBase } from "./teste-util.ts";

const AGORA = new Date("2026-11-17T12:00:00Z");
const ORIGEM = "https://missas.exemplo.workers.dev";

/** R2 em memória: só o que `fotos.ts` usa. */
class R2Memoria {
  readonly objetos = new Map<
    string,
    { bytes: Uint8Array; tipo: string; meta: Record<string, string> }
  >();
  head(chave: string) {
    return Promise.resolve(this.objetos.has(chave) ? { httpEtag: `"${chave}"` } : null);
  }
  get(chave: string) {
    const o = this.objetos.get(chave);
    return Promise.resolve(o ? { httpEtag: `"${chave}"`, body: o.bytes } : null);
  }
  put(
    chave: string,
    bytes: Uint8Array,
    opcoes: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> },
  ) {
    this.objetos.set(chave, {
      bytes,
      tipo: opcoes.httpMetadata.contentType,
      meta: opcoes.customMetadata,
    });
    return Promise.resolve({});
  }
  comoR2 = () => this as unknown as R2Bucket;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const local = (id: string): Local =>
  ({
    id,
    tipo: "igreja",
    entidade: id,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.4, lon: -8.3 },
    publicar: true,
    dias_santos: null,
    horarios: [{ tipo: "missa", dias: ["dom"], hora: "11:15" }],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
  }) as Local;

let bd: D1Database;
let r2: R2Memoria;
const cookies: Record<string, string> = {};

beforeEach(async () => {
  bd = novaBase().comoD1();
  r2 = new R2Memoria();
  for (const id of ["nespereira", "polvoreira"])
    await importar(
      bd,
      { id, tipo: "paroquia", nome: `Paróquia de ${id}`, diocese: "Braga", locais: [id] },
      [local(id) as never],
    );
  cookies.nespereira = await comSessao(bd, contacto("c_bbbbbbbb", "nespereira@gmail.com"), AGORA);
});

async function enviar(
  entidade: string,
  corpo: Uint8Array,
  opcoes: { tipo?: string; origem?: string; quem?: string | null; semR2?: boolean } = {},
) {
  const cabecalhos: Record<string, string> = {
    origin: opcoes.origem ?? ORIGEM,
    "content-type": opcoes.tipo ?? "image/jpeg",
  };
  const quem = opcoes.quem === undefined ? "nespereira" : opcoes.quem;
  if (quem) cabecalhos.cookie = cookies[quem] ?? "";
  const resposta = await tratarApiPainel(
    new Request(`${ORIGEM}/api/entidades/${entidade}/fotos`, {
      method: "POST",
      headers: cabecalhos,
      body: corpo,
    }),
    { BD: bd, ...(!opcoes.semR2 && { FOTOS: r2.comoR2() }) },
    { agora: AGORA },
  );
  return { estado: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

describe("formatoDaImagem", () => {
  it("reconhece JPEG e WebP pelos primeiros bytes", () => {
    expect(formatoDaImagem(JPEG)).toBe("jpg");
    expect(formatoDaImagem(WEBP)).toBe("webp");
    expect(formatoDaImagem(PNG)).toBeNull();
    expect(formatoDaImagem(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
  });
});

describe("POST /api/entidades/:id/fotos", () => {
  it("guarda a imagem com o SHA-256 como nome e devolve o caminho público", async () => {
    const r = await enviar("nespereira", JPEG);
    expect(r.estado).toBe(201);
    expect(r.corpo.url).toMatch(/^\/fotos\/[0-9a-f]{64}\.jpg$/);
    const chave = String(r.corpo.url).slice("/fotos/".length);
    expect(r2.objetos.get(chave)).toMatchObject({
      tipo: "image/jpeg",
      meta: { entidade: "nespereira", contacto: "c_bbbbbbbb" },
    });
    // A mesma imagem outra vez: o mesmo caminho, sem duplicar.
    expect((await enviar("nespereira", JPEG)).corpo.url).toBe(r.corpo.url);
    expect(r2.objetos.size).toBe(1);
    expect((await enviar("nespereira", WEBP, { tipo: "image/webp" })).corpo.url).toMatch(/\.webp$/);
  });

  it("só para a paróquia de quem envia", async () => {
    expect(await enviar("polvoreira", JPEG)).toMatchObject({
      estado: 403,
      corpo: { erro: "ambito" },
    });
    expect(r2.objetos.size).toBe(0);
  });

  it("recusa sem sessão, de outra origem e com ids inválidos", async () => {
    expect((await enviar("nespereira", JPEG, { quem: null })).estado).toBe(401);
    expect((await enviar("nespereira", JPEG, { origem: "https://mau.exemplo" })).estado).toBe(403);
    expect((await enviar("Nesp%2e", JPEG)).estado).toBe(400);
    expect((await enviar("nao-existe", JPEG)).estado).toBe(403);
    expect(r2.objetos.size).toBe(0);
  });

  it("só JPEG e WebP, confirmados pelo conteúdo, e com tamanho limitado", async () => {
    expect((await enviar("nespereira", PNG, { tipo: "image/png" })).estado).toBe(415);
    expect((await enviar("nespereira", PNG, { tipo: "image/jpeg" })).estado).toBe(415);
    expect((await enviar("nespereira", WEBP, { tipo: "image/jpeg" })).estado).toBe(415);
    expect((await enviar("nespereira", JPEG, { tipo: "application/json" })).estado).toBe(415);
    expect((await enviar("nespereira", new Uint8Array(0))).estado).toBe(400);
    const grande = new Uint8Array(TAMANHO_MAXIMO_FOTO + 1);
    grande.set(JPEG);
    expect((await enviar("nespereira", grande)).estado).toBe(413);
    expect(r2.objetos.size).toBe(0);
  });

  it("sem o R2, responde indisponível", async () => {
    expect((await enviar("nespereira", JPEG, { semR2: true })).estado).toBe(503);
  });

  it("as outras rotas de escrita continuam a pedir JSON", async () => {
    const r = await tratarApiPainel(
      new Request(`${ORIGEM}/api/gravacoes`, {
        method: "POST",
        headers: { origin: ORIGEM, "content-type": "image/jpeg", cookie: cookies.nespereira ?? "" },
        body: JPEG,
      }),
      { BD: bd, FOTOS: r2.comoR2() },
      { agora: AGORA },
    );
    expect(r.status).toBe(415);
  });
});

describe("GET /fotos/…", () => {
  const pedir = (caminho: string, metodo = "GET") =>
    servirFoto(new Request(`${ORIGEM}${caminho}`, { method: metodo }), { FOTOS: r2.comoR2() });

  it("serve a imagem com o tipo da extensão, cache longa e sem execução", async () => {
    const { corpo } = await enviar("nespereira", JPEG);
    const r = await pedir(String(corpo.url));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(JPEG);
    expect((await pedir(String(corpo.url), "HEAD")).status).toBe(200);
    expect((await pedir(String(corpo.url), "POST")).status).toBe(405);
  });

  it("404 para caminhos fora do padrão ou imagens que não existem", async () => {
    expect((await pedir(`/fotos/${"a".repeat(64)}.jpg`)).status).toBe(404);
    expect((await pedir("/fotos/../segredo.jpg")).status).toBe(404);
    expect((await pedir(`/fotos/${"a".repeat(64)}.svg`)).status).toBe(404);
  });
});
