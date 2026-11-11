/**
 * E-4 — Exceções numa data (P3): *Não há celebração*, *Muda a hora* ou *Celebração extra*.
 * Para cancelar ou mudar a hora, a pessoa escolhe entre as celebrações que o motor prevê para
 * essa data (nada de horas escritas à mão que não correspondam a nenhuma). As exceções não
 * renovam a confirmação dos horários (§7.4, P3).
 */
import { ocorrencias, type Excecao, type Local, type TipoCelebracao } from "@missas/horarios";
import { descreverExcecao } from "../lib/detalhe.ts";
import { h } from "./painel-comum.ts";
import {
  abrirModal,
  campo,
  grupo,
  hoje,
  opcao,
  seletorLocal,
  valorDe,
  type Alteracao,
  type Calculo,
  type LocalComSha,
} from "./painel-modal.ts";

const TIPOS: [TipoCelebracao, string][] = [
  ["missa", "Missa"],
  ["confissoes", "Confissões"],
  ["adoracao", "Adoração"],
  ["terco", "Terço"],
  ["outro", "Outra celebração"],
];
const NOME_TIPO = Object.fromEntries(TIPOS) as Record<TipoCelebracao, string>;

type Acao = Excecao["acao"];

export interface OpcoesExcecao {
  dialogo: HTMLDialogElement;
  locais: LocalComSha[];
  modo: "nova" | "editar" | "apagar";
  indiceLocal?: number;
  /** Índice em `local.excecoes` (editar e apagar). */
  indiceExcecao?: number;
}

const ordenar = (excecoes: Excecao[]) =>
  excecoes.sort(
    (a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""),
  );

/** Celebrações habituais desse local nessa data (sem as exceções já registadas). */
function celebracoesDoDia(local: Local, data: string, ignorar?: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return [];
  const semEssa = {
    ...local,
    excecoes: local.excecoes.filter((e, i) => i !== ignorar && e.data !== data),
  };
  return ocorrencias(semEssa, data, data).filter((o) => o.origem === "regra");
}

export function abrirExcecao(opcoes: OpcoesExcecao): Promise<Alteracao | null> {
  const { dialogo, locais, modo } = opcoes;
  const indiceLocal = opcoes.indiceLocal ?? 0;
  const original = locais[indiceLocal];
  if (!original) return Promise.resolve(null);
  const existente =
    opcoes.indiceExcecao === undefined ? undefined : original.local.excecoes[opcoes.indiceExcecao];

  const localEscolhido = (form: HTMLFormElement) =>
    locais[Number(valorDe(form, "local") || indiceLocal)] ?? original;

  const semExistente = (local: Local): Excecao[] =>
    local.excecoes.filter((_, i) => local !== original.local || i !== opcoes.indiceExcecao);

  if (modo === "apagar") {
    return abrirModal({
      dialogo,
      titulo: "Apagar exceção",
      textoGravar: "Apagar",
      cabecalho: existente
        ? h(
            "div",
            { class: "rounded-cartao bg-superficie p-4" },
            h("p", { class: "font-semibold" }, descreverExcecao(existente, "pt-PT")),
            h("p", { class: "text-texto-secundario" }, original.local.nome),
          )
        : null,
      campos: [h("p", {}, "Nesse dia volta a valer o horário habitual.")],
      calcular: () => ({
        escolhido: original,
        depois: { ...original.local, excecoes: semExistente(original.local) },
      }),
    });
  }

  const acaoInicial: Acao = existente?.acao ?? "cancelar";
  const celebracao = h("select", { name: "celebracao", class: "campo" });
  const caixaCelebracao = campo("Que celebração?", celebracao);
  const caixaNovaHora = campo(
    "Nova hora",
    h("input", {
      type: "time",
      name: "nova_hora",
      class: "campo",
      step: "300",
      value: existente?.acao === "alterar" ? (existente.hora ?? "") : "",
    }),
  );
  const caixaExtra = h(
    "div",
    { class: "grid gap-4" },
    grupo(
      "Tipo de celebração",
      ...TIPOS.map(([v, t]) => opcao("radio", "tipo", v, t, (existente?.tipo ?? "missa") === v)),
    ),
    h(
      "div",
      { class: "grid gap-4 sm:grid-cols-2" },
      campo(
        "Hora",
        h("input", {
          type: "time",
          name: "hora",
          class: "campo",
          step: "300",
          value: existente?.acao === "adicionar" ? (existente.hora ?? "") : "",
        }),
      ),
      campo(
        "Até às (opcional)",
        h("input", {
          type: "time",
          name: "hora_fim",
          class: "campo",
          step: "300",
          value: existente?.hora_fim ?? "",
        }),
      ),
    ),
  );

  // Só se refaz a lista quando o local ou a data mudam (para não perder a escolha).
  let chaveLista = "";
  const preencherCelebracoes = (form: HTMLFormElement) => {
    const local = localEscolhido(form).local;
    const data = valorDe(form, "data");
    const acao = valorDe(form, "acao") as Acao;
    const chave = `${local.id}|${data}|${acao}`;
    if (chave === chaveLista) return;
    chaveLista = chave;
    const lista = celebracoesDoDia(
      local,
      data,
      local === original.local ? opcoes.indiceExcecao : undefined,
    );
    const atual =
      existente && existente.acao !== "adicionar"
        ? `${existente.tipo ?? ""}|${existente.hora_original ?? existente.hora ?? ""}`
        : celebracao.value;
    celebracao.replaceChildren(
      ...(acao === "cancelar"
        ? [h("option", { value: "todas" }, "Todas as celebrações desse dia")]
        : []),
      ...lista.map((o) =>
        h(
          "option",
          { value: `${o.tipo}|${o.hora}`, selected: `${o.tipo}|${o.hora}` === atual },
          `${NOME_TIPO[o.tipo]} às ${o.hora}`,
        ),
      ),
    );
    if (acao === "alterar" && lista.length === 0)
      celebracao.replaceChildren(h("option", { value: "" }, "Nesse dia não há celebrações"));
  };

  const aoMudar = (form: HTMLFormElement) => {
    const acao = valorDe(form, "acao") as Acao;
    caixaCelebracao.hidden = acao === "adicionar";
    caixaNovaHora.hidden = acao !== "alterar";
    caixaExtra.hidden = acao !== "adicionar";
    preencherCelebracoes(form);
  };

  const calcular = (form: HTMLFormElement): Calculo => {
    const escolhido = localEscolhido(form);
    const data = valorDe(form, "data");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { mensagem: "Indique a data.", erro: false };
    if (data < hoje()) return { mensagem: "A data já passou.", erro: true };
    const acao = valorDe(form, "acao") as Acao;
    const nota = valorDe(form, "nota").trim();
    let nova: Excecao;
    if (acao === "adicionar") {
      const hora = valorDe(form, "hora");
      if (!hora) return { mensagem: "Indique a hora.", erro: false };
      const horaFim = valorDe(form, "hora_fim");
      if (horaFim && horaFim <= hora)
        return { mensagem: "A hora de fim tem de ser depois da hora de início.", erro: true };
      nova = {
        data,
        acao,
        tipo: valorDe(form, "tipo") as TipoCelebracao,
        hora,
        ...(horaFim && { hora_fim: horaFim }),
      };
    } else {
      const escolha = valorDe(form, "celebracao");
      if (!escolha) return { mensagem: "Nesse dia não há celebrações para mudar.", erro: false };
      if (acao === "cancelar") {
        if (escolha === "todas") nova = { data, acao };
        else {
          const [tipo, hora] = escolha.split("|") as [TipoCelebracao, string];
          nova = { data, acao, tipo, hora };
        }
      } else {
        const [tipo, horaOriginal] = escolha.split("|") as [TipoCelebracao, string];
        const hora = valorDe(form, "nova_hora");
        if (!hora) return { mensagem: "Indique a nova hora.", erro: false };
        if (hora === horaOriginal) return { mensagem: "A hora é a mesma.", erro: false };
        nova = { data, acao, tipo, hora_original: horaOriginal, hora };
      }
    }
    if (nota) nova.nota = nota;
    return {
      escolhido,
      depois: {
        ...escolhido.local,
        excecoes: ordenar([...semExistente(escolhido.local), nova]),
      },
    };
  };

  return abrirModal({
    dialogo,
    titulo: modo === "nova" ? "Nova exceção" : "Editar exceção",
    textoGravar: "Gravar",
    campos: [
      h(
        "div",
        { class: "grid gap-4 sm:grid-cols-2" },
        seletorLocal(locais, indiceLocal, modo === "editar"),
        campo(
          "Data",
          h("input", {
            type: "date",
            name: "data",
            class: "campo",
            min: hoje(),
            value: existente?.data ?? hoje(),
          }),
        ),
      ),
      grupo(
        "O que acontece nesse dia?",
        opcao("radio", "acao", "cancelar", "Não há celebração", acaoInicial === "cancelar"),
        opcao("radio", "acao", "alterar", "Muda a hora", acaoInicial === "alterar"),
        opcao("radio", "acao", "adicionar", "Celebração extra", acaoInicial === "adicionar"),
      ),
      caixaCelebracao,
      caixaNovaHora,
      caixaExtra,
      campo(
        "Nota (opcional)",
        h("input", {
          type: "text",
          name: "nota",
          class: "campo",
          maxlength: "80",
          value: existente?.nota ?? "",
          placeholder: "Ex.: Festa da paróquia",
        }),
        "Aparece no site junto dessa data.",
      ),
    ],
    calcular,
    aoMudar,
  });
}
