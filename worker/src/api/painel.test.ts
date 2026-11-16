import { beforeEach, describe, expect, it } from "vitest";
import { resumirPedido } from "@missas/dados";
import type { Local } from "@missas/horarios";
import { lerSessao } from "../sessao.ts";
import { comSessao, contacto, importar, novaBase, type D1Memoria } from "../teste-util.ts";
import { tratarApiPainel } from "./painel.ts";

const AGORA = new Date("2026-11-16T12:00:00Z");
const ORIGEM = "https://missas.exemplo.workers.dev";

const local = (id: string, entidade: string): Local =>
  ({
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.4, lon: -8.3 },
    publicar: true,
    dias_santos: null,
    horarios: [
      { tipo: "missa", dias: ["dom"], hora: "11:15" },
      { tipo: "missa", dias: ["sab"], hora: "19:00" },
    ],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
  }) as Local;

let mem: D1Memoria;
let bd: D1Database;
const cookies: Record<string, string> = {};

beforeEach(async () => {
  mem = novaBase();
  bd = mem.comoD1();
  for (const id of ["nespereira", "polvoreira"]) {
    await importar(
      bd,
      { id, tipo: "paroquia", nome: `Paróquia de ${id}`, diocese: "Braga", locais: [id] },
      [local(id, id) as never],
    );
  }
  cookies.admin = await comSessao(
    bd,
    contacto("c_aaaaaaaa", "admin@gmail.com", { perfil: "admin", entidades: [], funcao: "equipa" }),
    AGORA,
  );
  cookies.nespereira = await comSessao(bd, contacto("c_bbbbbbbb", "nespereira@gmail.com"), AGORA);
});

async function pedir(
  caminho: string,
  opcoes: {
    quem?: keyof typeof cookies | null;
    metodo?: string;
    corpo?: unknown;
    origem?: string;
    tipo?: string;
  } = {},
) {
  const cabecalhos: Record<string, string> = {};
  const quem = opcoes.quem === undefined ? "nespereira" : opcoes.quem;
  if (quem) cabecalhos.cookie = cookies[quem] ?? "";
  if (opcoes.metodo && opcoes.metodo !== "GET") {
    cabecalhos.origin = opcoes.origem ?? ORIGEM;
    cabecalhos["content-type"] = opcoes.tipo ?? "application/json";
  }
  const resposta = await tratarApiPainel(
    new Request(`${ORIGEM}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: cabecalhos,
      ...(opcoes.corpo !== undefined && { body: JSON.stringify(opcoes.corpo) }),
    }),
    { BD: bd },
    { agora: AGORA },
  );
  return {
    estado: resposta.status,
    corpo: (await resposta.json()) as Record<string, unknown> & unknown[],
  };
}

const gravarCorpo = (corpo: unknown, quem: keyof typeof cookies = "nespereira") =>
  pedir("/api/gravacoes", { metodo: "POST", corpo, quem });

function alteracao(id: string, mudar: (l: Local) => Local, versao = 1) {
  const antes = local(id, id);
  const depois = mudar(structuredClone(antes));
  return {
    tipo: "alteracao",
    entidade: id,
    locais: { [id]: { versao, dados: depois } },
    resumo: resumirPedido([{ antes, depois }]),
  };
}

describe("sessão e CSRF", () => {
  it("sem sessão: 401; escrita de outra origem ou sem JSON: recusada", async () => {
    expect((await pedir("/api/eu", { quem: null })).estado).toBe(401);
    expect(
      (await pedir("/api/gravacoes", { metodo: "POST", corpo: {}, origem: "https://evil.example" }))
        .estado,
    ).toBe(403);
    expect(
      (await pedir("/api/gravacoes", { metodo: "POST", corpo: {}, tipo: "text/plain" })).estado,
    ).toBe(415);
  });

  it("contacto suspenso deixa de ter sessão", async () => {
    mem.base.prepare("UPDATE contactos SET estado = 'suspenso' WHERE id = 'c_bbbbbbbb'").run();
    expect((await pedir("/api/eu")).estado).toBe(401);
  });
});

describe("leitura e âmbito", () => {
  it("/api/eu e /api/entidades: um contacto vê só as suas; o admin vê todas", async () => {
    expect((await pedir("/api/eu")).corpo).toMatchObject({
      id: "c_bbbbbbbb",
      perfil: "entidade",
      entidades: [{ id: "nespereira", nome: "Paróquia de nespereira" }],
    });
    expect(((await pedir("/api/entidades")).corpo as { id: string }[]).map((e) => e.id)).toEqual([
      "nespereira",
    ]);
    expect(
      ((await pedir("/api/entidades", { quem: "admin" })).corpo as { id: string }[]).map(
        (e) => e.id,
      ),
    ).toEqual(["nespereira", "polvoreira"]);
  });

  it("/api/entidades/:id: estado com versões; fora do âmbito 403; id inválido 400", async () => {
    expect((await pedir("/api/entidades/nespereira")).corpo).toMatchObject({
      entidade: { id: "nespereira" },
      versao: 1,
      locais: [{ local: { id: "nespereira" }, versao: 1 }],
    });
    expect((await pedir("/api/entidades/polvoreira")).estado).toBe(403);
    expect((await pedir("/api/entidades/Nesp%2e")).estado).toBe(400);
    expect((await pedir("/api/entidades/nao-existe", { quem: "admin" })).estado).toBe(404);
  });
});

describe("gravações", () => {
  it("alteração grava logo, com versão nova e histórico", async () => {
    const r = await gravarCorpo(
      alteracao("nespereira", (l) => ({ ...l, dias_santos: "horario_domingo" })),
    );
    expect(r).toMatchObject({ estado: 200, corpo: { ok: true, estado: "GRAVADO", gravacao: 3 } });
    expect((await pedir("/api/entidades/nespereira")).corpo).toMatchObject({
      locais: [{ versao: 2, local: { dias_santos: "horario_domingo" } }],
    });
    const historico = (await pedir("/api/entidades/nespereira/historico")).corpo as Record<
      string,
      unknown
    >[];
    expect(historico[0]).toMatchObject({
      id: 3,
      acao: "alteracao",
      contacto: { ref: "c_bbbbbbbb", funcao: "secretaria", nome: "Pessoa c_bbbbbbbb" },
    });
    expect(historico[1]).toMatchObject({ acao: "importacao", contacto: null });
  });

  it("CONFLITO (409) com versão desatualizada; nada é gravado", async () => {
    await gravarCorpo(alteracao("nespereira", (l) => ({ ...l, dias_santos: "horario_domingo" })));
    const r = await gravarCorpo(
      alteracao("nespereira", (l) => ({ ...l, dias_santos: "horario_proprio" })),
    );
    expect(r).toMatchObject({ estado: 409, corpo: { erro: "conflito" } });
    expect((await pedir("/api/entidades/nespereira/historico")).corpo).toHaveLength(2);
  });

  it("fora do âmbito (403), campos proibidos e dados inválidos (422), alertas (428)", async () => {
    expect((await gravarCorpo(alteracao("polvoreira", (l) => l))).estado).toBe(403);
    expect(
      (await gravarCorpo(alteracao("nespereira", (l) => ({ ...l, nome: "Outro" })))).corpo,
    ).toMatchObject({ erro: "invalido", motivo: expect.stringMatching(/campos não permitidos/) });
    const semHorarios = alteracao("nespereira", (l) => ({ ...l, horarios: [] }));
    expect(await gravarCorpo(semHorarios)).toMatchObject({
      estado: 428,
      corpo: { erro: "confirmar_alertas" },
    });
    expect((await gravarCorpo({ ...semHorarios, confirmar_alertas: true })).estado).toBe(200);
  });

  it("confirmação: confirmado_em de Lisboa e confirmado_por com o id opaco", async () => {
    const antes = local("nespereira", "nespereira");
    const r = await gravarCorpo({
      tipo: "confirmacao",
      entidade: "nespereira",
      base: { nespereira: 1 },
      resumo: resumirPedido([{ antes, depois: { ...antes, confirmado_em: "2026-11-16" } }]),
    });
    expect(r.estado).toBe(200);
    expect((await pedir("/api/entidades/nespereira")).corpo).toMatchObject({
      locais: [
        {
          local: {
            confirmado_em: "2026-11-16",
            confirmado_por: { canal: "painel", ref: "c_bbbbbbbb" },
          },
        },
      ],
    });
    expect(
      (await gravarCorpo({ tipo: "confirmacao", entidade: "nespereira", base: {}, resumo: [] }))
        .corpo,
    ).toMatchObject({
      estado: "sem_alteracoes",
    });
  });

  it("restauro: só admin; repõe o estado de uma gravação anterior como gravação nova", async () => {
    await gravarCorpo(alteracao("nespereira", (l) => ({ ...l, dias_santos: "horario_domingo" })));
    const versao = (await pedir("/api/entidades/nespereira/gravacoes/1", { quem: "admin" }))
      .corpo as unknown as {
      locais: { local: Local }[];
    };
    expect(versao.locais[0]?.local.dias_santos).toBeNull();
    const atual = local("nespereira", "nespereira");
    const corpo = {
      tipo: "restauro",
      entidade: "nespereira",
      restaura: 1,
      base: { entidade: 1, locais: { nespereira: 2 } },
      resumo: resumirPedido([
        { antes: { ...atual, dias_santos: "horario_domingo" }, depois: atual },
      ]),
    };
    expect((await gravarCorpo(corpo)).estado).toBe(403);
    expect((await gravarCorpo(corpo, "admin")).corpo).toMatchObject({ estado: "GRAVADO" });
    expect((await pedir("/api/entidades/nespereira")).corpo).toMatchObject({
      locais: [{ versao: 3, local: { dias_santos: null } }],
    });
    expect((await gravarCorpo({ ...corpo, restaura: 2 }, "admin")).estado).toBe(404);
  });

  it("corpo inválido (400) e grande demais (413)", async () => {
    expect((await gravarCorpo({ tipo: "apagar", entidade: "nespereira" })).corpo).toMatchObject({
      erro: "pedido",
    });
    expect(
      (await gravarCorpo({ tipo: "confirmacao", entidade: "nespereira", x: "y".repeat(70_000) }))
        .estado,
    ).toBe(413);
  });
});

describe("histórico", () => {
  it("um contacto não vê o nome de outras pessoas; o admin vê", async () => {
    const antes = local("nespereira", "nespereira");
    await gravarCorpo(
      {
        tipo: "confirmacao",
        entidade: "nespereira",
        base: {},
        resumo: resumirPedido([{ antes, depois: { ...antes, confirmado_em: "2026-11-16" } }]),
      },
      "admin",
    );
    const doContacto = (await pedir("/api/entidades/nespereira/historico")).corpo as {
      contacto: Record<string, unknown>;
    }[];
    expect(doContacto[0]?.contacto).toEqual({ ref: "c_aaaaaaaa", funcao: "equipa" });
    const doAdmin = (await pedir("/api/entidades/nespereira/historico", { quem: "admin" }))
      .corpo as { contacto: Record<string, unknown> }[];
    expect(doAdmin[0]?.contacto).toMatchObject({ nome: "Pessoa c_aaaaaaaa" });
  });
});

describe("acessos", () => {
  const novo = {
    nome: "Secretaria da Oliveira",
    email: "Oliveira@Gmail.com",
    funcao: "secretaria",
    perfil: "entidade",
    entidades: ["nespereira"],
    estado: "ativo",
    consentimento: { em: "2026-11-10", versao: "v1", meio: "papel" },
  };

  it("só admin; cria com e-mail em minúsculas; recusa e-mail repetido", async () => {
    expect((await pedir("/api/acessos")).estado).toBe(403);
    const r = await pedir("/api/acessos", { quem: "admin", metodo: "POST", corpo: novo });
    expect(r).toMatchObject({
      estado: 201,
      corpo: { email: "oliveira@gmail.com", entidades: ["nespereira"] },
    });
    expect(
      (await pedir("/api/acessos", { quem: "admin", metodo: "POST", corpo: novo })).estado,
    ).toBe(409);
    expect(((await pedir("/api/acessos", { quem: "admin" })).corpo as unknown[]).length).toBe(3);
  });

  it("mudar o e-mail (outra pessoa) termina as sessões abertas", async () => {
    const outraPessoa = { ...novo, email: "nova-secretaria@gmail.com" };
    expect(
      (await pedir("/api/acessos/c_bbbbbbbb", { quem: "admin", metodo: "PUT", corpo: outraPessoa }))
        .estado,
    ).toBe(200);
    const sessao = new Request(ORIGEM, { headers: { cookie: cookies.nespereira ?? "" } });
    expect(await lerSessao(bd, sessao, AGORA)).toBeNull();
  });

  it("suspender termina as sessões; ninguém se tira a si próprio; fica sempre um admin", async () => {
    const suspenso = { ...novo, email: "nespereira@gmail.com", estado: "suspenso" };
    expect(
      (await pedir("/api/acessos/c_bbbbbbbb", { quem: "admin", metodo: "PUT", corpo: suspenso }))
        .estado,
    ).toBe(200);
    const sessao = new Request(ORIGEM, { headers: { cookie: cookies.nespereira ?? "" } });
    expect(await lerSessao(bd, sessao, AGORA)).toBeNull();
    const eu = { ...novo, email: "admin@gmail.com", perfil: "entidade" };
    expect(
      (await pedir("/api/acessos/c_aaaaaaaa", { quem: "admin", metodo: "PUT", corpo: eu })).corpo,
    ).toMatchObject({ erro: "proprio" });
    expect(
      (await pedir("/api/acessos/c_zzzzzzzz", { quem: "admin", metodo: "PUT", corpo: novo }))
        .estado,
    ).toBe(400);
  });
});
