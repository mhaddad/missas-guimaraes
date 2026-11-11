/**
 * Base dos modais de alteração do painel (horário, exceção, dias santos): campos com aspeto de
 * botão, resumo ao vivo do que vai mudar (motor), erros de validação, alertas de anomalia com
 * *Tenho a certeza* e *Gravar*. Cada modal só diz como calcular o local alterado.
 */
import { alertasDeAnomalia, resumirPedido } from "@missas/dados/resumo";
import { momentoEmLisboa, validar, type Local } from "@missas/horarios";
import { h } from "./painel-comum.ts";

export interface LocalComSha {
  local: Local;
  sha: string | null;
}

/** O que um modal devolve para enviar: o local alterado. */
export interface Alteracao {
  local: LocalComSha;
  depois: Local;
  confirmarAlertas: boolean;
}

export const hoje = () => momentoEmLisboa(new Date()).data;

let contador = 0;
export const novoId = (prefixo: string) => `${prefixo}-${++contador}`;

/** Opção com aspeto de botão (rádio ou caixa); o input fica escondido mas acessível. */
export function opcao(
  tipo: "radio" | "checkbox",
  nome: string,
  valor: string,
  texto: string,
  marcada: boolean,
): HTMLLabelElement {
  return h(
    "label",
    { class: "opcao" },
    h("input", { type: tipo, name: nome, value: valor, class: "sr-only", checked: marcada }),
    texto,
  );
}

export function grupo(legenda: string, ...filhos: (Node | false | null)[]): HTMLFieldSetElement {
  return h(
    "fieldset",
    { class: "grid gap-2" },
    h("legend", { class: "rotulo mb-2" }, legenda),
    h("div", { class: "flex flex-wrap gap-2" }, ...filhos),
  );
}

export function campo(rotulo: string, entrada: HTMLElement, ajuda?: string): HTMLElement {
  const id = novoId("campo");
  entrada.id = id;
  return h(
    "div",
    { class: "grid gap-1" },
    h("label", { for: id, class: "rotulo" }, rotulo),
    entrada,
    ajuda ? h("p", { class: "text-sm text-texto-secundario" }, ajuda) : null,
  );
}

export const valorDe = (form: HTMLFormElement, nome: string): string =>
  (form.elements.namedItem(nome) as HTMLInputElement | RadioNodeList | null)?.value ?? "";

export const marcados = (form: HTMLFormElement, nome: string): string[] =>
  [...form.querySelectorAll<HTMLInputElement>(`input[name="${nome}"]:checked`)].map((i) => i.value);

/** Seletor do local (só aparece quando a entidade tem vários). */
export function seletorLocal(
  locais: LocalComSha[],
  indice: number,
  fixo: boolean,
): HTMLElement | null {
  if (locais.length < 2) return null;
  return campo(
    "Local",
    h(
      "select",
      { name: "local", class: "campo", disabled: fixo },
      ...locais.map((l, i) =>
        h("option", { value: String(i), selected: i === indice }, l.local.nome),
      ),
    ),
  );
}

/** O resultado de um cálculo: o local alterado, ou uma mensagem (erro ou indicação). */
export type Calculo =
  { escolhido: LocalComSha; depois: Local } | { mensagem: string; erro: boolean };

export interface OpcoesModal {
  dialogo: HTMLDialogElement;
  titulo: string;
  textoGravar: string;
  /** Antes dos campos (ex.: o horário que se vai apagar). */
  cabecalho?: Node | null;
  campos: (Node | null)[];
  calcular(form: HTMLFormElement): Calculo;
  /** Corre a cada mudança, antes de calcular (ex.: mostrar ou esconder campos). */
  aoMudar?(form: HTMLFormElement): void;
}

/**
 * Abre o modal e resolve com a alteração a gravar, ou `null` se a pessoa cancelar. Só fecha
 * com *Gravar* quando há uma mudança válida (e, com alertas, depois de *Tenho a certeza*).
 */
export function abrirModal(opcoes: OpcoesModal): Promise<Alteracao | null> {
  const { dialogo } = opcoes;
  const idTitulo = novoId("titulo");
  const resumo = h("div", { class: "grid gap-2", "aria-live": "polite" });
  const confirmar = h(
    "label",
    { class: "flex min-h-12 items-center gap-3 font-semibold", hidden: true },
    h("input", { type: "checkbox", name: "confirmar_alertas", class: "size-5" }),
    "Tenho a certeza",
  );
  const gravar = h(
    "button",
    {
      type: "submit",
      class:
        "inline-flex min-h-12 items-center rounded-cartao bg-ardosia px-5 text-base font-semibold text-white disabled:opacity-50",
    },
    opcoes.textoGravar,
  );
  const cancelar = h("button", { type: "button", class: "botao-secundario" }, "Cancelar");
  const form = h(
    "form",
    { class: "grid gap-5 p-5 md:p-6", novalidate: true },
    h("h2", { id: idTitulo, class: "text-xl font-semibold" }, opcoes.titulo),
    opcoes.cabecalho ?? null,
    ...opcoes.campos,
    h(
      "section",
      { class: "grid gap-2 rounded-cartao border border-borda bg-superficie p-4" },
      h("h3", { class: "rotulo" }, "O que vai mudar"),
      resumo,
    ),
    confirmar,
    h("div", { class: "flex flex-wrap justify-end gap-3" }, cancelar, gravar),
  );
  dialogo.setAttribute("aria-labelledby", idTitulo);
  dialogo.replaceChildren(form);

  let pronta: Alteracao | null = null;
  const mensagem = (texto: string, erro: boolean) => {
    gravar.disabled = true;
    confirmar.hidden = true;
    resumo.replaceChildren(
      h("p", { class: erro ? "font-semibold text-erro" : "text-texto-secundario" }, texto),
    );
  };

  const atualizar = () => {
    opcoes.aoMudar?.(form);
    pronta = null;
    const calculo = opcoes.calcular(form);
    if ("mensagem" in calculo) return mensagem(calculo.mensagem, calculo.erro);
    const { escolhido, depois } = calculo;
    const erros = validar(depois, { hoje: hoje() }).filter((p) => p.nivel === "erro");
    if (erros.length > 0) return mensagem(erros.map((e) => e.mensagem).join(" "), true);
    const pares = [{ antes: escolhido.local, depois }];
    const linhas = resumirPedido(pares).flatMap((r) => r.linhas);
    if (linhas.length === 0) return mensagem("Nada muda.", false);
    const alertas = alertasDeAnomalia(pares);
    resumo.replaceChildren(h("ul", { class: "grid gap-1" }, ...linhas.map((l) => h("li", {}, l))));
    if (alertas.length > 0)
      resumo.append(
        h(
          "div",
          { class: "rounded-cartao bg-aviso-fundo p-3 text-dourado-texto", role: "note" },
          ...alertas.map((a) => h("p", {}, a)),
        ),
      );
    confirmar.hidden = alertas.length === 0;
    const certeza = (form.elements.namedItem("confirmar_alertas") as HTMLInputElement).checked;
    pronta = { local: escolhido, depois, confirmarAlertas: alertas.length > 0 };
    gravar.disabled = alertas.length > 0 && !certeza;
  };

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  atualizar();

  return new Promise((resolver) => {
    let resultado: Alteracao | null = null;
    cancelar.addEventListener("click", () => dialogo.close());
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      atualizar();
      if (!pronta || gravar.disabled) return;
      resultado = pronta;
      dialogo.close();
    });
    dialogo.addEventListener("close", () => resolver(resultado), { once: true });
    dialogo.showModal();
  });
}
