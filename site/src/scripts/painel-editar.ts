/**
 * E-2 e E-3 — Novo / editar / apagar horário (§7.3-B, P2). Cada gravação é um pedido (D24).
 *
 * O formulário dá uma regra e a natureza da mudança (*a partir de quando*, *durante um período*,
 * *só num dia*); o motor (`aplicarMudanca`) converte-a em regras e exceções, `validar` aponta os
 * erros e `resumirPedido` mostra o que vai mudar, ao vivo, antes de gravar. O mesmo cálculo é
 * repetido no Worker e no GitHub Actions.
 */
import {
  aplicarMudanca,
  descreverRegra,
  MudancaInvalida,
  ocorrencias,
  somarDias,
  type Dia,
  type Local,
  type Mudanca,
  type Natureza,
  type Regra,
} from "@missas/horarios";
import { h } from "./painel-comum.ts";
import {
  abrirModal,
  campo,
  grupo,
  hoje,
  marcados,
  opcao,
  seletorLocal,
  valorDe,
  type Alteracao,
  type Calculo,
  type LocalComSha,
} from "./painel-modal.ts";

export type { Alteracao, LocalComSha } from "./painel-modal.ts";

const TIPOS: [Regra["tipo"], string][] = [
  ["missa", "Missa"],
  ["confissoes", "Confissões"],
  ["adoracao", "Adoração"],
  ["terco", "Terço"],
  ["outro", "Outra celebração"],
];

const DIAS: [Dia, string][] = [
  ["seg", "Seg"],
  ["ter", "Ter"],
  ["qua", "Qua"],
  ["qui", "Qui"],
  ["sex", "Sex"],
  ["sab", "Sáb"],
  ["dom", "Dom"],
  ["santo", "Dias santos"],
];

const SEMANAS: [number, string][] = [
  [1, "1.ª"],
  [2, "2.ª"],
  [3, "3.ª"],
  [4, "4.ª"],
  [5, "5.ª"],
  [-1, "Última"],
];

/** Próxima data em que a regra `indice` acontece (para *Cancelar só numa data*). */
function proximaData(local: Local, indice: number): string {
  const de = hoje();
  const proxima = ocorrencias(local, de, somarDias(de, 120)).find(
    (o) => o.origem === "regra" && o.regra === indice,
  );
  return proxima?.data ?? de;
}

/** Campos da natureza da mudança (D16): sempre perguntada antes de gravar. */
function camposNatureza(modo: "novo" | "editar" | "apagar", local: Local, indice?: number) {
  const dataHoje = hoje();
  const opcoesNatureza: [Natureza["tipo"], string, HTMLElement][] =
    modo === "apagar"
      ? [
          [
            "so_num_dia",
            "Cancelar só numa data",
            h("input", {
              type: "date",
              name: "dia",
              class: "campo",
              value: indice === undefined ? dataHoje : proximaData(local, indice),
              min: dataHoje,
              "aria-label": "Data a cancelar",
            }),
          ],
          [
            "periodo",
            "Suspender durante um período",
            h(
              "span",
              { class: "flex flex-wrap items-center gap-2" },
              h("input", {
                type: "date",
                name: "periodo_de",
                class: "campo",
                value: dataHoje,
                "aria-label": "Início do período",
              }),
              "a",
              h("input", {
                type: "date",
                name: "periodo_ate",
                class: "campo",
                value: dataHoje,
                "aria-label": "Fim do período",
              }),
            ),
          ],
          [
            "habitual",
            "Deixar de haver a partir de",
            h("input", {
              type: "date",
              name: "habitual_de",
              class: "campo",
              value: dataHoje,
              "aria-label": "Deixa de haver a partir de",
            }),
          ],
        ]
      : [
          [
            "habitual",
            modo === "novo" ? "Passa a haver a partir de" : "A mudança vale a partir de",
            h("input", {
              type: "date",
              name: "habitual_de",
              class: "campo",
              value: dataHoje,
              "aria-label": "A partir de",
            }),
          ],
          [
            "periodo",
            "Só durante um período",
            h(
              "span",
              { class: "flex flex-wrap items-center gap-2" },
              h("input", {
                type: "date",
                name: "periodo_de",
                class: "campo",
                value: dataHoje,
                "aria-label": "Início do período",
              }),
              "a",
              h("input", {
                type: "date",
                name: "periodo_ate",
                class: "campo",
                value: dataHoje,
                "aria-label": "Fim do período",
              }),
            ),
          ],
          [
            "so_num_dia",
            "Só num dia",
            h("input", {
              type: "date",
              name: "dia",
              class: "campo",
              value: dataHoje,
              "aria-label": "Dia",
            }),
          ],
        ];
  return h(
    "fieldset",
    { class: "grid gap-2" },
    h(
      "legend",
      { class: "rotulo mb-2" },
      modo === "apagar" ? "O que quer fazer?" : "A partir de quando?",
    ),
    ...opcoesNatureza.map(([valor, texto, entrada], i) =>
      h(
        "div",
        { class: "flex flex-wrap items-center gap-3 rounded-cartao border border-borda p-3" },
        h(
          "label",
          { class: "flex min-h-12 items-center gap-3 font-semibold" },
          h("input", {
            type: "radio",
            name: "natureza",
            value: valor,
            checked: i === 0,
            class: "size-5",
          }),
          texto,
        ),
        entrada,
      ),
    ),
  );
}

function lerNatureza(form: HTMLFormElement): Natureza {
  const tipo = valorDe(form, "natureza") as Natureza["tipo"];
  if (tipo === "so_num_dia") return { tipo, data: valorDe(form, "dia") };
  if (tipo === "periodo")
    return { tipo, de: valorDe(form, "periodo_de"), ate: valorDe(form, "periodo_ate") };
  const de = valorDe(form, "habitual_de");
  return de ? { tipo: "habitual", de } : { tipo: "habitual" };
}

/** A regra que o formulário descreve, partindo da original (mantém meses, idioma…). */
function lerRegra(form: HTMLFormElement, original?: Regra): Regra | string {
  const dias = marcados(form, "dias") as Dia[];
  if (dias.length === 0) return "Escolha pelo menos um dia.";
  const hora = valorDe(form, "hora");
  if (!/^\d{2}:\d{2}$/.test(hora)) return "Indique a hora.";
  const horaFim = valorDe(form, "hora_fim");
  if (horaFim && horaFim <= hora) return "A hora de fim tem de ser depois da hora de início.";
  const nota = valorDe(form, "nota").trim();
  const {
    semanas_do_mes: _s,
    quinzenal: _q,
    epoca: _e,
    hora_fim: _hf,
    nota: _n,
    ...base
  } = original ?? ({} as Partial<Regra>);
  const regra = {
    ...base,
    tipo: valorDe(form, "tipo") as Regra["tipo"],
    dias: dias as Regra["dias"],
    hora,
  } as Regra;
  if (horaFim) regra.hora_fim = horaFim;
  const frequencia = valorDe(form, "frequencia");
  if (frequencia === "semanas") {
    const semanas = marcados(form, "semanas").map(Number);
    if (semanas.length === 0) return "Escolha as semanas do mês.";
    regra.semanas_do_mes = semanas as NonNullable<Regra["semanas_do_mes"]>;
  } else if (frequencia === "quinzenal") {
    const referencia = valorDe(form, "quinzenal_ref");
    if (!referencia) return "Indique a próxima data da celebração quinzenal.";
    regra.quinzenal = { referencia };
  }
  const epoca = valorDe(form, "epoca");
  if (epoca === "verao" || epoca === "inverno") regra.epoca = epoca;
  if (nota) regra.nota = nota;
  return regra;
}

/** Formulário de E-2 (novo ou editar). */
function formularioHorario(locais: LocalComSha[], indiceLocal: number, regra?: Regra) {
  const r = regra;
  const frequencia = r?.semanas_do_mes ? "semanas" : r?.quinzenal ? "quinzenal" : "semanal";
  const horaFim = h("input", {
    type: "time",
    name: "hora_fim",
    class: "campo",
    step: "300",
    value: r?.hora_fim ?? "",
  });
  const caixaSemanas = h(
    "div",
    { class: "flex flex-wrap gap-2", hidden: frequencia !== "semanas" },
    ...SEMANAS.map(([n, t]) =>
      opcao("checkbox", "semanas", String(n), t, r?.semanas_do_mes?.includes(n as never) ?? false),
    ),
  );
  const caixaQuinzenal = h(
    "div",
    { hidden: frequencia !== "quinzenal" },
    campo(
      "Próxima data",
      h("input", {
        type: "date",
        name: "quinzenal_ref",
        class: "campo",
        value: r?.quinzenal?.referencia ?? "",
      }),
      "Uma data em que há esta celebração; o painel conta de 15 em 15 dias a partir dela.",
    ),
  );
  return {
    caixaSemanas,
    caixaQuinzenal,
    campos: [
      h(
        "div",
        { class: "grid gap-4 sm:grid-cols-2" },
        seletorLocal(locais, indiceLocal, regra !== undefined),
        campo(
          "Hora",
          h("input", {
            type: "time",
            name: "hora",
            class: "campo text-xl font-semibold",
            step: "300",
            required: true,
            value: r?.hora ?? "",
          }),
          "Hora de Portugal continental.",
        ),
      ),
      grupo(
        "Tipo de celebração",
        ...TIPOS.map(([v, t], i) => opcao("radio", "tipo", v, t, r ? r.tipo === v : i === 0)),
      ),
      grupo(
        "Dias",
        ...DIAS.map(([v, t]) => opcao("checkbox", "dias", v, t, r?.dias.includes(v) ?? false)),
      ),
      h(
        "div",
        { class: "grid gap-4 sm:grid-cols-2" },
        campo("Até às (opcional)", horaFim, "Para confissões ou adoração com hora de fim."),
      ),
      grupo(
        "Frequência",
        opcao("radio", "frequencia", "semanal", "Todas as semanas", frequencia === "semanal"),
        opcao("radio", "frequencia", "semanas", "Algumas semanas do mês", frequencia === "semanas"),
        opcao("radio", "frequencia", "quinzenal", "De 15 em 15 dias", frequencia === "quinzenal"),
      ),
      caixaSemanas,
      caixaQuinzenal,
      grupo(
        "Época",
        opcao("radio", "epoca", "todo", "Todo o ano", !r?.epoca),
        opcao("radio", "epoca", "verao", "Só no verão", r?.epoca === "verao"),
        opcao("radio", "epoca", "inverno", "Só no inverno", r?.epoca === "inverno"),
      ),
      campo(
        "Nota (opcional)",
        h("input", {
          type: "text",
          name: "nota",
          class: "campo",
          maxlength: "40",
          value: r?.nota ?? "",
          placeholder: "Ex.: Missa de jovens",
        }),
        "Aparece no site junto do horário. Até 40 caracteres.",
      ),
    ],
  };
}

export interface OpcoesEditor {
  dialogo: HTMLDialogElement;
  locais: LocalComSha[];
  modo: "novo" | "editar" | "apagar";
  /** Local e índice da regra em `local.horarios` (editar e apagar). */
  indiceLocal?: number;
  indiceRegra?: number;
}

/** Abre E-2 (novo/editar) ou E-3 (apagar); resolve com a alteração a gravar, ou `null`. */
export function abrirEditor(opcoes: OpcoesEditor): Promise<Alteracao | null> {
  const { dialogo, locais, modo } = opcoes;
  const indiceLocal = opcoes.indiceLocal ?? 0;
  const original = locais[indiceLocal];
  if (!original) return Promise.resolve(null);
  const regraOriginal =
    opcoes.indiceRegra === undefined ? undefined : original.local.horarios[opcoes.indiceRegra];
  const formulario =
    modo === "apagar" ? null : formularioHorario(locais, indiceLocal, regraOriginal);

  const calcular = (form: HTMLFormElement): Calculo => {
    const escolhido = locais[Number(valorDe(form, "local") || indiceLocal)] ?? original;
    const natureza = lerNatureza(form);
    let mudanca: Mudanca;
    if (modo === "apagar") {
      mudanca = { acao: "apagar", indice: opcoes.indiceRegra ?? -1, natureza };
    } else {
      const regra = lerRegra(form, regraOriginal);
      if (typeof regra === "string") return { mensagem: regra, erro: false };
      mudanca =
        modo === "novo"
          ? { acao: "adicionar", regra, natureza }
          : { acao: "editar", indice: opcoes.indiceRegra ?? -1, regra, natureza };
    }
    try {
      return { escolhido, depois: aplicarMudanca(escolhido.local, mudanca) };
    } catch (e) {
      return {
        mensagem: e instanceof MudancaInvalida ? e.message : "Não foi possível aplicar a mudança.",
        erro: true,
      };
    }
  };

  return abrirModal({
    dialogo,
    titulo: { novo: "Novo horário", editar: "Editar horário", apagar: "Apagar horário" }[modo],
    textoGravar: modo === "apagar" ? "Apagar" : "Gravar",
    cabecalho:
      modo === "apagar" && regraOriginal
        ? h(
            "div",
            { class: "rounded-cartao bg-superficie p-4" },
            h(
              "p",
              { class: "font-semibold" },
              descreverRegra(regraOriginal, "pt-PT", { comTipo: true }),
            ),
            h("p", { class: "text-texto-secundario" }, original.local.nome),
          )
        : null,
    campos: [
      ...(formulario?.campos ?? []),
      camposNatureza(modo, original.local, opcoes.indiceRegra),
    ],
    calcular,
    aoMudar: (form) => {
      if (!formulario) return;
      const freq = valorDe(form, "frequencia");
      formulario.caixaSemanas.hidden = freq !== "semanas";
      formulario.caixaQuinzenal.hidden = freq !== "quinzenal";
    },
  });
}
