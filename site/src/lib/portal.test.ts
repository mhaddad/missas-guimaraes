import { describe, expect, it } from "vitest";
import { prepararCalendario, type Calendario, type Regra } from "@missas/horarios";
import en from "../i18n/en.json";
import es from "../i18n/es.json";
import pt from "../i18n/pt-PT.json";
import { formatar, plural } from "../i18n/index.ts";
import { blocosHorario, descreverExcecao, notasDoLocal } from "./detalhe.ts";
import { formatarDiaCurto } from "./formatos.ts";
import {
  celebracoesDoDia,
  correspondePesquisa,
  dataDaEscolha,
  escreverEstado,
  ESTADO_INICIAL,
  filtrarLocais,
  lerEstado,
  ligacaoMapa,
  minutosAte,
  normalizar,
  periodo,
  proximasSolenidades,
  selo,
  type LocalPortal,
} from "./portal.ts";
import { textoSelo } from "./selo.ts";

const calendarioBase: Calendario = {
  dias_santos_de_preceito: {
    estado: "documentado",
    regras: [{ id: "imaculada-conceicao", nome: "Imaculada Conceição", data: "12-08" }],
  },
  anos: {
    "2026": {
      dias_santos: { "imaculada-conceicao": "2026-12-08" },
      moveis: { advento_1_domingo: "2026-11-29" },
      hora_legal: { inicio_verao: "2026-03-29", inicio_inverno: "2026-10-25" },
    },
  },
};
const calendario = prepararCalendario(calendarioBase);

function local(id: string, horarios: Regra[], extra: Partial<LocalPortal> = {}): LocalPortal {
  return {
    id,
    nome: `Igreja de ${id}`,
    localidade: id,
    freguesia: null,
    concelho: "Guimarães",
    orago: null,
    morada: null,
    geo: { lat: 41.44, lon: -8.29 },
    dias_santos: "horario_habitual",
    horarios,
    excecoes: [],
    confirmado_em: null,
    entidade: { id, nome: `Paróquia de ${id}`, tipo: "paroquia", telefones: [] },
    pesquisa: normalizar(`Igreja de ${id} ${id}`),
    ...extra,
  };
}

describe("textos", () => {
  it("os três idiomas têm as mesmas chaves", () => {
    const chaves = (o: object, prefixo = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" ? chaves(v as object, `${prefixo}${k}.`) : [`${prefixo}${k}`],
      );
    expect(chaves(en).sort()).toEqual(chaves(pt).sort());
    expect(chaves(es).sort()).toEqual(chaves(pt).sort());
  });

  it("plurais e substituições", () => {
    expect(plural("pt-PT", pt.aindaHoje, 1)).toBe("1 celebração ainda hoje");
    expect(plural("en", en.aindaHoje, 3)).toBe("3 more services today");
    expect(formatar("{a} e {b}", { a: 1 })).toBe("1 e {b}");
  });
});

describe("pesquisa e filtros", () => {
  it("sem acentos nem maiúsculas, todos os termos", () => {
    const l = local("x", [], { pesquisa: normalizar("Igreja de São Dâmaso Guimarães") });
    expect(correspondePesquisa(l, "sao DAMASO")).toBe(true);
    expect(correspondePesquisa(l, "damaso vizela")).toBe(false);
    expect(correspondePesquisa(l, "  ")).toBe(true);
  });

  it("concelho", () => {
    const g = local("g", []);
    const v = local("v", [], { concelho: "Vizela" });
    expect(filtrarLocais([g, v], { concelho: "vizela", q: "" })).toEqual([v]);
    expect(filtrarLocais([g, v], { concelho: "guimaraes", q: "" })).toEqual([g]);
    expect(filtrarLocais([g, v], { concelho: "todos", q: "" })).toHaveLength(2);
  });
});

describe("estado na query string", () => {
  it("ida e volta, e valores inválidos voltam ao inicial", () => {
    const estado = {
      dia: "2026-12-08",
      concelho: "vizela",
      q: "penha",
      vista: "igreja",
      tipo: "confissoes",
    } as const;
    const texto = escreverEstado(estado);
    expect(texto).toBe("?dia=2026-12-08&concelho=vizela&q=penha&vista=igreja&tipo=confissoes");
    expect(lerEstado(texto)).toEqual(estado);
    expect(escreverEstado(ESTADO_INICIAL)).toBe("");
    expect(lerEstado("?dia=ontem&concelho=braga&vista=mapa&tipo=x")).toEqual(ESTADO_INICIAL);
  });

  it("datas da escolha", () => {
    expect(dataDaEscolha("hoje", "2026-11-07")).toBe("2026-11-07");
    expect(dataDaEscolha("amanha", "2026-11-07")).toBe("2026-11-08");
    expect(dataDaEscolha("domingo", "2026-11-07")).toBe("2026-11-08");
    expect(dataDaEscolha("domingo", "2026-11-08")).toBe("2026-11-15");
  });
});

describe("selo (§6.6)", () => {
  it.each([
    [null, "importado", -1],
    ["2026-11-08", "confirmadoHoje", 0],
    ["2026-09-24", "confirmado", 45],
    ["2026-09-23", "aConfirmar", 46],
    ["2026-07-11", "aConfirmar", 120],
    ["2026-07-10", "antigo", 121],
  ] as const)("%s → %s", (data, estado, dias) => {
    expect(selo(data, "2026-11-08")).toEqual({ estado, dias });
  });

  it("textos longos", () => {
    expect(textoSelo("pt-PT", "longo", "confirmado", 12, "2026-10-27", "paroquia")).toBe(
      "Confirmado pela paróquia há 12 dias",
    );
    expect(textoSelo("pt-PT", "longo", "confirmadoHoje", 0, "2026-11-08", "santuario")).toBe(
      "Confirmado pelo santuário hoje",
    );
    expect(textoSelo("pt-PT", "longo", "aConfirmar", 90, "2026-07-03", "paroquia")).toBe(
      "Confirmado em 3 de julho de 2026",
    );
    expect(textoSelo("en", "longo", "antigo", 200, "2026-01-01", "irmandade")).toBe(
      "Not recently confirmed — please check with the brotherhood",
    );
    expect(textoSelo("es", "longo", "importado", -1, null, "paroquia")).toBe(
      "Horario importado de una fuente pública; aún no confirmado por la parroquia",
    );
    expect(textoSelo("es", "curto", "importado", -1, null, "paroquia")).toBe("Importado");
  });
});

describe("celebrações de um dia", () => {
  const dom = local("dom", [
    { tipo: "missa", dias: ["dom"], hora: "11:00" },
    { tipo: "confissoes", dias: ["dom"], hora: "10:30" },
  ]);
  const sab = local("sab", [
    { tipo: "missa", dias: ["sab"], hora: "18:00" },
    { tipo: "missa", dias: ["sab"], hora: "09:00" },
  ]);

  it("próximo domingo inclui as vespertinas de sábado", () => {
    const dia = celebracoesDoDia([dom, sab], "domingo", "2026-11-04", calendario);
    expect(dia.data).toBe("2026-11-08");
    expect(
      dia.celebracoes.map((o) => `${o.data} ${o.hora} ${o.tipo}${o.vespera ? " v" : ""}`),
    ).toEqual([
      "2026-11-07 18:00 missa v",
      "2026-11-08 10:30 confissoes",
      "2026-11-08 11:00 missa",
    ]);
    expect(dia.celebracoes[2]?.confissoesAs).toEqual(["10:30"]);
  });

  it("filtro por tipo", () => {
    const dia = celebracoesDoDia([dom], "2026-11-08", "2026-11-01", calendario, "confissoes");
    expect(dia.celebracoes.map((o) => o.hora)).toEqual(["10:30"]);
  });

  it("dia santo: locais sem informação ficam à parte", () => {
    const ter = local("ter", [{ tipo: "missa", dias: ["ter"], hora: "19:00" }], {
      dias_santos: null,
    });
    const dia = celebracoesDoDia([ter, dom], "2026-12-08", "2026-12-01", calendario);
    expect(dia.diaSanto?.id).toBe("imaculada-conceicao");
    expect(dia.celebracoes).toEqual([]);
    expect(dia.semInformacao.map((o) => o.hora)).toEqual(["19:00"]);
  });

  it("período e minutos até à celebração", () => {
    expect([periodo("11:59"), periodo("12:00"), periodo("18:59"), periodo("19:00")]).toEqual([
      "manha",
      "tarde",
      "tarde",
      "noite",
    ]);
    expect(
      minutosAte({ data: "2026-11-01", hora: "10:50" }, { data: "2026-11-01", hora: "12:00" }),
    ).toBe(70);
    expect(
      minutosAte({ data: "2026-11-01", hora: "23:50" }, { data: "2026-11-02", hora: "00:00" }),
    ).toBe(10);
    expect(
      minutosAte({ data: "2026-11-01", hora: "10:50" }, { data: "2026-11-01", hora: "10:00" }),
    ).toBe(-50);
  });
});

describe("detalhe e outros", () => {
  it("horário semanal por época, com horas juntas", () => {
    const regras: Regra[] = [
      { tipo: "missa", dias: ["dom"], hora: "19:00" },
      { tipo: "missa", dias: ["dom"], hora: "12:00" },
      { tipo: "missa", dias: ["sab"], hora: "17:00", epoca: "inverno" },
      { tipo: "missa", dias: ["sab"], hora: "18:00", epoca: "verao", nota: "Com coro" },
    ];
    expect(blocosHorario({ horarios: regras }, "pt-PT", "2026-11-08")).toEqual([
      {
        titulo: pt.epocaInverno,
        atual: true,
        linhas: [{ texto: "Sábados às 17:00" }, { texto: "Domingos às 12:00 e 19:00" }],
      },
      {
        titulo: pt.epocaVerao,
        atual: false,
        linhas: [
          { texto: "Sábados às 18:00", nota: "Com coro", notaEmPortugues: false },
          { texto: "Domingos às 12:00 e 19:00" },
        ],
      },
    ]);
    expect(blocosHorario({ horarios: regras.slice(0, 2) }, "en", "2026-07-01")).toEqual([
      { atual: true, linhas: [{ texto: "Sundays at 12:00 and 19:00" }] },
    ]);
    expect(
      blocosHorario(
        { horarios: [{ tipo: "confissoes", dias: ["sab"], hora: "17:00", hora_fim: "18:00" }] },
        "pt-PT",
        "2026-11-08",
      ),
    ).toEqual([{ atual: true, linhas: [{ texto: "Confissões: sábados das 17:00 às 18:00" }] }]);
    expect(blocosHorario({ horarios: [] }, "pt-PT", "2026-11-08")).toEqual([]);
  });

  it("exceções e notas", () => {
    expect(
      descreverExcecao(
        { data: "2026-11-15", acao: "alterar", hora_original: "11:00", hora: "10:00" },
        "pt-PT",
      ),
    ).toBe(
      "15/11: missa das 11:00 passa para as 10:00".replace(
        "15/11",
        new Intl.DateTimeFormat("pt-PT", {
          day: "numeric",
          month: "short",
          timeZone: "Europe/Lisbon",
        }).format(new Date("2026-11-15T12:00:00Z")),
      ),
    );
    expect(descreverExcecao({ data: "2026-11-15", acao: "cancelar" }, "en")).toMatch(
      /: no services$/,
    );
    expect(
      descreverExcecao(
        { data: "2026-12-24", acao: "adicionar", hora: "23:30", nota: "Vigília" },
        "es",
      ),
    ).toMatch(/: misa a las 23:30 \(Vigília\)$/);
    expect(notasDoLocal({ notas: ["Nota"] }, "en")).toEqual([{ texto: "Nota", emPortugues: true }]);
    expect(notasDoLocal({ notas: ["Nota"], notas_i18n: { en: ["Note"] } }, "en")).toEqual([
      { texto: "Note", emPortugues: false },
    ]);
  });

  it("mapas, dias curtos e solenidades", () => {
    expect(ligacaoMapa({ lat: 41.4, lon: -8.3 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=41.4,-8.3",
    );
    expect(ligacaoMapa({ lat: 41.4, lon: -8.3 }, true)).toBe(
      "https://maps.apple.com/?daddr=41.4,-8.3",
    );
    expect(formatarDiaCurto("2026-11-08", "pt-PT")).toBe("Dom");
    expect(formatarDiaCurto("2026-11-14", "es")).toBe("Sáb");
    expect(proximasSolenidades(calendarioBase, "2026-11-10")).toEqual([
      { data: "2026-11-29", id: "advento_1_domingo", preceito: false },
      {
        data: "2026-12-08",
        id: "imaculada-conceicao",
        nome: "Imaculada Conceição",
        preceito: true,
      },
    ]);
  });
});
