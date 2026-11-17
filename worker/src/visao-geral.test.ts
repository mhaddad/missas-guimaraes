import { beforeEach, describe, expect, it } from "vitest";
import type { Entidade, Local } from "@missas/horarios";
import MIGRACAO from "../migracoes/0001_inicial.sql?raw";
import { gravar, type Gravacao } from "./bd.ts";
import { D1Memoria } from "./teste-d1.ts";
import { estadoDasParoquias, visaoGeral } from "./visao-geral.ts";

const local = (id: string, entidade: string, extra: Partial<Local> = {}): Local =>
  ({
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    localidade: `Lugar ${id}`,
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [{ tipo: "missa", dias: ["dom"], hora: "10:00" }],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
    ...extra,
  }) as Local;

const entidade = (id: string, nome: string, locais: string[]): Entidade =>
  ({ id, tipo: "paroquia", nome, diocese: "Braga", locais }) as Entidade;

let bd: D1Database;

const importar = (e: Entidade, locais: Local[]) =>
  gravar(bd, {
    entidadeId: e.id,
    acao: "importacao",
    contactoId: null,
    canal: null,
    resumo: [],
    alertas: [],
    entidade: { dados: e, versaoAnterior: null },
    locais: locais.map((dados) => ({ dados, versaoAnterior: null })),
  });

const alterar = (l: Local, versaoAnterior: number, quando: Date, extra: Partial<Gravacao> = {}) =>
  gravar(
    bd,
    {
      entidadeId: l.entidade,
      acao: "confirmacao",
      contactoId: "c_0001",
      canal: "painel",
      resumo: [{ local: l.id, linhas: ["✅ Horários confirmados"] }],
      alertas: [],
      locais: [{ dados: l, versaoAnterior }],
      ...extra,
    },
    quando,
  );

beforeEach(async () => {
  bd = new D1Memoria([MIGRACAO]).comoD1();
  await bd
    .prepare(
      "INSERT INTO contactos (id, nome, email, funcao, perfil, estado, consentimento, criado_em, atualizado_em) VALUES ('c_0001', 'Rita Teste', 'rita@exemplo.pt', 'secretaria', 'entidade', 'ativo', '{}', '2026-01-01', '2026-01-01')",
    )
    .run();
  await importar(entidade("b", "Paróquia B", ["b1", "b2"]), [
    local("b1", "b", { confirmado_em: "2026-10-01", dias_santos: "horario_domingo" }),
    local("b2", "b", { confirmado_em: "2026-08-01", concelho: "Vizela" }),
  ]);
  await importar(entidade("a", "Paróquia A", ["a1", "a2"]), [
    local("a1", "a", { confirmado_em: "2026-11-01" }),
    local("a2", "a", { publicar: false }),
  ]);
});

describe("estadoDasParoquias", () => {
  it("confirmação mais antiga dos locais publicados, pendências e ordem pelo nome", async () => {
    const [a, b] = await estadoDasParoquias(bd);
    expect(a).toMatchObject({
      id: "a",
      locais: 2,
      publicados: 1,
      horarios: 2,
      // O local não publicado (nunca confirmado) não conta.
      confirmado_em: "2026-11-01",
      ultima_gravacao: null,
      sem_dias_santos: 1,
      concelho: "Guimarães",
      localidade: "Lugar a1",
    });
    expect(b).toMatchObject({ id: "b", confirmado_em: "2026-08-01", sem_dias_santos: 1 });
  });

  it("um local publicado nunca confirmado deixa a entidade sem confirmação", async () => {
    await alterar(local("b1", "b", { confirmado_em: null }), 1, new Date("2026-11-10T10:00:00Z"));
    const b = (await estadoDasParoquias(bd)).find((p) => p.id === "b");
    expect(b?.confirmado_em).toBeNull();
  });
});

describe("visaoGeral", () => {
  it("últimas gravações (sem a importação), com o nome de quem gravou e da entidade", async () => {
    await alterar(
      local("b1", "b", { confirmado_em: "2026-11-15" }),
      1,
      new Date("2026-11-15T09:00:00Z"),
    );
    await alterar(
      local("a1", "a", { confirmado_em: "2026-11-16" }),
      1,
      new Date("2026-11-16T09:00:00Z"),
      { contactoId: null, canal: "script", acao: "alteracao" },
    );
    const visao = await visaoGeral(bd, new Date("2026-11-17T12:00:00Z"));
    expect(visao.recentes.map((r) => [r.entidade.nome, r.acao, r.quem])).toEqual([
      ["Paróquia A", "alteracao", null],
      ["Paróquia B", "confirmacao", "Rita Teste"],
    ]);
    expect(visao.recentes[1]?.resumo).toEqual([
      { local: "b1", linhas: ["✅ Horários confirmados"] },
    ]);
    expect(visao.gravacoes30dias).toBe(2);
    expect(visao.paroquias.find((p) => p.id === "b")?.ultima_gravacao).toBe(
      "2026-11-15T09:00:00.000Z",
    );
  });

  it("só conta as gravações dos últimos 30 dias", async () => {
    await alterar(local("b1", "b"), 1, new Date("2026-09-01T09:00:00Z"));
    const visao = await visaoGeral(bd, new Date("2026-11-17T12:00:00Z"));
    expect(visao.gravacoes30dias).toBe(0);
    expect(visao.recentes).toHaveLength(1);
  });
});
