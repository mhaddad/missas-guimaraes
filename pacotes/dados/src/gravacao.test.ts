import { describe, expect, it } from "vitest";
import type { Entidade, Local } from "@missas/horarios";
import {
  lerPedidoGravacao,
  prepararGravacao,
  type EstadoEntidade,
  type OpcoesGravacao,
  type PedidoGravacao,
  type Registo,
} from "./gravacao.ts";
import { contactosDe, resumirContactos } from "./contactos.ts";
import { alertasDeAnomalia, resumirPedido } from "./resumo.ts";

const AGORA = new Date("2026-11-30T11:45:00Z");
const OPCOES: OpcoesGravacao = { agora: AGORA, contacto: { ref: "c_7f3a", canal: "painel" } };

function local(id: string, entidade: string, sobre: Partial<Local> = {}): Local {
  return {
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [
      { tipo: "missa", dias: ["dom"], hora: "10:00" },
      { tipo: "missa", dias: ["sab"], hora: "19:00" },
    ],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
    ...sobre,
  } as Local;
}

const entidade = (id: string, locais: string[]): Entidade =>
  ({ id, tipo: "paroquia", nome: `Paróquia ${id}`, diocese: "Braga", locais }) as Entidade;

function estado(
  extra: [string, Registo<Local>][] = [],
  ent: Registo<Entidade> = { dados: entidade("exemplo", ["igreja-a", "capela-b"]), versao: 4 },
): EstadoEntidade {
  return {
    entidade: ent,
    locais: new Map([
      ["igreja-a", { dados: local("igreja-a", "exemplo"), versao: 7 }],
      ["capela-b", { dados: local("capela-b", "exemplo"), versao: 2 }],
      ...extra,
    ]),
  };
}

function alteracao(id: string, mudar: (l: Local) => Local, versao = 7): PedidoGravacao {
  const antes = local(id, "exemplo");
  const depois = mudar(structuredClone(antes));
  return {
    tipo: "alteracao",
    entidade: "exemplo",
    locais: { [id]: { versao, dados: depois as unknown as Record<string, unknown> } },
    resumo: resumirPedido([{ antes, depois }]),
  };
}

const pronto = (r: ReturnType<typeof prepararGravacao>) => {
  if (r.estado !== "pronto") throw new Error(JSON.stringify(r));
  return r;
};

describe("lerPedidoGravacao", () => {
  it("aceita os quatro tipos", () => {
    expect(lerPedidoGravacao({ tipo: "confirmacao", entidade: "x", base: { a: 1 } })).toMatchObject(
      { tipo: "confirmacao" },
    );
    expect(
      lerPedidoGravacao({ tipo: "alteracao", entidade: "x", locais: { a: { versao: 1, dados: {} } } }),
    ).toMatchObject({ tipo: "alteracao" });
    expect(
      lerPedidoGravacao({ tipo: "novo-local", entidade: "x", versaoEntidade: 0, local: {} }),
    ).toMatchObject({ tipo: "novo-local" });
    expect(
      lerPedidoGravacao({
        tipo: "restauro",
        entidade: "x",
        restaura: 3,
        base: { entidade: 1, locais: { a: 2 } },
        confirmar_alertas: true,
      }),
    ).toMatchObject({ tipo: "restauro", restaura: 3 });
  });

  it.each([
    ["não objeto", [], "corpo"],
    ["tipo", { tipo: "apagar", entidade: "x" }, "tipo"],
    ["entidade", { tipo: "confirmacao", entidade: "../x" }, "entidade"],
    ["campo a mais", { tipo: "confirmacao", entidade: "x", contacto: "c_1" }, "campos"],
    ["base com versão negativa", { tipo: "confirmacao", entidade: "x", base: { a: -1 } }, "base"],
    ["base com id inválido", { tipo: "confirmacao", entidade: "x", base: { "A/b": 1 } }, "base"],
    ["alteração sem locais", { tipo: "alteracao", entidade: "x", locais: {} }, "locais"],
    [
      "alteração com campo a mais",
      { tipo: "alteracao", entidade: "x", locais: { a: { versao: 1, dados: {}, sha: "x" } } },
      "locais",
    ],
    ["novo local sem versão", { tipo: "novo-local", entidade: "x", local: {} }, "versaoEntidade"],
    [
      "restauro sem gravação",
      { tipo: "restauro", entidade: "x", base: { entidade: 1, locais: {} } },
      "restaura",
    ],
    ["resumo mal formado", { tipo: "confirmacao", entidade: "x", resumo: [{ local: 1 }] }, "resumo"],
  ])("recusa: %s", (_caso, corpo, motivo) => {
    expect(lerPedidoGravacao(corpo)).toBe(motivo);
  });
});

describe("alteracao", () => {
  it("devolve só o local alterado, com o resumo do motor", () => {
    const p = alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }));
    const r = pronto(prepararGravacao(p, estado(), OPCOES));
    expect([...r.locais.keys()]).toEqual(["igreja-a"]);
    expect(r.entidade).toBeUndefined();
    expect(r.resumo).toEqual(p.resumo);
  });

  it("CONFLITO se a versão já não é a atual", () => {
    const p = alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }), 6);
    expect(prepararGravacao(p, estado(), OPCOES)).toMatchObject({ estado: "CONFLITO" });
  });

  it.each([
    ["nome", (l: Local) => ({ ...l, nome: "Outro" })],
    ["publicar", (l: Local) => ({ ...l, publicar: false })],
    ["entidade", (l: Local) => ({ ...l, entidade: "outra" })],
    ["revisao", (l: Local) => ({ ...l, revisao: { pendente: true, motivos: ["x"] } })],
    ["confirmado_em", (l: Local) => ({ ...l, confirmado_em: "2026-11-01" })],
    [
      "confirmado_por",
      (l: Local) => ({ ...l, confirmado_por: { canal: "moderacao" as const, ref: "c_0000" } }),
    ],
  ])("recusa mudar %s", (_campo, mudar) => {
    expect(prepararGravacao(alteracao("igreja-a", mudar), estado(), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/campos não permitidos/),
    });
  });

  it("recusa locais de outra entidade (âmbito)", () => {
    const outra: [string, Registo<Local>] = ["igreja-c", { dados: local("igreja-c", "outra"), versao: 1 }];
    const p = alteracao("igreja-c", (l) => ({ ...l, entidade: "exemplo", horarios: [] }), 1);
    expect(prepararGravacao(p, estado([outra]), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/âmbito/),
    });
  });

  it("recusa dados inválidos e resumos que não coincidem", () => {
    const invalida = alteracao("igreja-a", (l) => ({
      ...l,
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "25:00" }],
    }));
    expect(prepararGravacao(invalida, estado(), OPCOES)).toMatchObject({ estado: "ERRO" });
    const p = alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }));
    expect(
      prepararGravacao({ ...p, resumo: [{ local: "igreja-a", linhas: ["x"] }] }, estado(), OPCOES),
    ).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/resumo/) });
  });

  it("sem_alteracoes quando nada muda", () => {
    expect(prepararGravacao(alteracao("igreja-a", (l) => l), estado(), OPCOES)).toEqual({
      estado: "sem_alteracoes",
    });
  });

  it("muda a imagem de capa enviada pelo painel, com o resumo próprio", () => {
    const url = `/fotos/${"a".repeat(64)}.webp`;
    const p = alteracao("igreja-a", (l) => ({ ...l, foto: { url, alt: "Fachada", credito: "Paróquia" } }));
    const r = pronto(prepararGravacao(p, estado(), OPCOES));
    expect(r.locais.get("igreja-a")?.foto).toEqual({ url, alt: "Fachada", credito: "Paróquia" });
    expect(r.resumo).toEqual([{ local: "igreja-a", linhas: ["🖼️ Imagem de capa adicionada"] }]);
  });

  it.each([
    ["um endereço de fora", { url: "https://exemplo.pt/igreja.jpg" }],
    ["outro caminho do site", { url: "/admin/x.webp" }],
    ["um caminho de fotos sem hash", { url: "/fotos/../x.webp" }],
    ["campos a mais", { url: `/fotos/${"b".repeat(64)}.jpg`, largura: 10 }],
    ["textos longos", { url: `/fotos/${"b".repeat(64)}.jpg`, credito: "x".repeat(301) }],
  ])("recusa uma imagem de capa com %s", (_caso, foto) => {
    const p = alteracao("igreja-a", (l) => ({ ...l, foto }) as Local);
    expect(prepararGravacao(p, estado(), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/imagem de capa/),
    });
  });

  it("retira a imagem de capa", () => {
    const url = `/fotos/${"c".repeat(64)}.jpg`;
    const comFoto = local("igreja-a", "exemplo", { foto: { url } });
    const atual = estado([["igreja-a", { dados: comFoto, versao: 7 }]]);
    const depois = { ...comFoto, foto: null };
    const p: PedidoGravacao = {
      tipo: "alteracao",
      entidade: "exemplo",
      locais: { "igreja-a": { versao: 7, dados: depois as unknown as Record<string, unknown> } },
      resumo: resumirPedido([{ antes: comFoto, depois }]),
    };
    const r = pronto(prepararGravacao(p, atual, OPCOES));
    expect(r.resumo).toEqual([{ local: "igreja-a", linhas: ["🖼️ Imagem de capa retirada"] }]);
  });

  it("um administrador esconde e volta a mostrar um local no site", () => {
    const ADMIN = { ...OPCOES, admin: true };
    const esconder = pronto(
      prepararGravacao(alteracao("igreja-a", (l) => ({ ...l, publicar: false })), estado(), ADMIN),
    );
    expect(esconder.locais.get("igreja-a")?.publicar).toBe(false);
    expect(esconder.resumo).toEqual([{ local: "igreja-a", linhas: ["🚫 Escondido do site"] }]);

    const escondido = estado([
      ["igreja-a", { dados: local("igreja-a", "exemplo", { publicar: false }), versao: 7 }],
    ]);
    const antes = local("igreja-a", "exemplo", { publicar: false });
    const depois = { ...antes, publicar: true };
    const mostrar = pronto(
      prepararGravacao(
        {
          tipo: "alteracao",
          entidade: "exemplo",
          locais: { "igreja-a": { versao: 7, dados: depois as unknown as Record<string, unknown> } },
          resumo: resumirPedido([{ antes, depois }]),
        },
        escondido,
        ADMIN,
      ),
    );
    expect(mostrar.resumo).toEqual([{ local: "igreja-a", linhas: ["👁️ Volta a aparecer no site"] }]);
  });

  it("publicar só por um administrador; os outros campos fixos continuam fixos para ele", () => {
    const esconder = alteracao("igreja-a", (l) => ({ ...l, publicar: false }));
    for (const opcoes of [OPCOES, { ...OPCOES, admin: false }])
      expect(prepararGravacao(esconder, estado(), opcoes)).toMatchObject({
        estado: "ERRO",
        motivo: expect.stringMatching(/campos não permitidos: publicar/),
      });
    const ADMIN = { ...OPCOES, admin: true };
    for (const mudar of [
      (l: Local) => ({ ...l, nome: "Outro" }),
      (l: Local) => ({ ...l, entidade: "outra" }),
      (l: Local) => ({ ...l, confirmado_em: "2026-11-01" }),
    ])
      expect(prepararGravacao(alteracao("igreja-a", mudar), estado(), ADMIN)).toMatchObject({
        estado: "ERRO",
        motivo: expect.stringMatching(/campos não permitidos/),
      });
  });

  it("a entidade do pedido tem de ser a do estado", () => {
    const p = { ...alteracao("igreja-a", (l) => l), entidade: "outra" };
    expect(prepararGravacao(p, estado(), OPCOES)).toEqual({ estado: "ERRO", motivo: "entidade" });
  });
});

describe("alteracao: morada, localização e notas", () => {
  it("grava a morada, a localização e as notas, com o resumo próprio", () => {
    const p = alteracao("igreja-a", (l) => ({
      ...l,
      morada: "Largo da Igreja, 1",
      codigo_postal: "4800-001",
      geo: { lat: 41.4405, lon: -8.2905 },
      notas: ["Missa com coro ao 1.º domingo"],
    }));
    const r = pronto(prepararGravacao(p, estado(), OPCOES));
    expect(r.resumo[0]?.linhas).toEqual([
      "📮 Código postal: — → 4800-001",
      "📍 Localização no mapa alterada",
      "📍 Morada: — → Largo da Igreja, 1",
      "📝 Notas alteradas",
    ]);
    expect(r.alertas).toEqual([]);
  });

  it("recusa textos inválidos e coordenadas fora da região", () => {
    expect(
      prepararGravacao(alteracao("igreja-a", (l) => ({ ...l, morada: "Rua\nNova" })), estado(), OPCOES),
    ).toMatchObject({ estado: "ERRO", motivo: "morada inválido" });
    expect(
      prepararGravacao(
        alteracao("igreja-a", (l) => ({ ...l, geo: { lat: 38.7, lon: -9.1 } })),
        estado(),
        OPCOES,
      ),
    ).toMatchObject({ estado: "ERRO", motivo: "os dados não passam a validação" });
  });

  it("mudar a localização mais de 1 km é um alerta de anomalia", () => {
    const p = alteracao("igreja-a", (l) => ({ ...l, geo: { lat: 41.46, lon: -8.29 } }));
    expect(pronto(prepararGravacao(p, estado(), OPCOES)).alertas).toEqual([
      "Igreja igreja-a: a localização no mapa muda 2,2 km.",
    ]);
  });
});

describe("contactos", () => {
  const novos = {
    responsaveis: ["Pe. João Silva (pároco)"],
    telefones_publicos: ["253 123 456"],
    email: "paroquia@exemplo.pt",
    site: "https://paroquia.pt/",
  };
  const pedido = (contactos: Record<string, unknown> = novos, versaoEntidade = 4): PedidoGravacao => ({
    tipo: "contactos",
    entidade: "exemplo",
    versaoEntidade,
    contactos,
    resumo: resumirContactos(
      "exemplo",
      contactosDe(entidade("exemplo", [])),
      contactos as unknown as ReturnType<typeof contactosDe>,
    ),
  });

  it("lê só os quatro campos", () => {
    expect(lerPedidoGravacao({ ...pedido(), confirmar_alertas: true })).toMatchObject({
      tipo: "contactos",
    });
    expect(lerPedidoGravacao({ ...pedido(), locais: {} })).toBe("campos");
    expect(lerPedidoGravacao({ ...pedido({ ...novos, nome: "Outra" }) })).toBe("contactos");
    const { site: _site, ...semSite } = novos;
    expect(lerPedidoGravacao(pedido(semSite))).toBe("contactos");
    expect(lerPedidoGravacao({ ...pedido(), versaoEntidade: -1 })).toBe("versaoEntidade");
  });

  it("muda só os contactos da entidade, com o resumo próprio", () => {
    const r = pronto(prepararGravacao(pedido(), estado(), OPCOES));
    expect(r.entidade).toEqual({ ...entidade("exemplo", ["igreja-a", "capela-b"]), ...novos });
    expect(r.locais.size).toBe(0);
    expect(r.resumo).toEqual([
      {
        local: "exemplo",
        linhas: [
          "👤 Responsáveis: — → Pe. João Silva (pároco)",
          "📞 Telefones: — → 253 123 456",
          "✉️ E-mail: — → paroquia@exemplo.pt",
          "🌐 Site: — → https://paroquia.pt/",
        ],
      },
    ]);
  });

  it("CONFLITO com a versão antiga; ERRO com contactos fora da forma canónica", () => {
    expect(prepararGravacao(pedido(novos, 3), estado(), OPCOES)).toMatchObject({
      estado: "CONFLITO",
    });
    for (const mau of [
      { ...novos, site: "javascript:alert(1)" },
      { ...novos, telefones_publicos: ["253123456"] },
      { ...novos, email: "a@b" },
      { ...novos, responsaveis: ["<b>x</b>\n"] },
    ])
      expect(prepararGravacao(pedido(mau), estado(), OPCOES)).toMatchObject({ estado: "ERRO" });
  });

  it("recusa um resumo que não coincide", () => {
    expect(prepararGravacao({ ...pedido(), resumo: [] }, estado(), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: "o resumo não coincide com as alterações",
    });
  });
});

describe("confirmacao", () => {
  it("escreve confirmado_em (dia de Lisboa) e confirmado_por em todos os locais", () => {
    const pares = ["capela-b", "igreja-a"].map((id) => {
      const antes = local(id, "exemplo");
      return { antes, depois: { ...antes, confirmado_em: "2026-11-30" } };
    });
    const r = pronto(
      prepararGravacao(
        { tipo: "confirmacao", entidade: "exemplo", base: { "igreja-a": 7 }, resumo: resumirPedido(pares) },
        estado(),
        { ...OPCOES, contacto: { ref: "c_7f3a", canal: "email" } },
      ),
    );
    expect(r.locais.get("igreja-a")).toMatchObject({
      confirmado_em: "2026-11-30",
      confirmado_por: { canal: "email", ref: "c_7f3a" },
    });
  });

  it("CONFLITO se um local visto mudou ou desapareceu", () => {
    const p: PedidoGravacao = { tipo: "confirmacao", entidade: "exemplo", base: { "igreja-a": 1 }, resumo: [] };
    expect(prepararGravacao(p, estado(), OPCOES)).toMatchObject({ estado: "CONFLITO" });
    expect(
      prepararGravacao({ ...p, base: { "nao-existe": 1 } }, estado(), OPCOES),
    ).toMatchObject({ estado: "CONFLITO", motivo: expect.stringMatching(/deixou/) });
  });
});

describe("novo-local", () => {
  const novo = local("capela-nova", "exemplo");
  const pedido = (sobre: Partial<Local> = {}, versaoEntidade = 4): PedidoGravacao => {
    const l = { ...novo, ...sobre };
    return {
      tipo: "novo-local",
      entidade: "exemplo",
      versaoEntidade,
      local: l as unknown as Record<string, unknown>,
      resumo: resumirPedido([{ antes: null, depois: l as Local }]),
    };
  };

  it("cria o local e acrescenta-o à entidade", () => {
    const r = pronto(prepararGravacao(pedido(), estado(), OPCOES));
    expect(r.entidade?.locais).toEqual(["igreja-a", "capela-b", "capela-nova"]);
    expect([...r.locais.keys()]).toEqual(["capela-nova"]);
  });

  it.each([
    ["de outra entidade", { entidade: "outra" }, /pertencer/],
    ["já confirmado", { confirmado_em: "2026-11-01" }, /sem confirmação/],
    ["sem id válido", { id: "Nova Capela" }, /id/],
  ])("recusa: %s", (_caso, sobre, motivo) => {
    expect(prepararGravacao(pedido(sobre as Partial<Local>), estado(), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(motivo),
    });
  });

  it("recusa um novo local com uma imagem de capa de fora do painel", () => {
    const novo = {
      ...local("capela-nova", "exemplo"),
      foto: { url: "https://exemplo.pt/igreja.jpg" },
    };
    const p: PedidoGravacao = {
      tipo: "novo-local",
      entidade: "exemplo",
      versaoEntidade: 4,
      local: novo as unknown as Record<string, unknown>,
      resumo: resumirPedido([{ antes: null, depois: novo as Local }]),
    };
    expect(prepararGravacao(p, estado(), OPCOES)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/imagem de capa/),
    });
  });

  it("CONFLITO se o id já existe ou a entidade mudou", () => {
    const existente: [string, Registo<Local>] = ["capela-nova", { dados: local("capela-nova", "outra"), versao: 1 }];
    expect(prepararGravacao(pedido(), estado([existente]), OPCOES)).toMatchObject({ estado: "CONFLITO" });
    expect(prepararGravacao(pedido({}, 3), estado(), OPCOES)).toMatchObject({ estado: "CONFLITO" });
  });
});

describe("restauro", () => {
  const base = { entidade: 4, locais: { "igreja-a": 7, "capela-b": 2 } };
  const antigoA = local("igreja-a", "exemplo", { horarios: [{ tipo: "missa", dias: ["dom"], hora: "09:00" }] });
  const alvo = {
    entidade: entidade("exemplo", ["igreja-a", "capela-b"]),
    locais: new Map([
      ["igreja-a", antigoA],
      ["capela-b", local("capela-b", "exemplo")],
    ]),
  };
  const pedido: PedidoGravacao = {
    tipo: "restauro",
    entidade: "exemplo",
    restaura: 12,
    base,
    resumo: resumirPedido([{ antes: local("igreja-a", "exemplo"), depois: antigoA }]),
  };

  it("repõe só o que mudou desde essa gravação", () => {
    const r = pronto(prepararGravacao(pedido, estado(), { ...OPCOES, alvo }));
    expect([...r.locais.keys()]).toEqual(["igreja-a"]);
    expect(r.locais.get("igreja-a")?.horarios).toEqual([{ tipo: "missa", dias: ["dom"], hora: "09:00" }]);
  });

  it("recusa sem a versão a repor, com versões desatualizadas e fora do âmbito", () => {
    expect(prepararGravacao(pedido, estado(), OPCOES)).toMatchObject({ estado: "ERRO" });
    expect(
      prepararGravacao({ ...pedido, base: { ...base, entidade: 3 } }, estado(), { ...OPCOES, alvo }),
    ).toMatchObject({ estado: "CONFLITO" });
    expect(
      prepararGravacao({ ...pedido, base: { ...base, locais: { "igreja-a": 6, "capela-b": 2 } } }, estado(), {
        ...OPCOES,
        alvo,
      }),
    ).toMatchObject({ estado: "CONFLITO" });
    const alvoOutro = { ...alvo, locais: new Map([...alvo.locais, ["igreja-a", local("igreja-a", "outra")]]) };
    expect(prepararGravacao(pedido, estado(), { ...OPCOES, alvo: alvoOutro })).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/âmbito/),
    });
    const semLocal = { ...alvo, locais: new Map([["igreja-a", antigoA]]) };
    expect(prepararGravacao(pedido, estado(), { ...OPCOES, alvo: semLocal })).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não tem versão/),
    });
  });
});

it("os alertas de anomalia vêm do motor", () => {
  const p = alteracao("igreja-a", (l) => ({ ...l, horarios: [] }));
  const r = pronto(prepararGravacao(p, estado(), OPCOES));
  expect(r.alertas).toEqual(
    alertasDeAnomalia([{ antes: local("igreja-a", "exemplo"), depois: { ...local("igreja-a", "exemplo"), horarios: [] } }]),
  );
  expect(r.alertas[0]).toMatch(/sem nenhum horário/);
});
