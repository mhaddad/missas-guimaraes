/**
 * Peças do navegador comuns à página principal e à página de cada paróquia: construtores de DOM
 * (sem innerHTML com dados), etiquetas de uma celebração (§6.5), selos (§6.6), "Como chegar" e
 * partilha.
 */
import { etiquetas as etiquetasDaRegra } from "@missas/horarios";
import { formatar, TEXTOS, type Idioma, type TipoEntidade } from "../i18n/index.ts";
import {
  ligacaoMapa,
  periodo,
  selo,
  type CelebracaoPortal,
  type LocalPortal,
} from "../lib/portal.ts";
import { formatarDiaDaSemanaEData } from "../lib/formatos.ts";
import { classeSelo, textoSelo } from "../lib/selo.ts";

export function porId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta o elemento #${id}`);
  return el as T;
}

// --- Pequenos construtores de DOM ---------------------------------------------------------------

type Filho = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string | boolean | undefined> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    if (nome === "class") el.className = String(valor);
    else el.setAttribute(nome, valor === true ? "" : valor);
  }
  for (const f of filhos) if (f) el.append(f);
  return el;
}

export function icone(nome: string, classe = "size-5"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", `shrink-0 fill-current ${classe}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#i-${nome}`);
  svg.append(use);
  return svg;
}

// --- Selos ----------------------------------------------------------------------------------------

/** Selo curto; vazio (sem confirmação) não aparece. */
export function seloCurto(
  idioma: Idioma,
  local: LocalPortal,
  hoje: string,
  extra = "",
): HTMLSpanElement | null {
  const { estado: e, dias } = selo(local.confirmado_em, hoje);
  const texto = textoSelo(idioma, "curto", e, dias, local.confirmado_em, local.entidade.tipo);
  return texto ? h("span", { class: `selo-curto ${classeSelo(e)} ${extra}` }, texto) : null;
}

/** Recalcula os selos do HTML do servidor com a data de hoje. */
export function atualizarSelos(idioma: Idioma, raiz: ParentNode, hoje: string): void {
  raiz.querySelectorAll<HTMLElement>("[data-selo]").forEach((el) => {
    const forma = el.dataset.selo === "longo" ? "longo" : "curto";
    const confirmadoEm = el.dataset.confirmadoEm || null;
    const { estado: e, dias } = selo(confirmadoEm, hoje);
    el.textContent = textoSelo(
      idioma,
      forma,
      e,
      dias,
      confirmadoEm,
      el.dataset.entidadeTipo as TipoEntidade,
    );
    el.hidden = el.textContent === "";
    el.classList.remove(
      "bg-confirmado-fundo",
      "text-confirmado",
      "bg-aviso-fundo",
      "text-dourado-texto",
      "bg-slate-100",
      "text-texto-secundario",
    );
    el.classList.add(...classeSelo(e).split(" "));
  });
}

/** Mostra os botões que só funcionam com JavaScript (partilhar e, se houver formulário, reportar). */
export function prepararAcoes(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLButtonElement>("[data-partilhar]").forEach((b) => (b.hidden = false));
  if (document.getElementById("relato")) {
    raiz.querySelectorAll<HTMLButtonElement>("[data-relatar]").forEach((b) => (b.hidden = false));
  }
}

// --- Etiquetas de uma celebração (§6.5) ---------------------------------------------------------

export function etiquetasDe(
  idioma: Idioma,
  o: CelebracaoPortal,
  local: LocalPortal,
  /** O tipo já está no título da linha (página da paróquia): sem etiqueta do tipo. */
  semTipo = false,
): HTMLElement[] {
  const t = TEXTOS[idioma];
  /** Texto da etiqueta automática "Vespertina" do motor, neste idioma. */
  const vespertina = etiquetasDaRegra({ tipo: "missa", dias: ["sab"], hora: "18:00" }, idioma)[1];
  const lista: HTMLElement[] = [];
  const neutra = "etiqueta bg-slate-100 text-texto-secundario";
  const destaque = "etiqueta bg-aviso-fundo text-dourado-texto";
  const azul = "etiqueta bg-azul-fundo text-azul-texto";
  if (o.tipo !== "missa" && !semTipo) lista.push(h("span", { class: azul }, t.tipos[o.tipo]));
  if (o.vespera)
    lista.push(
      h(
        "span",
        { class: destaque },
        formatar(t.etiquetaVespera, { dia: String(Number(o.data.slice(8, 10))) }),
      ),
    );
  if (o.dia_santo) lista.push(h("span", { class: destaque }, t.etiquetaDiaSanto));
  if (o.origem === "excecao") lista.push(h("span", { class: destaque }, t.etiquetaSoNesteDia));
  if (o.hora_original) {
    lista.push(
      h("span", { class: destaque }, formatar(t.etiquetaEmVezDe, { hora: o.hora_original })),
    );
  }
  const regra = o.regra === undefined ? undefined : local.horarios[o.regra];
  if (regra) {
    // A época já está implícita no dia escolhido.
    const { epoca: _e, ...semEpoca } = regra;
    const automaticas = etiquetasDaRegra(semEpoca, idioma);
    // "Semanal" é o normal: não se mostra. A vespertina já tem etiqueta própria no domingo.
    const semFrequenciaBase =
      regra.semanas_do_mes || regra.quinzenal ? automaticas : automaticas.slice(1);
    for (const texto of semFrequenciaBase) {
      if (o.vespera && texto === vespertina) continue;
      lista.push(h("span", { class: neutra }, texto));
    }
  }
  const nota =
    regra?.nota_i18n && idioma !== "pt-PT" ? (regra.nota_i18n[idioma] ?? o.nota) : o.nota;
  if (nota) lista.push(h("span", { class: azul }, nota));
  if (o.confissoesAs?.length) {
    lista.push(
      h(
        "span",
        { class: azul },
        formatar(t.etiquetaConfissoes, { hora: o.confissoesAs.join(", ") }),
      ),
    );
  }
  return lista;
}

// --- Linhas e botões ----------------------------------------------------------------------------

export function lugarDe(local: Pick<LocalPortal, "localidade" | "concelho">): string {
  return [local.localidade, local.concelho].filter(Boolean).join(" · ");
}

/** "Como chegar": sempre o Google Maps, com o caminho até à igreja. */
export function botaoComoChegar(
  idioma: Idioma,
  local: LocalPortal,
  classe = "botao-secundario",
): HTMLAnchorElement {
  return h(
    "a",
    { class: classe, href: ligacaoMapa(local.geo), target: "_blank", rel: "noopener" },
    icone("navigation"),
    h(
      "span",
      { class: classe === "botao-secundario" ? "sr-only sm:not-sr-only" : "" },
      TEXTOS[idioma].comoChegar,
    ),
  );
}

/** Caixa da hora de uma celebração (hora, período e fim, se houver). */
export function caixaHora(idioma: Idioma, o: CelebracaoPortal): HTMLDivElement {
  const t = TEXTOS[idioma];
  return h(
    "div",
    {
      class:
        "flex w-[4.5rem] shrink-0 flex-col items-center rounded-cartao bg-superficie py-2 md:w-24",
    },
    h("span", { class: "text-timetable-time font-bold tabular-nums" }, o.hora),
    h(
      "span",
      { class: "text-xs font-bold tracking-wide text-texto-secundario uppercase" },
      t[periodo(o.hora)],
    ),
    o.hora_fim &&
      h("span", { class: "text-xs text-texto-secundario tabular-nums" }, `– ${o.hora_fim}`),
  );
}

export function quandoTexto(idioma: Idioma, minutos: number): string {
  const t = TEXTOS[idioma];
  if (minutos <= 0) return t.agora;
  if (minutos < 60) return formatar(t.emMinutos, { min: minutos });
  return formatar(t.emHoras, { h: Math.floor(minutos / 60), min: minutos % 60 });
}

// --- Partilhar ----------------------------------------------------------------------------------

/** Liga os botões `[data-partilhar]` (partilha do sistema ou, sem ela, copiar a ligação). */
export function iniciarPartilha(idioma: Idioma): void {
  const aviso = h("p", {
    class:
      "fixed inset-x-4 bottom-20 z-20 mx-auto max-w-sm rounded-cartao bg-ardosia px-4 py-3 text-center text-white md:bottom-6",
    role: "status",
    hidden: true,
  });
  document.body.append(aviso);

  async function partilhar(caminho: string, titulo: string): Promise<void> {
    const url = new URL(caminho, location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
      } catch {
        // cancelado pela pessoa
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    aviso.textContent = TEXTOS[idioma].ligacaoCopiada;
    aviso.hidden = false;
    setTimeout(() => (aviso.hidden = true), 2500);
  }

  document.addEventListener("click", (e) => {
    const botao = (e.target as Element).closest<HTMLElement>("[data-partilhar]");
    if (!botao) return;
    e.preventDefault();
    void partilhar(botao.dataset.partilhar ?? "/", botao.dataset.titulo ?? document.title);
  });
}

/** Marca o botão escolhido num grupo segmentado (`aria-pressed`). */
/**
 * As linhas da lista do dia. Na escolha "Próx. domingo", as missas vespertinas de sábado ficam
 * num bloco próprio, antes das de domingo, cada bloco com o seu título.
 */
export function comBlocosDoDomingo(
  idioma: Idioma,
  celebracoes: readonly CelebracaoPortal[],
  linha: (o: CelebracaoPortal) => HTMLElement,
): HTMLElement[] {
  const vesperas = celebracoes.filter((o) => o.vespera);
  if (vesperas.length === 0) return celebracoes.map(linha);
  const domingo = celebracoes.filter((o) => !o.vespera);
  const t = TEXTOS[idioma];
  const titulo = (texto: string) =>
    h(
      "li",
      { class: "mt-2 text-sm font-semibold text-texto-secundario first:mt-0" },
      texto.charAt(0).toLocaleUpperCase(idioma) + texto.slice(1),
    );
  const sabado = vesperas[0]?.data ?? "";
  const dataDomingo = domingo[0]?.data;
  return [
    titulo(formatar(t.blocoVespertinas, { data: formatarDiaDaSemanaEData(sabado, idioma) })),
    ...vesperas.map(linha),
    ...(dataDomingo ? [titulo(formatarDiaDaSemanaEData(dataDomingo, idioma))] : []),
    ...domingo.map(linha),
  ];
}

export function marcar(seletor: string, atributo: string, valor: string): void {
  document.querySelectorAll<HTMLElement>(seletor).forEach((b) => {
    b.setAttribute("aria-pressed", String(b.getAttribute(atributo) === valor));
  });
}
