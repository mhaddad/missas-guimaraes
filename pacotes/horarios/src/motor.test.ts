import { describe, expect, it } from "vitest";
import {
  aplicarMudanca,
  descreverAlteracao,
  descreverHorarios,
  descreverRegra,
  diff,
  etiquetas,
  expandir,
  MudancaInvalida,
  ocorrencias,
  pascoa,
  prepararCalendario,
  proximas,
  resumirAlteracoes,
  semanasDoMes,
  validar,
  verificarCalendario,
  type Calendario,
  type Local,
  type Regra,
} from "./index.ts";
import { eDataValida, horaDeMinutos, momentoEmLisboa, ultimoDiaDaSemanaDoMes } from "./datas.ts";
import { calendarioDeTeste, criarLocal } from "./teste-util.ts";

const calendario = prepararCalendario(calendarioDeTeste);
const domingo11: Regra = { tipo: "missa", dias: ["dom"], hora: "11:00" };

describe("datas", () => {
  it("semanas do mês, incluindo a última", () => {
    expect(semanasDoMes("2026-11-01")).toEqual([1]);
    expect(semanasDoMes("2026-11-28")).toEqual([4, -1]);
    expect(semanasDoMes("2026-11-24")).toEqual([4, -1]);
    expect(semanasDoMes("2026-11-23")).toEqual([4]);
    expect(semanasDoMes("2027-01-30")).toEqual([5, -1]);
  });

  it("Páscoa", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(pascoa(2028)).toBe("2028-04-16");
    expect(pascoa(2038)).toBe("2038-04-25");
  });

  it("datas e horas inválidas", () => {
    expect(eDataValida("2026-02-29")).toBe(false);
    expect(eDataValida("2028-02-29")).toBe(true);
    expect(eDataValida("2026-13-01")).toBe(false);
    expect(eDataValida("26-01-01")).toBe(false);
    expect(horaDeMinutos(605)).toBe("10:05");
    expect(ultimoDiaDaSemanaDoMes(2026, 3, "dom")).toBe("2026-03-29");
  });

  it("momento em Lisboa no verão (UTC+1)", () => {
    expect(momentoEmLisboa(new Date("2026-07-01T23:30:00Z"))).toEqual({
      data: "2026-07-02",
      hora: "00:30",
    });
  });
});

describe("calendário", () => {
  it("dias santos móveis e fixos", () => {
    expect(calendario.diaSanto("2027-05-27")).toEqual({
      id: "corpo-de-deus",
      nome: "Corpo de Deus",
    });
    expect(calendario.diaSanto("2026-12-25")?.id).toBe("natal");
    expect(calendario.diaSanto("2026-12-24")).toBeUndefined();
  });

  it("deteta datas escritas que não batem com as regras", () => {
    const errado: Calendario = {
      ...calendarioDeTeste,
      anos: {
        "2026": {
          dias_santos: {
            "santa-maria-mae-de-deus": "2026-01-01",
            "corpo-de-deus": "2026-06-05",
            assuncao: "2026-08-15",
            "todos-os-santos": "2026-11-01",
            "imaculada-conceicao": "2026-12-08",
            natal: "2026-12-25",
            inventado: "2026-05-05",
          },
          moveis: { pascoa: "2026-04-12", ramos: "2026-03-28" },
          hora_legal: { inicio_verao: "2026-03-29", inicio_inverno: "2026-10-26" },
        },
      },
    };
    expect(verificarCalendario(errado)).toEqual([
      "anos.2026.dias_santos.corpo-de-deus: 2026-06-05 ≠ 2026-06-04",
      "anos.2026.dias_santos.inventado: não existe nas regras",
      "anos.2026.moveis.pascoa: 2026-04-12 ≠ 2026-04-05",
      "anos.2026.hora_legal.inicio_inverno: 2026-10-26 ≠ 2026-10-25",
      "anos.2026.moveis.ramos: não é domingo",
    ]);
  });

  it("regra de dia santo com data inexistente ou data móvel inválida", () => {
    const mau: Calendario = {
      dias_santos_de_preceito: {
        estado: "x",
        regras: [
          { id: "a", nome: "A", data: "02-30" },
          { id: "b", nome: "B", data: "02-29" },
          { id: "c", nome: "C", data_movel: "pentecostes+1" },
        ],
      },
      anos: {},
    };
    expect(verificarCalendario(mau)).toEqual([
      "dias santos: a tem uma data que não existe (02-30)",
      "dias santos: c tem data_movel inválida (pentecostes+1)",
    ]);
    expect(() => prepararCalendario(mau).diaSanto("2026-01-01")).toThrow("data_movel inválida");
  });
});

describe("expansão", () => {
  it("cancelar o dia inteiro e acrescentar uma celebração especial", () => {
    const local: Local = {
      ...criarLocal("t", [domingo11, { tipo: "confissoes", dias: ["dom"], hora: "10:00" }]),
      excecoes: [
        { data: "2026-11-08", acao: "cancelar" },
        { data: "2026-11-08", acao: "adicionar", hora: "16:00", nota: "Festa" },
      ],
    };
    expect(ocorrencias(local, "2026-11-08", "2026-11-08")).toEqual([
      {
        local: "t",
        data: "2026-11-08",
        hora: "16:00",
        tipo: "missa",
        idioma: "pt",
        nota: "Festa",
        origem: "excecao",
      },
    ]);
  });

  it("cancelar só um tipo de celebração", () => {
    const local: Local = {
      ...criarLocal("t", [domingo11, { tipo: "confissoes", dias: ["dom"], hora: "11:00" }]),
      excecoes: [{ data: "2026-11-08", acao: "cancelar", tipo: "confissoes" }],
    };
    expect(ocorrencias(local, "2026-11-08", "2026-11-08").map((o) => o.tipo)).toEqual(["missa"]);
  });

  it("cancelar prevalece sobre alterar", () => {
    const local: Local = {
      ...criarLocal("t", [domingo11]),
      excecoes: [
        { data: "2026-11-08", acao: "alterar", hora_original: "11:00", hora: "10:00" },
        { data: "2026-11-08", acao: "cancelar", hora: "11:00" },
      ],
    };
    expect(ocorrencias(local, "2026-11-08", "2026-11-08")).toEqual([]);
  });

  it("alterar desloca a hora de fim e guarda a hora habitual", () => {
    const local: Local = {
      ...criarLocal("t", [{ tipo: "confissoes", dias: ["sab"], hora: "17:00", hora_fim: "18:30" }]),
      excecoes: [
        {
          data: "2026-11-07",
          acao: "alterar",
          hora_original: "17:00",
          hora: "16:00",
          nota: "Retiro",
        },
      ],
    };
    const [o] = ocorrencias(local, "2026-11-07", "2026-11-07");
    expect(o).toMatchObject({
      hora: "16:00",
      hora_fim: "17:30",
      hora_original: "17:00",
      nota: "Retiro",
    });
  });

  it("Missa do Galo: adicionar 00:00 no dia 25, que é dia santo", () => {
    const local: Local = {
      ...criarLocal("t", [], { dias_santos: "horario_domingo" }),
      excecoes: [{ data: "2026-12-25", acao: "adicionar", hora: "00:00", nota: "Missa do Galo" }],
    };
    const [o] = ocorrencias(local, "2026-12-24", "2026-12-25", { calendario });
    expect(o).toMatchObject({ data: "2026-12-25", hora: "00:00", dia_santo: { id: "natal" } });
  });

  it("`horario_proprio` usa as regras `santo` e só nos dias santos", () => {
    const local = criarLocal(
      "t",
      [
        { tipo: "missa", dias: ["ter"], hora: "19:00" },
        { tipo: "missa", dias: ["santo"], hora: "10:00" },
      ],
      { dias_santos: "horario_proprio" },
    );
    expect(
      ocorrencias(local, "2026-12-08", "2026-12-08", { calendario }).map((o) => o.hora),
    ).toEqual(["10:00"]);
    expect(
      ocorrencias(local, "2026-12-15", "2026-12-15", { calendario }).map((o) => o.hora),
    ).toEqual(["19:00"]);
  });

  it("`horario_habitual` não avisa e mantém o dia da semana", () => {
    const local = criarLocal("t", [{ tipo: "missa", dias: ["ter"], hora: "19:00" }], {
      dias_santos: "horario_habitual",
    });
    const r = expandir(local, "2026-12-08", "2026-12-08", { calendario });
    expect(r.ocorrencias.map((o) => o.hora)).toEqual(["19:00"]);
    expect(r.avisos).toEqual([]);
  });

  it("quinzenal com referência", () => {
    const local = criarLocal("t", [
      { tipo: "missa", dias: ["sab"], hora: "16:30", quinzenal: { referencia: "2026-11-07" } },
    ]);
    const datas = ocorrencias(local, "2026-10-01", "2026-12-31").map((o) => o.data);
    expect(datas).toEqual([
      "2026-10-10",
      "2026-10-24",
      "2026-11-07",
      "2026-11-21",
      "2026-12-05",
      "2026-12-19",
    ]);
  });

  it("a ordem é estável e não depende da ordem das regras", () => {
    const a = criarLocal("t", [
      { tipo: "confissoes", dias: ["dom"], hora: "11:00" },
      domingo11,
      { tipo: "missa", dias: ["dom"], hora: "09:00" },
    ]);
    const lista = ocorrencias(a, "2026-11-08", "2026-11-08").map((o) => `${o.hora} ${o.tipo}`);
    expect(lista).toEqual(["09:00 missa", "11:00 missa", "11:00 confissoes"]);
  });
});

describe("próximas", () => {
  const a = criarLocal("a", [domingo11]);
  const b = criarLocal("b", [domingo11, { tipo: "confissoes", dias: ["dom"], hora: "10:00" }]);
  const escondido = criarLocal("c", [domingo11], { publicar: false });
  const agora = new Date("2026-11-08T09:00:00Z");

  it("ordena por hora e local, ignora locais não publicados e respeita o limite", () => {
    const lista = proximas([b, escondido, a], agora, { calendario });
    expect(lista.map((o) => `${o.local} ${o.hora}`)).toEqual(["b 10:00", "a 11:00", "b 11:00"]);
    expect(proximas([b, a], agora, { limite: 2 })).toHaveLength(2);
  });

  it("filtra por tipo, por dias e inclui a que começa agora", () => {
    const lista = proximas([a, b], new Date("2026-11-08T11:00:00Z"), { tipos: ["missa"], dias: 8 });
    expect(lista.map((o) => `${o.data} ${o.local}`)).toEqual([
      "2026-11-08 a",
      "2026-11-08 b",
      "2026-11-15 a",
      "2026-11-15 b",
    ]);
    expect(proximas([a], new Date("2026-11-08T11:01:00Z"), { dias: 1 })).toEqual([]);
  });
});

describe("descrições", () => {
  const casos: [Regra, string, string, string][] = [
    [domingo11, "Domingos às 11:00", "Sundays at 11:00", "Domingos a las 11:00"],
    [
      { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [4, 2] },
      "2.º e 4.º sábados do mês às 17:00",
      "2nd and 4th Saturdays of the month at 17:00",
      "2.º y 4.º sábado del mes a las 17:00",
    ],
    [
      { tipo: "missa", dias: ["sex"], hora: "18:30", semanas_do_mes: [1], epoca: "inverno" },
      "1.ª sexta-feira do mês às 18:30 (só no inverno)",
      "1st Friday of the month at 18:30 (winter time only)",
      "1.er viernes del mes a las 18:30 (solo en horario de invierno)",
    ],
    [
      { tipo: "missa", dias: ["sab"], hora: "18:00", semanas_do_mes: [-1] },
      "Último sábado do mês às 18:00",
      "Last Saturday of the month at 18:00",
      "Último sábado del mes a las 18:00",
    ],
    [
      { tipo: "missa", dias: ["seg", "ter", "qua", "qui", "sex"], hora: "21:00", meses: [5] },
      "Dias úteis às 21:00 (só em maio)",
      "Weekdays at 21:00 (May only)",
      "Días laborables a las 21:00 (solo en mayo)",
    ],
    [
      { tipo: "missa", dias: ["ter", "qua", "qui"], hora: "18:30" },
      "Terças, quartas e quintas às 18:30",
      "Tuesdays, Wednesdays and Thursdays at 18:30",
      "Martes, miércoles y jueves a las 18:30",
    ],
    [
      { tipo: "missa", dias: ["seg", "ter", "qua", "qui", "sex", "sab"], hora: "08:00" },
      "De segunda a sábado às 08:00",
      "Monday to Saturday at 08:00",
      "De lunes a sábado a las 08:00",
    ],
    [
      {
        tipo: "terco",
        dias: ["dom", "sab", "sex", "qui", "qua", "ter", "seg"],
        hora: "21:00",
        meses: [10, 5],
      },
      "Todos os dias às 21:00 (só em maio e outubro)",
      "Every day at 21:00 (May and October only)",
      "Todos los días a las 21:00 (solo en mayo y octubre)",
    ],
    [
      { tipo: "confissoes", dias: ["sab"], hora: "17:00", hora_fim: "18:30" },
      "Sábados das 17:00 às 18:30",
      "Saturdays from 17:00 to 18:30",
      "Sábados de 17:00 a 18:30",
    ],
    [
      {
        tipo: "missa",
        dias: ["dom", "santo"],
        hora: "10:00",
        validade: { de: "2026-12-01", ate: "2027-01-31" },
      },
      "Domingos e dias santos às 10:00 (de 1 dez. 2026 a 31 jan. 2027)",
      "Sundays and holy days of obligation at 10:00 (from 1 Dec 2026 to 31 Jan 2027)",
      "Domingos y días de precepto a las 10:00 (del 1 dic. 2026 al 31 ene. 2027)",
    ],
    [
      { tipo: "missa", dias: ["santo"], hora: "00:00", validade: { ate: "2026-12-31" } },
      "Dias santos à meia-noite (até 31 dez. 2026)",
      "Holy days of obligation at midnight (until 31 Dec 2026)",
      "Días de precepto a medianoche (hasta el 31 dic. 2026)",
    ],
    [
      {
        tipo: "missa",
        dias: ["sab"],
        hora: "16:30",
        quinzenal: { referencia: "2026-11-07" },
        validade: { de: "2027-01-01" },
      },
      "Sábados às 16:30 (quinzenal, a partir de 1 jan. 2027)",
      "Saturdays at 16:30 (every other week, from 1 Jan 2027)",
      "Sábados a las 16:30 (cada dos semanas, desde el 1 ene. 2027)",
    ],
    [
      { tipo: "missa", dias: ["ter", "qui"], hora: "19:00", semanas_do_mes: [1, 3] },
      "Terças e quintas às 19:00 (1.ª e 3.ª semanas do mês)",
      "Tuesdays and Thursdays at 19:00 (1st and 3rd weeks of the month)",
      "Martes y jueves a las 19:00 (1.er y 3.er semanas del mes)",
    ],
  ];

  it.each(casos)("%j", (regra, pt, en, es) => {
    expect(descreverRegra(regra, "pt-PT")).toBe(pt);
    expect(descreverRegra(regra, "en")).toBe(en);
    expect(descreverRegra(regra, "es")).toBe(es);
  });

  it("várias horas numa só linha", () => {
    expect(descreverRegra(domingo11, "pt-PT", { horas: ["19:00", "11:00", "08:00"] })).toBe(
      "Domingos às 08:00, 11:00 e 19:00",
    );
    expect(descreverRegra(domingo11, "en", { horas: ["11:00", "19:00"] })).toBe(
      "Sundays at 11:00 and 19:00",
    );
    expect(
      descreverRegra({ ...domingo11, hora_fim: "12:00" }, "es", { horas: ["11:00", "19:00"] }),
    ).toBe("Domingos de 11:00 a 12:00");
  });

  it("idioma da celebração e tipo", () => {
    const regra: Regra = { tipo: "missa", dias: ["dom"], hora: "18:00", idioma: "la" };
    expect(descreverRegra(regra, "pt-PT", { comTipo: true })).toBe(
      "Missa: domingos às 18:00 (em latim)",
    );
    expect(descreverRegra(regra, "en")).toBe("Sundays at 18:00 (in Latin)");
  });

  it("etiquetas automáticas", () => {
    expect(etiquetas(domingo11, "pt-PT")).toEqual(["Semanal"]);
    expect(
      etiquetas(
        { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [2, 4], epoca: "verao" },
        "pt-PT",
      ),
    ).toEqual(["2.º e 4.º sábado", "Vespertina", "Só no verão"]);
    expect(
      etiquetas({ tipo: "missa", dias: ["sex"], hora: "18:30", semanas_do_mes: [1] }, "pt-PT"),
    ).toEqual(["Mensal"]);
    expect(
      etiquetas(
        { tipo: "missa", dias: ["ter", "qui"], hora: "10:00", semanas_do_mes: [1, 3] },
        "en",
      ),
    ).toEqual(["1st and 3rd weeks of the month"]);
    expect(
      etiquetas(
        {
          tipo: "missa",
          dias: ["sab"],
          hora: "16:30",
          quinzenal: { referencia: null },
          meses: [5],
          validade: { ate: "2026-12-31" },
          idioma: "en",
        },
        "pt-PT",
      ),
    ).toEqual(["Quinzenal", "Vespertina", "Só em maio", "Até 31 dez. 2026", "Em inglês"]);
  });

  it("horários de um local, por tipo e com regime de dias santos", () => {
    const local = criarLocal("t", [
      { tipo: "confissoes", dias: ["sab"], hora: "17:00", hora_fim: "18:00" },
      {
        tipo: "missa",
        dias: ["dom"],
        hora: "11:00",
        nota: "Missa com crianças",
        nota_i18n: { en: "Children's Mass" },
      },
      { tipo: "missa", dias: ["sab"], hora: "18:00", epoca: "verao" },
      { tipo: "missa", dias: ["sab"], hora: "17:00", epoca: "inverno" },
    ]);
    expect(descreverHorarios(local, "pt-PT", { epoca: "inverno" })).toBe(
      [
        "Missas",
        "- Sábados às 17:00 (só no inverno)",
        "- Domingos às 11:00 — Missa com crianças",
        "",
        "Confissões",
        "- Sábados das 17:00 às 18:00",
        "",
        "Dias santos: sem informação",
      ].join("\n"),
    );
    expect(descreverHorarios(local, "en")).toContain("- Sundays at 11:00 — Children's Mass");
    expect(descreverHorarios(criarLocal("v", [], { dias_santos: "horario_domingo" }), "es")).toBe(
      "Sin horarios registrados.\n\nDías de precepto: horario de domingo",
    );
  });
});

describe("mudanças (P2)", () => {
  const local = criarLocal("t", [domingo11]);

  it("adicionar: habitual, período e só num dia", () => {
    const nova: Regra = { tipo: "missa", dias: ["sab"], hora: "18:00", nota: "Jovens" };
    expect(
      aplicarMudanca(local, { acao: "adicionar", regra: nova, natureza: { tipo: "habitual" } })
        .horarios,
    ).toEqual([domingo11, nova]);
    expect(
      aplicarMudanca(local, {
        acao: "adicionar",
        regra: nova,
        natureza: { tipo: "habitual", de: "2026-12-01" },
      }).horarios[1],
    ).toEqual({ ...nova, validade: { de: "2026-12-01" } });
    expect(
      aplicarMudanca(local, {
        acao: "adicionar",
        regra: nova,
        natureza: { tipo: "periodo", de: "2027-07-01", ate: "2027-08-31" },
      }).horarios[1],
    ).toEqual({ ...nova, validade: { de: "2027-07-01", ate: "2027-08-31" } });
    expect(
      aplicarMudanca(local, {
        acao: "adicionar",
        regra: nova,
        natureza: { tipo: "so_num_dia", data: "2026-11-14" },
      }).excecoes,
    ).toEqual([
      { data: "2026-11-14", acao: "adicionar", tipo: "missa", hora: "18:00", nota: "Jovens" },
    ]);
  });

  it("editar só num dia: alterar, ou cancelar + adicionar se mudou mais do que a hora", () => {
    expect(
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: { ...domingo11, hora: "10:30" },
        natureza: { tipo: "so_num_dia", data: "2026-11-15" },
      }).excecoes,
    ).toEqual([
      { data: "2026-11-15", acao: "alterar", tipo: "missa", hora_original: "11:00", hora: "10:30" },
    ]);
    expect(
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: { tipo: "adoracao", dias: ["dom"], hora: "11:00" },
        natureza: { tipo: "so_num_dia", data: "2026-11-15" },
      }).excecoes,
    ).toEqual([
      { data: "2026-11-15", acao: "cancelar", tipo: "missa", hora: "11:00" },
      { data: "2026-11-15", acao: "adicionar", tipo: "adoracao", hora: "11:00" },
    ]);
  });

  it("editar só num dia mantém idioma e hora de fim, e não usa `alterar` se a duração mudou", () => {
    const inglesa: Regra = {
      tipo: "missa",
      dias: ["dom"],
      hora: "11:00",
      hora_fim: "12:00",
      idioma: "en",
    };
    const comInglesa = criarLocal("t", [inglesa]);
    const soDuracao = aplicarMudanca(comInglesa, {
      acao: "editar",
      indice: 0,
      regra: { ...inglesa, hora_fim: "12:30" },
      natureza: { tipo: "so_num_dia", data: "2026-11-15" },
    });
    expect(soDuracao.excecoes).toEqual([
      { data: "2026-11-15", acao: "cancelar", tipo: "missa", hora: "11:00" },
      {
        data: "2026-11-15",
        acao: "adicionar",
        tipo: "missa",
        hora: "11:00",
        hora_fim: "12:30",
        idioma: "en",
      },
    ]);
    const [o] = ocorrencias(soDuracao, "2026-11-15", "2026-11-15");
    expect(o).toMatchObject({ hora: "11:00", hora_fim: "12:30", idioma: "en", origem: "excecao" });
    const mesmaDuracao = aplicarMudanca(comInglesa, {
      acao: "editar",
      indice: 0,
      regra: { ...inglesa, hora: "10:00", hora_fim: "11:00" },
      natureza: { tipo: "so_num_dia", data: "2026-11-15" },
    });
    expect(mesmaDuracao.excecoes).toEqual([
      { data: "2026-11-15", acao: "alterar", tipo: "missa", hora_original: "11:00", hora: "10:00" },
    ]);
    expect(validar(mesmaDuracao).filter((p) => p.nivel === "erro")).toEqual([]);
  });

  it("avisa quando duas regras do mesmo tipo e hora partilham um dia", () => {
    const local = criarLocal("t", [domingo11, { ...domingo11, idioma: "en" }]);
    expect(validar(local).map((p) => p.mensagem)).toEqual([
      "mesmo tipo e hora que horarios[0] num mesmo dia: as exceções não as distinguem",
    ]);
  });

  it("editar: habitual sem data substitui; período suspende a antiga e cria a nova", () => {
    const nova: Regra = { ...domingo11, hora: "10:30" };
    expect(
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: nova,
        natureza: { tipo: "habitual" },
      }).horarios,
    ).toEqual([nova]);
    expect(
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: nova,
        natureza: { tipo: "periodo", de: "2027-08-01", ate: "2027-08-31" },
      }).horarios,
    ).toEqual([
      { ...domingo11, validade: { ate: "2027-07-31" } },
      { ...domingo11, validade: { de: "2027-09-01" } },
      { ...nova, validade: { de: "2027-08-01", ate: "2027-08-31" } },
    ]);
  });

  it("apagar: habitual a partir de uma data, ou de vez", () => {
    expect(
      aplicarMudanca(local, {
        acao: "apagar",
        indice: 0,
        natureza: { tipo: "habitual", de: "2026-12-01" },
      }).horarios,
    ).toEqual([{ ...domingo11, validade: { ate: "2026-11-30" } }]);
    expect(
      aplicarMudanca(local, { acao: "apagar", indice: 0, natureza: { tipo: "habitual" } }).horarios,
    ).toEqual([]);
  });

  it("suspender respeita a validade que a regra já tinha", () => {
    const comValidade = criarLocal("t", [
      { ...domingo11, validade: { de: "2027-01-01", ate: "2027-08-15" } },
    ]);
    expect(
      aplicarMudanca(comValidade, {
        acao: "apagar",
        indice: 0,
        natureza: { tipo: "periodo", de: "2027-08-01", ate: "2027-08-31" },
      }).horarios,
    ).toEqual([{ ...domingo11, validade: { de: "2027-01-01", ate: "2027-07-31" } }]);
    expect(
      aplicarMudanca(comValidade, {
        acao: "apagar",
        indice: 0,
        natureza: { tipo: "habitual", de: "2026-12-01" },
      }).horarios,
    ).toEqual([]);
  });

  it("recusa mudanças impossíveis e não altera o original", () => {
    expect(() =>
      aplicarMudanca(local, { acao: "apagar", indice: 3, natureza: { tipo: "habitual" } }),
    ).toThrow(MudancaInvalida);
    expect(() =>
      aplicarMudanca(local, {
        acao: "apagar",
        indice: 0,
        natureza: { tipo: "periodo", de: "2027-02-01", ate: "2027-01-01" },
      }),
    ).toThrow("O início do período é depois do fim.");
    const curta = { ...domingo11, validade: { ate: "2026-01-31" } };
    expect(() =>
      aplicarMudanca(local, {
        acao: "adicionar",
        regra: curta,
        natureza: { tipo: "habitual", de: "2026-12-01" },
      }),
    ).toThrow(MudancaInvalida);
    expect(() =>
      aplicarMudanca(local, {
        acao: "adicionar",
        regra: curta,
        natureza: { tipo: "periodo", de: "2026-12-01", ate: "2026-12-31" },
      }),
    ).toThrow(MudancaInvalida);
    expect(() =>
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: curta,
        natureza: { tipo: "habitual", de: "2026-12-01" },
      }),
    ).toThrow(MudancaInvalida);
    expect(() =>
      aplicarMudanca(local, {
        acao: "editar",
        indice: 0,
        regra: curta,
        natureza: { tipo: "periodo", de: "2026-12-01", ate: "2026-12-31" },
      }),
    ).toThrow(MudancaInvalida);
    expect(local.horarios).toEqual([domingo11]);
    expect(local.excecoes).toEqual([]);
  });
});

describe("diff", () => {
  it("C25 em resumo: a antiga termina, a nova começa", () => {
    const antes = criarLocal("t", [{ tipo: "missa", dias: ["dom"], hora: "11:15" }]);
    const depois = aplicarMudanca(antes, {
      acao: "editar",
      indice: 0,
      regra: { tipo: "missa", dias: ["dom"], hora: "10:30" },
      natureza: { tipo: "habitual", de: "2026-12-01" },
    });
    expect(resumirAlteracoes(diff(antes, depois))).toEqual([
      "✏️ Missa: domingos às 11:15 → Domingos às 11:15 (até 30 nov. 2026)",
      "➕ Missa: domingos às 10:30 (a partir de 1 dez. 2026)",
    ]);
  });

  it("regras, exceções, dias santos, confirmação e outros campos", () => {
    const antes = criarLocal("t", [domingo11, { tipo: "missa", dias: ["sab"], hora: "18:00" }], {
      excecoes: [{ data: "2026-11-08", acao: "cancelar" }],
    });
    const depois: Local = {
      ...antes,
      nome: "Igreja Nova",
      dias_santos: "horario_domingo",
      confirmado_em: "2026-11-08",
      horarios: [domingo11, { tipo: "confissoes", dias: ["sex"], hora: "17:00" }],
      excecoes: [
        { data: "2026-11-15", acao: "alterar", hora_original: "11:00", hora: "10:00" },
        { data: "2026-12-24", acao: "adicionar", hora: "23:30", nota: "Vigília" },
        { data: "2026-11-22", acao: "cancelar", hora: "11:00", tipo: "missa" },
        { data: "2026-11-29", acao: "cancelar", tipo: "confissoes" },
      ],
    };
    expect(resumirAlteracoes(diff(antes, depois))).toEqual([
      "➖ Missa: sábados às 18:00",
      "➕ Confissões: sextas-feiras às 17:00",
      "🗑️ Exceção retirada: 8 nov. 2026: sem celebrações",
      "📅 15 nov. 2026: missa das 11:00 passa para as 10:00",
      "📅 24 dez. 2026: missa às 23:30 (Vigília)",
      "📅 22 nov. 2026: sem missa às 11:00",
      "📅 29 nov. 2026: sem confissões",
      "Dias santos: sem informação → horário de domingo",
      "✅ Horários confirmados em 8 nov. 2026",
      "Campo nome alterado",
    ]);
    expect(descreverAlteracao({ tipo: "confirmacao", antes: "2026-11-08", depois: null })).toBe(
      "Confirmação retirada",
    );
    expect(diff(antes, structuredClone(antes))).toEqual([]);
  });
});

describe("validar (regras de negócio)", () => {
  it("um local correto não tem problemas", () => {
    expect(validar(criarLocal("t", [domingo11]), { hoje: "2026-11-08", calendario })).toEqual([]);
  });

  it("deteta os erros e avisos do §8.3", () => {
    const local = criarLocal(
      "t",
      [
        domingo11,
        { ...domingo11 },
        { tipo: "confissoes", dias: ["sab"], hora: "18:00", hora_fim: "17:00" },
        { tipo: "missa", dias: ["sab"], hora: "05:30", quinzenal: { referencia: "2026-11-08" } },
        { tipo: "missa", dias: ["sab"], hora: "18:00", quinzenal: { referencia: "2026-02-30" } },
        {
          tipo: "missa",
          dias: ["qua"],
          hora: "19:00",
          validade: { de: "2026-12-01", ate: "2026-11-01" },
        },
        {
          tipo: "missa",
          dias: ["qua"],
          hora: "20:00",
          validade: { de: "2026-13-01", ate: "2026-11-31" },
        },
        {
          tipo: "missa",
          dias: ["santo"],
          hora: "10:00",
          nota: "Uma nota demasiado longa para caber numa etiqueta",
        },
      ],
      {
        confirmado_em: "2026-12-01",
        excecoes: [
          { data: "2026-11-31", acao: "cancelar" },
          { data: "2026-11-14", acao: "adicionar" },
          { data: "2026-11-15", acao: "alterar", hora: "10:00" },
          { data: "2026-11-15", acao: "alterar", hora_original: "11:00", hora: "11:00" },
          { data: "2026-11-15", acao: "cancelar", hora_original: "11:00" },
          { data: "2026-11-15", acao: "cancelar", hora: "09:00" },
          { data: "2026-11-15", acao: "cancelar", hora: "09:00" },
          { data: "2026-11-16", acao: "adicionar", hora: "23:00" },
          { data: "2026-12-25", acao: "adicionar", hora: "00:00" },
        ],
      },
    );
    const problemas = validar(local, { hoje: "2026-11-08", calendario }).map(
      (p) => `${p.nivel} ${p.caminho}: ${p.mensagem}`,
    );
    expect(problemas).toEqual([
      "erro horarios[1]: horário repetido (igual a horarios[0])",
      "erro horarios[2].hora_fim: a hora de fim tem de ser depois da hora de início",
      "aviso horarios[3].hora: hora pouco habitual (05:30)",
      "erro horarios[3].quinzenal.referencia: a data de referência não calha num dos dias da regra",
      "erro horarios[4].quinzenal.referencia: data inválida (2026-02-30)",
      "erro horarios[5].validade: o início da validade é depois do fim",
      "erro horarios[6].validade.de: data inválida (2026-13-01)",
      "erro horarios[6].validade.ate: data inválida (2026-11-31)",
      "aviso horarios[7].dias: regra para dias santos, mas o local não tem `dias_santos: horario_proprio`",
      "aviso horarios[7].nota: nota com mais de 40 caracteres; use as notas do local",
      "erro excecoes[0].data: data inválida (2026-11-31)",
      "erro excecoes[1]: uma exceção `adicionar` precisa de `hora`",
      "erro excecoes[2]: uma exceção `alterar` precisa de `hora_original` e `hora`",
      "erro excecoes[3]: a hora nova é igual à original",
      "erro excecoes[4].hora_original: só as exceções `alterar` usam `hora_original`",
      "aviso excecoes[5]: não há nenhuma celebração às 09:00 nesse dia; a exceção não tem efeito",
      "erro excecoes[6]: exceção repetida (igual a excecoes[5])",
      "aviso excecoes[6]: não há nenhuma celebração às 09:00 nesse dia; a exceção não tem efeito",
      "aviso excecoes[7].hora: hora pouco habitual (23:00)",
      "erro confirmado_em: a data de confirmação está no futuro",
    ]);
  });

  it("avisos de regime de dias santos, local vazio e confirmação inválida", () => {
    const local = criarLocal("t", [], {
      dias_santos: "horario_proprio",
      confirmado_em: "2026-02-30",
    });
    expect(validar(local).map((p) => p.mensagem)).toEqual([
      "`horario_proprio` sem nenhuma regra com `dias: [santo]`",
      "local publicado sem horários",
      "data inválida (2026-02-30)",
    ]);
  });
});
