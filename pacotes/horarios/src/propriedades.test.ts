/** Propriedades do motor (§14), com fast-check. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aplicarMudanca,
  DIAS_DA_SEMANA,
  diaDaSemana,
  epocaDe,
  momentoEmLisboa,
  ocorrencias,
  pascoa,
  regraAplica,
  semanasDoMes,
  somarDias,
  type Regra,
} from "./index.ts";
import { deDias, diasNoMes, paraDias, partesDaData } from "./datas.ts";
import { criarLocal } from "./teste-util.ts";

/** Datas entre 2000 e 2100. */
const data = fc.integer({ min: paraDias("2000-01-01"), max: paraDias("2100-12-31") }).map(deDias);
const diaSemana = fc.constantFrom(...DIAS_DA_SEMANA);
const dias = fc.uniqueArray(diaSemana, { minLength: 1, maxLength: 7 });
const hora = fc
  .tuple(fc.integer({ min: 6, max: 22 }), fc.constantFrom(0, 15, 30, 45))
  .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
const regraSimples = fc.record({
  tipo: fc.constantFrom("missa" as const, "confissoes" as const),
  dias,
  hora,
}) as fc.Arbitrary<Regra>;

describe("propriedades", () => {
  it("uma regra sem condições aplica-se exatamente aos seus dias", () => {
    fc.assert(
      fc.property(dias, data, (d, quando) => {
        const regra = { tipo: "missa", dias: d, hora: "10:00" } as Regra;
        expect(regraAplica(regra, quando)).toBe(d.includes(diaDaSemana(quando)));
      }),
    );
  });

  it("aritmética de datas: ida e volta, e o dia da semana avança um por dia", () => {
    fc.assert(
      fc.property(data, fc.integer({ min: -1000, max: 1000 }), (d, n) => {
        expect(somarDias(somarDias(d, n), -n)).toBe(d);
        const i = DIAS_DA_SEMANA.indexOf(diaDaSemana(d));
        expect(diaDaSemana(somarDias(d, 1))).toBe(DIAS_DA_SEMANA[(i + 1) % 7]);
      }),
    );
  });

  it("semana do mês = ceil(dia/7); -1 só na última ocorrência", () => {
    fc.assert(
      fc.property(data, (d) => {
        const { ano, mes, dia } = partesDaData(d);
        const semanas = semanasDoMes(d);
        expect(semanas[0]).toBe(Math.ceil(dia / 7));
        expect(semanas.includes(-1)).toBe(dia + 7 > diasNoMes(ano, mes));
      }),
    );
  });

  it("a época coincide com a hora legal de Lisboa calculada pelo Intl", () => {
    fc.assert(
      fc.property(data, (d) => {
        const aoMeioDiaUTC = momentoEmLisboa(new Date(`${d}T12:00:00Z`)).hora;
        expect(epocaDe(d)).toBe(aoMeioDiaUTC === "13:00" ? "verao" : "inverno");
      }),
    );
  });

  it("a Páscoa é um domingo entre 22 de março e 25 de abril", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2200 }), (ano) => {
        const p = pascoa(ano);
        expect(diaDaSemana(p)).toBe("dom");
        expect(p >= `${ano}-03-22` && p <= `${ano}-04-25`).toBe(true);
      }),
    );
  });

  it("a expansão não depende da ordem das regras e vem ordenada", () => {
    fc.assert(
      fc.property(fc.array(regraSimples, { maxLength: 6 }), data, (regras, de) => {
        const ate = somarDias(de, 13);
        const sem = (l: ReturnType<typeof ocorrencias>) => l.map(({ regra: _r, ...o }) => o);
        const a = sem(ocorrencias(criarLocal("t", regras), de, ate));
        const b = sem(ocorrencias(criarLocal("t", [...regras].reverse()), de, ate));
        expect(b).toEqual(a);
        const chaves = a.map((o) => `${o.data} ${o.hora}`);
        expect([...chaves].sort()).toEqual(chaves);
      }),
    );
  });

  it("cancelar só num dia não mexe nos outros dias", () => {
    fc.assert(
      fc.property(regraSimples, data, fc.integer({ min: 0, max: 27 }), (regra, de, n) => {
        const local = criarLocal("t", [regra]);
        const ate = somarDias(de, 27);
        const alvo = somarDias(de, n);
        const depois = aplicarMudanca(local, {
          acao: "apagar",
          indice: 0,
          natureza: { tipo: "so_num_dia", data: alvo },
        });
        const antes = ocorrencias(local, de, ate);
        expect(ocorrencias(depois, de, ate)).toEqual(antes.filter((o) => o.data !== alvo));
      }),
    );
  });

  it("suspender durante um período só tira as celebrações desse período", () => {
    fc.assert(
      fc.property(
        regraSimples,
        data,
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (regra, de, inicio, duracao) => {
          const local = criarLocal("t", [regra]);
          const ate = somarDias(de, 70);
          const p = { de: somarDias(de, inicio), ate: somarDias(de, inicio + duracao) };
          const depois = aplicarMudanca(local, {
            acao: "apagar",
            indice: 0,
            natureza: { tipo: "periodo", ...p },
          });
          const esperado = ocorrencias(local, de, ate).filter(
            (o) => o.data < p.de || o.data > p.ate,
          );
          const sem = (l: ReturnType<typeof ocorrencias>) => l.map(({ regra: _r, ...o }) => o);
          expect(sem(ocorrencias(depois, de, ate))).toEqual(sem(esperado));
        },
      ),
    );
  });
});
