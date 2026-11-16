import { beforeEach, describe, expect, it } from "vitest";
import type { Entidade, Local } from "@missas/horarios";
import MIGRACAO from "../migracoes/0001_inicial.sql?raw";
import {
  ConflitoDeVersao,
  estadoNaGravacao,
  gravar,
  historicoDaEntidade,
  lerEstado,
  lerTudo,
  versaoDados,
} from "./bd.ts";
import { D1Memoria } from "./teste-d1.ts";

const local = (id: string, entidade: string, hora = "10:00"): Local =>
  ({
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [{ tipo: "missa", dias: ["dom"], hora }],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
  }) as Local;

const entidade = (id: string, locais: string[]): Entidade =>
  ({ id, tipo: "paroquia", nome: `Paróquia ${id}`, diocese: "Braga", locais }) as Entidade;

let mem: D1Memoria;
let bd: D1Database;

async function importar() {
  return gravar(bd, {
    entidadeId: "exemplo",
    acao: "importacao",
    contactoId: null,
    canal: null,
    resumo: [],
    alertas: [],
    entidade: { dados: entidade("exemplo", ["igreja-a"]), versaoAnterior: null },
    locais: [{ dados: local("igreja-a", "exemplo"), versaoAnterior: null }],
  });
}

beforeEach(() => {
  mem = new D1Memoria([MIGRACAO]);
  bd = mem.comoD1();
});

describe("gravar", () => {
  it("importação: cria a entidade, os locais, a gravação e a versão 1", async () => {
    const id = await importar();
    expect(id).toBe(1);
    const estado = await lerEstado(bd, "exemplo");
    expect(estado?.entidade.versao).toBe(1);
    expect(estado?.locais.get("igreja-a")).toMatchObject({ versao: 1, dados: { id: "igreja-a" } });
    expect(await versaoDados(bd)).toBe(2);
  });

  it("alteração: versão nova, gravação com resumo e contacto, contador atualizado", async () => {
    await importar();
    const id = await gravar(bd, {
      entidadeId: "exemplo",
      acao: "alteracao",
      contactoId: "c_7f3a",
      canal: "painel",
      resumo: [{ local: "igreja-a", linhas: ["x"] }],
      alertas: ["y"],
      locais: [{ dados: local("igreja-a", "exemplo", "11:00"), versaoAnterior: 1 }],
    });
    expect(id).toBe(2);
    const estado = await lerEstado(bd, "exemplo");
    expect(estado?.locais.get("igreja-a")).toMatchObject({ versao: 2 });
    expect(await historicoDaEntidade(bd, "exemplo")).toMatchObject([
      {
        id: 2,
        acao: "alteracao",
        contacto_id: "c_7f3a",
        resumo: [{ local: "igreja-a" }],
        alertas: ["y"],
      },
      { id: 1, acao: "importacao" },
    ]);
    expect(await versaoDados(bd)).toBe(3);
  });

  it("conflito: versão desatualizada anula a transação inteira", async () => {
    await importar();
    const alteracao = {
      entidadeId: "exemplo",
      acao: "alteracao" as const,
      contactoId: "c_1",
      canal: "painel",
      resumo: [],
      alertas: [],
      locais: [{ dados: local("igreja-a", "exemplo", "11:00"), versaoAnterior: 1 }],
    };
    await gravar(bd, alteracao);
    await expect(gravar(bd, alteracao)).rejects.toBeInstanceOf(ConflitoDeVersao);
    expect(await historicoDaEntidade(bd, "exemplo")).toHaveLength(2);
    expect((await lerEstado(bd, "exemplo"))?.locais.get("igreja-a")?.versao).toBe(2);
  });

  it("conflito: um local 'novo' que já existe", async () => {
    await importar();
    await expect(
      gravar(bd, {
        entidadeId: "exemplo",
        acao: "novo-local",
        contactoId: "c_1",
        canal: "painel",
        resumo: [],
        alertas: [],
        locais: [{ dados: local("igreja-a", "exemplo"), versaoAnterior: null }],
      }),
    ).rejects.toBeInstanceOf(ConflitoDeVersao);
  });

  it("o histórico não se altera nem se apaga", async () => {
    await importar();
    await expect(mem.exec("UPDATE versoes SET dados = '{}'")).rejects.toThrow(/histórico/);
    await expect(mem.exec("DELETE FROM versoes")).rejects.toThrow(/histórico/);
    await expect(mem.exec("UPDATE gravacoes SET acao = 'restauro'")).rejects.toThrow(/histórico/);
    await expect(mem.exec("DELETE FROM gravacoes")).rejects.toThrow(/histórico/);
  });
});

describe("leituras", () => {
  it("lerTudo devolve entidades e locais; lerEstado inclui outros locais pedidos", async () => {
    await importar();
    await gravar(bd, {
      entidadeId: "outra",
      acao: "importacao",
      contactoId: null,
      canal: null,
      resumo: [],
      alertas: [],
      entidade: { dados: entidade("outra", ["igreja-c"]), versaoAnterior: null },
      locais: [{ dados: local("igreja-c", "outra"), versaoAnterior: null }],
    });
    const tudo = await lerTudo(bd);
    expect(tudo.entidades.map((e) => e.id)).toEqual(["exemplo", "outra"]);
    expect(tudo.locais.map((l) => l.id)).toEqual(["igreja-a", "igreja-c"]);
    const estado = await lerEstado(bd, "exemplo", ["igreja-c", "nao-existe"]);
    expect([...(estado?.locais.keys() ?? [])].sort()).toEqual(["igreja-a", "igreja-c"]);
    expect(await lerEstado(bd, "nao-existe")).toBeNull();
  });

  it("estadoNaGravacao: a última versão de cada registo até essa gravação", async () => {
    await importar();
    const segunda = await gravar(bd, {
      entidadeId: "exemplo",
      acao: "alteracao",
      contactoId: "c_1",
      canal: "painel",
      resumo: [],
      alertas: [],
      locais: [{ dados: local("igreja-a", "exemplo", "11:00"), versaoAnterior: 1 }],
    });
    await gravar(bd, {
      entidadeId: "exemplo",
      acao: "alteracao",
      contactoId: "c_1",
      canal: "painel",
      resumo: [],
      alertas: [],
      locais: [{ dados: local("igreja-a", "exemplo", "12:00"), versaoAnterior: 2 }],
    });
    const naPrimeira = await estadoNaGravacao(bd, "exemplo", 1);
    expect(naPrimeira?.locais.get("igreja-a")?.horarios[0]?.hora).toBe("10:00");
    const naSegunda = await estadoNaGravacao(bd, "exemplo", segunda);
    expect(naSegunda?.locais.get("igreja-a")?.horarios[0]?.hora).toBe("11:00");
    expect(await estadoNaGravacao(bd, "outra", 1)).toBeNull();
    expect(await estadoNaGravacao(bd, "exemplo", 99)).toBeNull();
  });
});
