/**
 * P4 — Regime dos dias santos de preceito de um local (§4.5-A): *Horário de domingo*,
 * *Horário próprio* (com as horas, que viram regras `dias: [santo]`) ou *Horário normal do dia*.
 * Segue o circuito normal de um pedido `alteracao`.
 */
import { descreverRegra, type Local, type Regra } from "@missas/horarios";
import { h } from "./painel-comum.ts";
import {
  abrirModal,
  campo,
  valorDe,
  type Alteracao,
  type Calculo,
  type LocalComSha,
} from "./painel-modal.ts";

type Regime = NonNullable<Local["dias_santos"]>;

const REGIMES: [Regime, string, string][] = [
  ["horario_domingo", "Horário de domingo", "As mesmas missas de um domingo."],
  ["horario_proprio", "Horário próprio", "Horas próprias, diferentes das do domingo."],
  ["horario_habitual", "Horário normal do dia", "As missas do dia da semana em que calha."],
];

const MAX_HORAS_NOVAS = 3;

export function abrirDiasSantos(opcoes: {
  dialogo: HTMLDialogElement;
  locais: LocalComSha[];
  indiceLocal: number;
}): Promise<Alteracao | null> {
  const original = opcoes.locais[opcoes.indiceLocal];
  if (!original) return Promise.resolve(null);
  const { local } = original;
  const regrasSanto = local.horarios.filter((r) => r.dias.includes("santo"));

  const caixaProprio = h(
    "div",
    { class: "grid gap-3 rounded-cartao border border-borda p-4" },
    regrasSanto.length > 0 &&
      h(
        "div",
        {},
        h("p", { class: "rotulo mb-1" }, "Já registadas"),
        h(
          "ul",
          { class: "grid gap-1" },
          ...regrasSanto.map((r) => h("li", {}, descreverRegra(r, "pt-PT", { comTipo: true }))),
        ),
      ),
    h(
      "div",
      { class: "flex flex-wrap gap-3" },
      ...Array.from({ length: MAX_HORAS_NOVAS }, (_, i) =>
        campo(
          i === 0 ? "Hora da missa" : "Outra hora (opcional)",
          h("input", { type: "time", name: "hora_santo", class: "campo", step: "300" }),
        ),
      ),
    ),
    h(
      "p",
      { class: "text-sm text-texto-secundario" },
      "Para outras celebrações nos dias santos, use + Novo horário e escolha Dias santos.",
    ),
  );

  const calcular = (form: HTMLFormElement): Calculo => {
    const regime = valorDe(form, "regime") as Regime | "";
    if (!regime) return { mensagem: "Escolha uma opção.", erro: false };
    const horas = [
      ...new Set(
        [...form.querySelectorAll<HTMLInputElement>('input[name="hora_santo"]')]
          .map((i) => i.value)
          .filter(Boolean),
      ),
    ];
    let horarios = local.horarios;
    if (regime === "horario_proprio") {
      const novas: Regra[] = horas
        .filter((hora) => !regrasSanto.some((r) => r.tipo === "missa" && r.hora === hora))
        .map((hora) => ({ tipo: "missa", dias: ["santo"], hora }));
      if (regrasSanto.length === 0 && novas.length === 0)
        return { mensagem: "Indique a hora da missa nos dias santos.", erro: false };
      horarios = [...horarios, ...novas];
    }
    return { escolhido: original, depois: { ...local, dias_santos: regime, horarios } };
  };

  return abrirModal({
    dialogo: opcoes.dialogo,
    titulo: "Dias santos de preceito",
    textoGravar: "Gravar",
    campos: [
      h(
        "fieldset",
        { class: "grid gap-2" },
        h(
          "legend",
          { class: "mb-2 text-base" },
          "Nos dias santos de preceito (como 8 de dezembro), na ",
          h("strong", {}, local.nome),
          " há…",
        ),
        ...REGIMES.map(([valor, titulo, ajuda]) =>
          h(
            "label",
            { class: "flex min-h-12 items-start gap-3 rounded-cartao border border-borda p-3" },
            h("input", {
              type: "radio",
              name: "regime",
              value: valor,
              class: "mt-1 size-5",
              checked: local.dias_santos === valor,
            }),
            h(
              "span",
              {},
              h("span", { class: "block font-semibold" }, titulo),
              h("span", { class: "block text-texto-secundario" }, ajuda),
            ),
          ),
        ),
      ),
      caixaProprio,
    ],
    calcular,
    aoMudar: (form) => {
      caixaProprio.hidden = valorDe(form, "regime") !== "horario_proprio";
    },
  });
}
