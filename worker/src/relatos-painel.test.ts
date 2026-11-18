import { beforeEach, describe, expect, it } from "vitest";
import type { Local } from "@missas/horarios";
import { tratarApiPainel } from "./api/painel.ts";
import { contarRelatosAbertos, mudarEstadoRelato } from "./relatos-painel.ts";
import { comSessao, contacto, importar, novaBase } from "./teste-util.ts";

const AGORA = new Date("2026-11-18T12:00:00Z");
const ORIGEM = "https://missas.exemplo.workers.dev";

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
const cookies: Record<string, string> = {};

const relato = (id: string, localId: string | null, estado: string, criado: string) =>
  bd
    .prepare(
      "INSERT INTO relatos (id, local_id, mensagem, idioma, estado, criado_em) VALUES (?, ?, ?, 'pt-PT', ?, ?)",
    )
    .bind(id, localId, `Mensagem de ${id}: a missa mudou.`, estado, criado)
    .run();

beforeEach(async () => {
  bd = novaBase().comoD1();
  for (const id of ["nespereira", "polvoreira"])
    await importar(
      bd,
      { id, tipo: "paroquia", nome: `Paróquia de ${id}`, diocese: "Braga", locais: [id] },
      [local(id) as never],
    );
  cookies.admin = await comSessao(
    bd,
    contacto("c_aaaaaaaa", "admin@gmail.com", { perfil: "admin", entidades: [], funcao: "equipa" }),
    AGORA,
  );
  cookies.nespereira = await comSessao(bd, contacto("c_bbbbbbbb", "nespereira@gmail.com"), AGORA);
  await relato("r_000000000a", "nespereira", "aberto", "2026-11-17T10:00:00Z");
  await relato("r_000000000b", "polvoreira", "aberto", "2026-11-17T11:00:00Z");
  await relato("r_000000000c", null, "aberto", "2026-11-17T12:00:00Z");
  await relato("r_000000000d", "nespereira", "resolvido", "2026-11-10T09:00:00Z");
});

async function pedir(
  caminho: string,
  opcoes: { quem?: string; metodo?: string; corpo?: unknown; origem?: string; tipo?: string } = {},
) {
  const metodo = opcoes.metodo ?? "GET";
  const cabecalhos: Record<string, string> = { cookie: cookies[opcoes.quem ?? "nespereira"] ?? "" };
  if (metodo !== "GET") {
    cabecalhos.origin = opcoes.origem ?? ORIGEM;
    cabecalhos["content-type"] = opcoes.tipo ?? "application/json";
  }
  const r = await tratarApiPainel(
    new Request(`${ORIGEM}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      ...(opcoes.corpo !== undefined && { body: JSON.stringify(opcoes.corpo) }),
    }),
    { BD: bd },
    { agora: AGORA },
  );
  return { estado: r.status, corpo: (await r.json()) as Record<string, unknown> & unknown[] };
}

const ids = (corpo: unknown) => (corpo as { id: string }[]).map((r) => r.id);

describe("GET /api/relatos", () => {
  it("o administrador vê todos, do mais recente para o mais antigo, com local e entidade", async () => {
    const r = await pedir("/api/relatos", { quem: "admin" });
    expect(ids(r.corpo)).toEqual(["r_000000000c", "r_000000000b", "r_000000000a", "r_000000000d"]);
    expect(r.corpo[2]).toMatchObject({
      local: { id: "nespereira", nome: "Igreja nespereira" },
      entidade: { id: "nespereira", nome: "Paróquia de nespereira" },
      estado: "aberto",
    });
    expect(r.corpo[0]).toMatchObject({ local: null, entidade: null });
  });

  it("o contacto de uma paróquia só vê os dos seus locais (nunca os sem local)", async () => {
    expect(ids((await pedir("/api/relatos")).corpo)).toEqual(["r_000000000a", "r_000000000d"]);
    expect(ids((await pedir("/api/relatos?estado=aberto")).corpo)).toEqual(["r_000000000a"]);
    expect(ids((await pedir("/api/relatos?entidade=nespereira&estado=todos")).corpo)).toHaveLength(
      2,
    );
  });

  it("recusa outra entidade, estados e ids inválidos", async () => {
    expect((await pedir("/api/relatos?entidade=polvoreira")).estado).toBe(403);
    expect((await pedir("/api/relatos?estado=apagado")).estado).toBe(400);
    expect((await pedir("/api/relatos?entidade=Nesp%27")).estado).toBe(400);
  });

  it("o limite aplica-se depois do âmbito: relatos de outras paróquias não escondem os desta", async () => {
    for (let i = 0; i < 520; i++)
      await relato(
        `r_${(0x100 + i).toString(16).padStart(10, "0")}`,
        i % 2 ? "polvoreira" : null,
        "aberto",
        `2026-11-18T0${i % 10}:00:00Z`,
      );
    expect(ids((await pedir("/api/relatos?estado=aberto")).corpo)).toEqual(["r_000000000a"]);
    expect(
      ids((await pedir("/api/relatos?estado=aberto&entidade=nespereira", { quem: "admin" })).corpo),
    ).toEqual(["r_000000000a"]);
  });

  it("conta os abertos", async () => {
    expect(await contarRelatosAbertos(bd)).toBe(3);
  });
});

describe("PATCH /api/relatos/:id", () => {
  it("muda o estado de um relato da sua paróquia e regista na auditoria", async () => {
    const r = await pedir("/api/relatos/r_000000000a", {
      metodo: "PATCH",
      corpo: { estado: "resolvido" },
    });
    expect(r).toMatchObject({ estado: 200, corpo: { id: "r_000000000a", estado: "resolvido" } });
    expect(ids((await pedir("/api/relatos?estado=aberto")).corpo)).toEqual([]);
    const auditoria = await bd
      .prepare("SELECT contacto_id, acao, detalhe FROM auditoria WHERE acao LIKE 'relato.%'")
      .all<{ contacto_id: string; acao: string; detalhe: string }>();
    expect(auditoria.results).toEqual([
      {
        contacto_id: "c_bbbbbbbb",
        acao: "relato.resolvido",
        detalhe: JSON.stringify({ id: "r_000000000a", entidade: "nespereira", de: "aberto" }),
      },
    ]);
  });

  it("só muda a partir do estado visto; senão não muda nem regista", async () => {
    const mudanca = {
      id: "r_000000000d",
      de: "aberto" as const,
      para: "descartado" as const,
      entidade: "nespereira",
      quem: "c_bbbbbbbb",
      agora: AGORA,
    };
    // O r_…d já está resolvido: um pedido que o viu aberto não o muda.
    expect(await mudarEstadoRelato(bd, mudanca)).toBe(false);
    const n = await bd.prepare("SELECT count(*) AS n FROM auditoria").first<number>("n");
    expect(n).toBe(0);
    expect(await mudarEstadoRelato(bd, { ...mudanca, de: "resolvido" })).toBe(true);
  });

  it("fora do âmbito responde como inexistente e não muda nada", async () => {
    for (const id of ["r_000000000b", "r_000000000c", "r_00000000ff"]) {
      const r = await pedir(`/api/relatos/${id}`, {
        metodo: "PATCH",
        corpo: { estado: "descartado" },
      });
      expect(r.estado, id).toBe(404);
    }
    expect(await contarRelatosAbertos(bd)).toBe(3);
    // O administrador pode, incluindo o relato sem local.
    expect(
      (
        await pedir("/api/relatos/r_000000000c", {
          quem: "admin",
          metodo: "PATCH",
          corpo: { estado: "descartado" },
        })
      ).estado,
    ).toBe(200);
  });

  it("recusa estados, campos e ids inválidos, outra origem e corpo que não é JSON", async () => {
    const patch = (corpo: unknown, extra = {}) =>
      pedir("/api/relatos/r_000000000a", { metodo: "PATCH", corpo, ...extra });
    expect((await patch({ estado: "apagado" })).estado).toBe(400);
    expect((await patch({ estado: "resolvido", mensagem: "x" })).estado).toBe(400);
    expect((await patch(null)).estado).toBe(400);
    expect((await pedir("/api/relatos/1 or 1=1", { metodo: "PATCH", corpo: {} })).estado).toBe(400);
    expect((await patch({ estado: "resolvido" }, { origem: "https://mau.exemplo" })).estado).toBe(
      403,
    );
    expect((await patch({ estado: "resolvido" }, { tipo: "text/plain" })).estado).toBe(415);
    expect((await pedir("/api/relatos/r_000000000a", { metodo: "DELETE", corpo: {} })).estado).toBe(
      405,
    );
    expect(await contarRelatosAbertos(bd)).toBe(3);
  });
});
