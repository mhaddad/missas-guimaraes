/**
 * Casos de referência do Anexo C do plano (C1–C18, C21–C26). São o contrato do motor:
 * não se alteram para fazer passar o código. Os horários dos locais são cópias fixas dos
 * dados de novembro de 2026, para que uma alteração real de horário não parta o contrato.
 * C19, C20 e C28–C35 são do fluxo de gravação (E4); C27 é do painel (E5).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  aplicarMudanca,
  descreverRegra,
  epocaDe,
  expandir,
  ocorrencias,
  prepararCalendario,
  proximas,
  type Local,
  type Regra,
} from "./index.ts";
import { calendarioDeTeste, criarLocal } from "./teste-util.ts";

const calendario = prepararCalendario(calendarioDeTeste);

function horas(local: Local, data: string): string[] {
  return ocorrencias(local, data, data, { calendario }).map((o) => o.hora);
}

const nespereira = criarLocal("nespereira", [
  { tipo: "missa", dias: ["qua"], hora: "18:00" },
  { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [2, 4] },
  { tipo: "missa", dias: ["dom"], hora: "11:15" },
]);

const polvoreira = criarLocal("polvoreira", [
  { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [1, 3] },
  { tipo: "missa", dias: ["dom"], hora: "10:00" },
]);

const DIAS_UTEIS: Regra["dias"] = ["seg", "ter", "qua", "qui", "sex"];

const ronfe = criarLocal("ronfe", [
  { tipo: "missa", dias: DIAS_UTEIS, hora: "19:00" },
  { tipo: "missa", dias: DIAS_UTEIS, hora: "21:00", meses: [5] },
  { tipo: "missa", dias: ["sab"], hora: "19:00" },
  { tipo: "missa", dias: ["dom"], hora: "08:00" },
  { tipo: "missa", dias: ["dom"], hora: "11:00" },
]);

const selhoEParaiso = criarLocal("selho-e-paraiso", [
  { tipo: "missa", dias: ["ter", "qua", "qui"], hora: "18:30", epoca: "inverno" },
  { tipo: "missa", dias: ["ter", "qua", "qui"], hora: "19:00", epoca: "verao" },
  { tipo: "missa", dias: ["sex"], hora: "18:30", epoca: "inverno", semanas_do_mes: [1] },
  { tipo: "missa", dias: ["sex"], hora: "19:00", epoca: "verao", semanas_do_mes: [1] },
  { tipo: "missa", dias: ["sab"], hora: "16:00" },
  { tipo: "missa", dias: ["dom"], hora: "09:00" },
  { tipo: "missa", dias: ["dom"], hora: "11:00" },
]);

const caldelas = criarLocal("caldelas", [
  { tipo: "missa", dias: ["seg"], hora: "09:00" },
  { tipo: "missa", dias: ["qua"], hora: "09:00" },
  { tipo: "missa", dias: ["qui"], hora: "20:00" },
  { tipo: "missa", dias: ["sex"], hora: "09:00" },
  { tipo: "missa", dias: ["sab"], hora: "18:00" },
  { tipo: "missa", dias: ["dom"], hora: "09:00" },
  { tipo: "missa", dias: ["dom"], hora: "11:30" },
]);

const serzedelo = criarLocal("serzedelo", [
  { tipo: "missa", dias: ["sab"], hora: "16:30", quinzenal: { referencia: null } },
  { tipo: "missa", dias: ["dom"], hora: "08:00" },
]);

const calvos = criarLocal("calvos", [
  { tipo: "missa", dias: ["sab"], hora: "17:00", epoca: "inverno" },
  { tipo: "missa", dias: ["sab"], hora: "18:00", epoca: "verao" },
  { tipo: "missa", dias: ["dom"], hora: "11:00" },
]);

const oliveira = criarLocal("nossa-senhora-da-oliveira", [
  { tipo: "missa", dias: DIAS_UTEIS, hora: "19:00" },
  { tipo: "missa", dias: ["dom"], hora: "12:00" },
  { tipo: "missa", dias: ["dom"], hora: "19:00" },
]);

describe("C1–C4 — época (hora legal)", () => {
  it.each([
    ["C1", "2026-10-24", "verao"],
    ["C2", "2026-10-25", "inverno"],
    ["C3", "2027-03-27", "inverno"],
    ["C4", "2027-03-28", "verao"],
  ] as const)("%s: epocaDe(%s) = %s", (_c, data, esperado) => {
    expect(epocaDe(data)).toBe(esperado);
  });
});

describe("C5–C7 — semanas do mês", () => {
  const sabados = ["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"];

  it("C5: 2.º e 4.º sábado em Nespereira", () => {
    expect(sabados.map((d) => horas(nespereira, d).includes("17:00"))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("C6: 1.º e 3.º sábado em Polvoreira", () => {
    expect(sabados.map((d) => horas(polvoreira, d).includes("17:00"))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("C7: 5.º sábado (2027-01-30) não tem missa em nenhuma das duas", () => {
    expect(horas(nespereira, "2027-01-30")).toEqual([]);
    expect(horas(polvoreira, "2027-01-30")).toEqual([]);
  });
});

describe("C8–C13 — meses, época e dias", () => {
  it("C8: dias úteis 21:00 só em maio (Ronfe)", () => {
    expect(horas(ronfe, "2026-11-02")).toEqual(["19:00"]);
    expect(horas(ronfe, "2027-05-03")).toEqual(["19:00", "21:00"]);
  });

  it("C9: 1.ª sexta-feira (Selho e Paraíso)", () => {
    expect(horas(selhoEParaiso, "2026-11-06")).toEqual(["18:30"]);
    expect(horas(selhoEParaiso, "2026-11-13")).toEqual([]);
  });

  it("C10: época + dia útil (Selho e Paraíso, terça de inverno)", () => {
    expect(horas(selhoEParaiso, "2026-11-03")).toEqual(["18:30"]);
  });

  it("C11: horários por dia (Caldelas)", () => {
    expect(horas(caldelas, "2026-11-02")).toEqual(["09:00"]);
    expect(horas(caldelas, "2026-11-03")).toEqual([]);
    expect(horas(caldelas, "2026-11-05")).toEqual(["20:00"]);
  });

  it("C12: quinzenal sem referência fica fora de `proximas` e pede confirmação", () => {
    const agora = new Date("2026-11-06T12:00:00Z");
    const lista = proximas([serzedelo], agora, { calendario, dias: 30, limite: 100 });
    expect(lista.some((o) => o.hora === "16:30")).toBe(false);
    expect(lista.some((o) => o.hora === "08:00")).toBe(true);
    const regra = serzedelo.horarios[0] as Regra;
    expect(descreverRegra(regra, "pt-PT")).toContain("quinzenal — confirme com a paróquia");
  });

  it("C13: sábado com horário de verão e de inverno (Calvos)", () => {
    expect(horas(calvos, "2026-10-24")).toEqual(["18:00"]);
    expect(horas(calvos, "2026-10-31")).toEqual(["17:00"]);
  });
});

describe("C14–C15 — exceções", () => {
  const base = criarLocal("teste", [{ tipo: "missa", dias: ["dom"], hora: "11:00" }]);

  it("C14: cancelar a missa das 11:00 de 2026-11-08", () => {
    const local = {
      ...base,
      excecoes: [{ data: "2026-11-08", acao: "cancelar" as const, hora: "11:00" }],
    };
    expect(horas(local, "2026-11-08")).toEqual([]);
    expect(horas(local, "2026-11-15")).toEqual(["11:00"]);
  });

  it("C15: alterar 2026-11-15 das 11:00 para as 10:00", () => {
    const local = {
      ...base,
      excecoes: [
        { data: "2026-11-15", acao: "alterar" as const, hora_original: "11:00", hora: "10:00" },
      ],
    };
    expect(horas(local, "2026-11-15")).toEqual(["10:00"]);
  });
});

describe("C16–C17 — próximas celebrações, sempre em hora de Lisboa", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    if (TZ_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = TZ_ORIGINAL;
  });

  // 2026-11-01 10:50 em Lisboa (inverno, UTC+0).
  const agora = new Date("2026-11-01T10:50:00Z");

  function primeiras(): string[] {
    return proximas([oliveira], agora, { calendario, limite: 2 }).map((o) => `${o.data} ${o.hora}`);
  }

  it("C16: domingo 10:50 → 12:00, depois 19:00", () => {
    expect(primeiras()).toEqual(["2026-11-01 12:00", "2026-11-01 19:00"]);
  });

  it("C17: com o sistema em America/Sao_Paulo o resultado é igual", () => {
    process.env.TZ = "America/Sao_Paulo";
    expect(new Date(2026, 10, 1).getTimezoneOffset()).not.toBe(0);
    expect(primeiras()).toEqual(["2026-11-01 12:00", "2026-11-01 19:00"]);
  });
});

describe("C18 — validade", () => {
  it("regra até 30/11 e regra nova a partir de 01/12", () => {
    const local = criarLocal("teste", [
      { tipo: "missa", dias: ["dom"], hora: "11:15", validade: { ate: "2026-11-30" } },
      { tipo: "missa", dias: ["dom"], hora: "10:30", validade: { de: "2026-12-01" } },
    ]);
    expect(horas(local, "2026-11-29")).toEqual(["11:15"]);
    expect(horas(local, "2026-12-06")).toEqual(["10:30"]);
  });
});

describe("C21–C23 — dias santos de preceito", () => {
  it("C21: `horario_domingo` na Imaculada Conceição (terça)", () => {
    const local: Local = { ...oliveira, dias_santos: "horario_domingo" };
    expect(horas(local, "2026-12-08")).toEqual(["12:00", "19:00"]);
  });

  it("C22: `null` mantém o dia útil e avisa", () => {
    const resultado = expandir(oliveira, "2026-12-08", "2026-12-08", { calendario });
    expect(resultado.ocorrencias.map((o) => o.hora)).toEqual(["19:00"]);
    expect(resultado.avisos).toEqual([
      {
        tipo: "dia_santo_sem_informacao",
        local: "nossa-senhora-da-oliveira",
        data: "2026-12-08",
        dia_santo: { id: "imaculada-conceicao", nome: "Imaculada Conceição" },
      },
    ]);
  });

  it.each(["horario_domingo", "horario_proprio", "horario_habitual", null] as const)(
    "C23: Todos os Santos ao domingo (2026-11-01), regime %s → regras de domingo",
    (regime) => {
      const local: Local = {
        ...oliveira,
        dias_santos: regime,
        horarios: [...oliveira.horarios, { tipo: "missa", dias: ["santo"], hora: "10:00" }],
      };
      expect(horas(local, "2026-11-01")).toEqual(["12:00", "19:00"]);
      expect(expandir(local, "2026-11-01", "2026-11-01", { calendario }).avisos).toEqual([]);
    },
  );
});

describe("C24–C26 — natureza da mudança (painel, P2)", () => {
  it("C24: retirar a missa de domingo 11:00 só em 2026-11-08 → exceção `cancelar`", () => {
    const local = criarLocal("teste", [{ tipo: "missa", dias: ["dom"], hora: "11:00" }]);
    const depois = aplicarMudanca(local, {
      acao: "apagar",
      indice: 0,
      natureza: { tipo: "so_num_dia", data: "2026-11-08" },
    });
    expect(depois.horarios).toEqual(local.horarios);
    expect(depois.excecoes).toEqual([
      { data: "2026-11-08", acao: "cancelar", tipo: "missa", hora: "11:00" },
    ]);
  });

  it("C25: domingo 11:15 passa a 10:30, habitual a partir de 2026-12-01 (= C18)", () => {
    const local = criarLocal("teste", [{ tipo: "missa", dias: ["dom"], hora: "11:15" }]);
    const depois = aplicarMudanca(local, {
      acao: "editar",
      indice: 0,
      regra: { tipo: "missa", dias: ["dom"], hora: "10:30" },
      natureza: { tipo: "habitual", de: "2026-12-01" },
    });
    expect(depois.horarios).toEqual([
      { tipo: "missa", dias: ["dom"], hora: "11:15", validade: { ate: "2026-11-30" } },
      { tipo: "missa", dias: ["dom"], hora: "10:30", validade: { de: "2026-12-01" } },
    ]);
    expect(depois.excecoes).toEqual([]);
  });

  it("C26: retirar a missa das 08:00 durante agosto de 2027 → suspensa nesse período", () => {
    const local = criarLocal("teste", [
      { tipo: "missa", dias: ["dom"], hora: "08:00" },
      { tipo: "missa", dias: ["dom"], hora: "11:00" },
    ]);
    const depois = aplicarMudanca(local, {
      acao: "apagar",
      indice: 0,
      natureza: { tipo: "periodo", de: "2027-08-01", ate: "2027-08-31" },
    });
    expect(horas(depois, "2027-07-25")).toEqual(["08:00", "11:00"]);
    expect(horas(depois, "2027-08-01")).toEqual(["11:00"]);
    expect(horas(depois, "2027-08-29")).toEqual(["11:00"]);
    expect(horas(depois, "2027-09-05")).toEqual(["08:00", "11:00"]);
    expect(depois.excecoes).toEqual([]);
  });
});
