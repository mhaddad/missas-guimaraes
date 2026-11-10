/**
 * Ilha da página pública (§6.2–6.6): atalhos de dia, concelho, pesquisa, vista por hora e por
 * igreja, "A seguir", detalhe expandido, selos e partilha. Sem JavaScript a página continua a
 * mostrar todos os locais com o horário semanal.
 */
import {
  etiquetas as etiquetasDaRegra,
  momentoEmLisboa,
  prepararCalendario,
  type Ocorrencia,
} from "@missas/horarios";
import { formatar, plural, TEXTOS, type Idioma, type TipoEntidade } from "../i18n/index.ts";
import { formatarDiaCurto, formatarDiaDaSemanaEData, formatarDiaEMes } from "../lib/formatos.ts";
import {
  celebracoesDoDia,
  escreverEstado,
  filtrarLocais,
  lerEstado,
  ligacaoMapa,
  minutosAte,
  periodo,
  selo,
  type CelebracaoPortal,
  type DadosPortal,
  type Estado,
  type LocalPortal,
} from "../lib/portal.ts";
import { classeSelo, textoSelo } from "../lib/selo.ts";
import { iniciarRelatos } from "./relato.ts";

// --- Dados e estado ---------------------------------------------------------------------------

function porId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta o elemento #${id}`);
  return el as T;
}

const dados = JSON.parse(porId("dados-portal").textContent ?? "{}") as DadosPortal;
const { idioma } = JSON.parse(porId("idioma-portal").textContent ?? "{}") as { idioma: Idioma };
const t = TEXTOS[idioma];
const calendario = prepararCalendario(dados.calendario);
const locais = new Map(dados.locais.map((l) => [l.id, l]));
const apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
let estado: Estado = lerEstado(location.search);

const agora = () => momentoEmLisboa(new Date());

// --- Pequenos construtores de DOM (sem innerHTML com dados) ------------------------------------

type Filho = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
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

function icone(nome: string, classe = "size-5"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", `shrink-0 fill-current ${classe}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#i-${nome}`);
  svg.append(use);
  return svg;
}

function seloCurto(local: LocalPortal, hoje: string, extra = ""): HTMLSpanElement {
  const { estado: e, dias } = selo(local.confirmado_em, hoje);
  return h(
    "span",
    {
      class: `inline-block rounded px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${classeSelo(e)} ${extra}`,
    },
    textoSelo(idioma, "curto", e, dias, local.confirmado_em, local.entidade.tipo),
  );
}

/** Recalcula os selos do HTML estático com a data de hoje. */
function atualizarSelos(raiz: ParentNode, hoje: string): void {
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

/** Ligações de mapas para a Apple nos dispositivos Apple; botões de partilha visíveis. */
function prepararAcoes(raiz: ParentNode): void {
  if (apple) {
    raiz.querySelectorAll<HTMLAnchorElement>("a[data-mapa]").forEach((a) => {
      const [lat, lon] = (a.dataset.mapa ?? "").split(",").map(Number);
      if (lat !== undefined && lon !== undefined) a.href = ligacaoMapa({ lat, lon }, true);
    });
  }
  raiz.querySelectorAll<HTMLButtonElement>("[data-partilhar]").forEach((b) => (b.hidden = false));
  if (document.getElementById("relato")) {
    raiz.querySelectorAll<HTMLButtonElement>("[data-relatar]").forEach((b) => (b.hidden = false));
  }
}

// --- Etiquetas de uma celebração (§6.5) --------------------------------------------------------

/** Texto da etiqueta automática "Vespertina" do motor, neste idioma. */
const VESPERTINA = etiquetasDaRegra({ tipo: "missa", dias: ["sab"], hora: "18:00" }, idioma)[1];

function etiquetasDe(o: CelebracaoPortal, local: LocalPortal): HTMLElement[] {
  const lista: HTMLElement[] = [];
  const neutra = "etiqueta bg-slate-100 text-texto-secundario";
  const destaque = "etiqueta bg-aviso-fundo text-dourado-texto";
  const azul = "etiqueta bg-azul-fundo text-azul-texto";
  if (o.tipo !== "missa") lista.push(h("span", { class: azul }, t.tipos[o.tipo]));
  if (o.vespera) lista.push(h("span", { class: destaque }, t.etiquetaVespera));
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
      if (o.vespera && texto === VESPERTINA) continue;
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

// --- Linhas da vista por hora ------------------------------------------------------------------

function lugarDe(local: LocalPortal): string {
  return [local.localidade, local.concelho].filter(Boolean).join(" · ");
}

function botaoComoChegar(local: LocalPortal, classe = "botao-secundario"): HTMLAnchorElement {
  return h(
    "a",
    { class: classe, href: ligacaoMapa(local.geo, apple), target: "_blank", rel: "noopener" },
    icone("navigation"),
    h(
      "span",
      { class: classe === "botao-secundario" ? "sr-only sm:not-sr-only" : "" },
      t.comoChegar,
    ),
  );
}

/** Copia o detalhe estático do local para baixo da linha (sem ids duplicados). */
function abrirDetalhe(
  alvo: HTMLElement,
  local: LocalPortal,
  botao: HTMLButtonElement,
  hoje: string,
): void {
  const aberto = botao.getAttribute("aria-expanded") === "true";
  botao.setAttribute("aria-expanded", String(!aberto));
  alvo.hidden = aberto;
  if (!aberto && !alvo.firstChild) {
    const original = document.querySelector(`#${CSS.escape(local.id)} .detalhe`);
    if (original) {
      const copia = original.cloneNode(true) as HTMLElement;
      atualizarSelos(copia, hoje);
      prepararAcoes(copia);
      alvo.append(copia);
    }
  }
}

function linhaCelebracao(o: CelebracaoPortal, hoje: string, passada = false): HTMLLIElement {
  const local = locais.get(o.local);
  if (!local) return h("li");
  const detalheId = `detalhe-${o.local}-${o.data}-${o.hora.replace(":", "")}-${o.tipo}`;
  const botao = h(
    "button",
    {
      type: "button",
      class: "text-left text-lg font-semibold underline-offset-4 hover:underline",
      "aria-expanded": "false",
      "aria-controls": detalheId,
    },
    local.nome,
  );
  const detalhe = h("div", {
    id: detalheId,
    class: "border-t border-borda px-4 pb-5 md:px-5",
    hidden: true,
  });
  botao.addEventListener("click", () => abrirDetalhe(detalhe, local, botao, hoje));

  if (passada) {
    return h(
      "li",
      {
        class: "flex items-center gap-4 border-t border-borda pt-2 text-base text-texto-secundario",
      },
      h("span", { class: "w-14 font-bold tabular-nums" }, o.hora),
      h("span", { class: "flex-1" }, local.nome, " · ", lugarDe(local)),
    );
  }

  return h(
    "li",
    { class: "rounded-cartao border border-borda bg-cartao" },
    h(
      "div",
      { class: "flex items-start gap-4 p-4 md:p-5" },
      h(
        "div",
        {
          class:
            "flex w-20 shrink-0 flex-col items-center rounded-cartao bg-superficie py-2 md:w-24",
        },
        h("span", { class: "text-timetable-time font-bold tabular-nums" }, o.hora),
        h(
          "span",
          { class: "text-xs font-bold tracking-wide text-texto-secundario uppercase" },
          t[periodo(o.hora)],
        ),
        o.hora_fim &&
          h("span", { class: "text-xs text-texto-secundario tabular-nums" }, `– ${o.hora_fim}`),
      ),
      h(
        "div",
        { class: "min-w-0 flex-1" },
        h(
          "h3",
          { class: "flex flex-wrap items-center gap-x-2 gap-y-1" },
          botao,
          seloCurto(local, hoje),
        ),
        h(
          "p",
          { class: "mt-0.5 flex items-center gap-1 text-base text-texto-secundario" },
          icone("location_on", "size-4"),
          lugarDe(local),
        ),
        h("p", { class: "mt-2 flex flex-wrap gap-2 empty:hidden" }, ...etiquetasDe(o, local)),
      ),
      botaoComoChegar(local),
    ),
    detalhe,
  );
}

// --- "A seguir" ---------------------------------------------------------------------------------

function quandoTexto(minutos: number): string {
  if (minutos <= 0) return t.agora;
  if (minutos < 60) return formatar(t.emMinutos, { min: minutos });
  return formatar(t.emHoras, { h: Math.floor(minutos / 60), min: minutos % 60 });
}

function cartaoASeguir(o: CelebracaoPortal, minutos: number, hoje: string): HTMLElement {
  const local = locais.get(o.local) as LocalPortal;
  const partilhar = h(
    "button",
    {
      type: "button",
      class: "botao-escuro",
      "data-partilhar": `${t.caminho}#${local.id}`,
      "data-titulo": local.nome,
    },
    icone("share"),
    t.partilhar,
  );
  const tipoOuNota = o.nota ?? (o.tipo === "missa" ? undefined : t.tipos[o.tipo]);
  return h(
    "div",
    {
      class:
        "flex flex-col gap-6 rounded-xl bg-ardosia p-6 text-white shadow-lg md:flex-row md:items-center md:p-8",
    },
    h(
      "div",
      { class: "min-w-0 flex-1" },
      h(
        "p",
        { class: "flex flex-wrap items-center gap-2" },
        h(
          "span",
          {
            class:
              "inline-flex items-center gap-1 rounded bg-dourado px-2 py-0.5 text-xs font-bold tracking-wide text-ardosia uppercase",
          },
          icone("schedule", "size-4"),
          `${t.aSeguir} · ${quandoTexto(minutos)}`,
        ),
        seloCurto(local, hoje),
      ),
      h(
        "p",
        { class: "mt-3 flex flex-wrap items-end gap-3" },
        h("span", { class: "text-6xl leading-none font-bold tracking-tight tabular-nums" }, o.hora),
        tipoOuNota &&
          h(
            "span",
            { class: "rounded bg-white/10 px-2 py-1 text-base text-amber-100" },
            tipoOuNota,
          ),
      ),
      h(
        "h3",
        { class: "mt-3 text-2xl font-semibold" },
        h("a", { href: `#${local.id}`, class: "hover:underline" }, local.nome),
      ),
      h(
        "p",
        { class: "mt-1 flex items-center gap-1 text-base text-slate-300" },
        icone("location_on", "size-4"),
        lugarDe(local),
      ),
    ),
    h("div", { class: "flex flex-wrap gap-3" }, botaoComoChegar(local, "botao-claro"), partilhar),
  );
}

// --- Desenho da página --------------------------------------------------------------------------

const elControlos = porId("controlos");
const elPesquisa = porId<HTMLInputElement>("pesquisa");
const elLimpar = porId<HTMLButtonElement>("limpar-pesquisa");
const elFiltroTipo = porId<HTMLButtonElement>("filtro-tipo");
const elFaixaDiaSanto = porId("faixa-dia-santo");
const elASeguir = porId("a-seguir");
const elPorHora = porId("por-hora");
const elTituloDia = porId("titulo-dia");
const elAindaHoje = porId("ainda-hoje");
const elListaHora = porId("lista-hora");
const elVazioHora = porId("vazio-hora");
const elAnteriores = porId<HTMLDetailsElement>("anteriores");
const elAnterioresTexto = porId("anteriores-texto");
const elListaAnteriores = porId("lista-anteriores");
const elSemInformacao = porId("sem-informacao");
const elListaSemInformacao = porId("lista-sem-informacao");
const elIgrejas = porId("igrejas");
const elContagemIgrejas = porId("contagem-igrejas");
const elVazioIgrejas = porId("vazio-igrejas");
const artigos = [...document.querySelectorAll<HTMLElement>("article.igreja")];

function marcar(seletor: string, atributo: string, valor: string): void {
  document.querySelectorAll<HTMLElement>(seletor).forEach((b) => {
    b.setAttribute("aria-pressed", String(b.getAttribute(atributo) === valor));
  });
}

function tituloDoDia(data: string): string {
  if (estado.dia === "hoje") return t.celebracoesHoje;
  if (estado.dia === "amanha") return t.celebracoesAmanha;
  return formatar(t.celebracoesData, { data: formatarDiaDaSemanaEData(data, idioma) });
}

function desenhar(): void {
  const { data: hoje, hora } = agora();
  const momento = { data: hoje, hora };

  // Controlos
  marcar("button[data-dia]", "data-dia", estado.dia);
  marcar("button[data-concelho]", "data-concelho", estado.concelho);
  marcar("button[data-vista]", "data-vista", estado.vista);
  if (elPesquisa.value !== estado.q) elPesquisa.value = estado.q;
  elLimpar.hidden = estado.q === "";
  elFiltroTipo.hidden = estado.tipo === null;
  document
    .querySelector('[data-atalho="paroquias"]')
    ?.setAttribute("aria-current", String(estado.vista === "igreja"));

  const filtrados = filtrarLocais(dados.locais, estado);
  const dia = celebracoesDoDia(filtrados, estado.dia, hoje, calendario, estado.tipo);
  const todosDoDia =
    estado.concelho === "todos"
      ? dia
      : celebracoesDoDia(
          filtrarLocais(dados.locais, { ...estado, concelho: "todos" }),
          estado.dia,
          hoje,
          calendario,
          estado.tipo,
        );

  // Faixa de dia santo (§6.4)
  if (dia.diaSanto) {
    elFaixaDiaSanto.hidden = false;
    (elFaixaDiaSanto.querySelector("span") as HTMLElement).textContent = formatar(t.faixaDiaSanto, {
      data: formatarDiaEMes(dia.data, idioma),
      nome: dia.diaSanto.nome,
    });
  } else elFaixaDiaSanto.hidden = true;

  const totalTodos =
    estado.vista === "hora"
      ? todosDoDia.celebracoes.length + todosDoDia.semInformacao.length
      : filtrarLocais(dados.locais, { ...estado, concelho: "todos" }).length;
  const chipTodos = document.querySelector('button[data-concelho="todos"]');
  if (chipTodos) chipTodos.textContent = formatar(t.todos, { n: totalTodos });

  if (estado.vista === "hora") {
    elIgrejas.hidden = true;
    elPorHora.hidden = false;
    elTituloDia.textContent = tituloDoDia(dia.data);

    const passadas = dia.celebracoes.filter((o) => minutosAte(momento, o) < 0);
    const futuras = dia.celebracoes.filter((o) => minutosAte(momento, o) >= 0);

    elListaHora.replaceChildren(...futuras.map((o) => linhaCelebracao(o, hoje)));
    elListaAnteriores.replaceChildren(...passadas.map((o) => linhaCelebracao(o, hoje, true)));
    elAnteriores.hidden = passadas.length === 0;
    elAnterioresTexto.textContent = plural(idioma, t.anteriores, passadas.length);

    const ehHoje = dia.data === hoje || futuras.some((o) => o.data === hoje);
    elAindaHoje.hidden = !(estado.dia === "hoje" && futuras.length > 0);
    elAindaHoje.textContent = plural(idioma, t.aindaHoje, futuras.length);

    const proxima = futuras[0];
    if (estado.dia === "hoje" && proxima && ehHoje) {
      elASeguir.hidden = false;
      elASeguir.replaceChildren(cartaoASeguir(proxima, minutosAte(momento, proxima), hoje));
      prepararAcoes(elASeguir);
    } else {
      elASeguir.hidden = true;
      elASeguir.replaceChildren();
    }

    const total = dia.celebracoes.length + dia.semInformacao.length;
    elVazioHora.hidden = futuras.length > 0;
    elVazioHora.textContent =
      total === 0
        ? estado.tipo === "confissoes"
          ? t.vazioConfissoes
          : t.vazio
        : passadas.length
          ? t.semMaisHoje
          : "";
    if (elVazioHora.textContent === "") elVazioHora.hidden = true;
    if (total > 0 && futuras.length === 0 && estado.dia === "hoje") {
      const verAmanha = h(
        "button",
        { type: "button", class: "ligacao ml-2 min-h-12" },
        t.verAmanha,
      );
      verAmanha.addEventListener("click", () => mudar({ dia: "amanha" }));
      elVazioHora.append(verAmanha);
    }

    elSemInformacao.hidden = dia.semInformacao.length === 0;
    elListaSemInformacao.replaceChildren(
      ...dia.semInformacao.map((o) => linhaCelebracao(o, hoje, false)),
    );
  } else {
    elPorHora.hidden = true;
    elASeguir.hidden = true;
    elIgrejas.hidden = false;
    const visiveis = new Set(filtrados.map((l) => l.id));
    const horasPorLocal = new Map<string, Ocorrencia[]>();
    for (const o of [...dia.celebracoes, ...dia.semInformacao]) {
      if (o.data !== dia.data) continue;
      horasPorLocal.set(o.local, [...(horasPorLocal.get(o.local) ?? []), o]);
    }
    for (const artigo of artigos) {
      const id = artigo.dataset.local ?? "";
      artigo.hidden = !visiveis.has(id);
      const alvo = artigo.querySelector(".horas-dia");
      if (!alvo) continue;
      const doDia = horasPorLocal.get(id) ?? [];
      alvo.replaceChildren(
        ...(doDia.length
          ? doDia.map((o) =>
              h(
                "span",
                { class: "etiqueta bg-superficie text-base text-ardosia tabular-nums" },
                o.tipo === "missa" ? o.hora : `${o.hora} · ${t.tipos[o.tipo]}`,
              ),
            )
          : [h("span", { class: "text-base text-texto-secundario" }, t.igrejasHojeSem)]),
      );
    }
    elContagemIgrejas.textContent = plural(idioma, t.nIgrejas, visiveis.size);
    elVazioIgrejas.hidden = visiveis.size > 0;
  }

  // Estado no endereço, para partilhar a pesquisa (§6.2)
  const query = escreverEstado(estado);
  if (query !== location.search)
    history.replaceState(null, "", `${location.pathname}${query}${location.hash}`);
  document.querySelectorAll<HTMLAnchorElement>("a[data-idioma]").forEach((a) => {
    a.href = `${a.dataset.idioma ?? "/"}${query}`;
  });
}

function mudar(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  desenhar();
}

// --- Partilhar ----------------------------------------------------------------------------------

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
      return;
    } catch {
      return; // cancelado pela pessoa
    }
  }
  await navigator.clipboard.writeText(url);
  aviso.textContent = t.ligacaoCopiada;
  aviso.hidden = false;
  setTimeout(() => (aviso.hidden = true), 2500);
}

// --- Ligações a um local (/#nespereira) ---------------------------------------------------------

function abrirLocalDoEndereco(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!locais.has(id)) return;
  mudar({ vista: "igreja", q: "", concelho: "todos" });
  const artigo = document.getElementById(id);
  const detalhes = artigo?.querySelector("details");
  if (detalhes) detalhes.open = true;
  artigo?.scrollIntoView({ block: "start" });
}

// --- Arranque -----------------------------------------------------------------------------------

function iniciar(): void {
  const { data: hoje } = agora();
  elControlos.hidden = false;
  porId("barra-inferior").hidden = false;

  // Sem JavaScript os detalhes ficam todos abertos; com ele, fecham-se.
  artigos.forEach((a) => {
    const d = a.querySelector("details");
    if (d) d.open = false;
  });
  atualizarSelos(document, hoje);
  prepararAcoes(document);

  const chipHoje = document.querySelector('[data-dia="hoje"]');
  if (chipHoje) chipHoje.textContent = formatar(t.hoje, { dia: formatarDiaCurto(hoje, idioma) });

  // Faixa "também disponível em…" (§6.8), sem redireção automática.
  const preferido = (navigator.languages?.[0] ?? navigator.language ?? "").slice(0, 2);
  const outro =
    preferido === "en"
      ? TEXTOS.en
      : preferido === "es"
        ? TEXTOS.es
        : preferido === "pt"
          ? TEXTOS["pt-PT"]
          : undefined;
  if (outro && outro.idioma !== idioma) {
    const faixa = porId("faixa-idioma");
    faixa.lang = outro.idioma;
    faixa.replaceChildren(
      outro.disponivelEmOutroIdioma,
      " ",
      h("a", { class: "ligacao", href: outro.caminho, hreflang: outro.idioma }, outro.abrirVersao),
    );
    faixa.hidden = false;
  }

  // Eventos
  document
    .querySelectorAll<HTMLButtonElement>("button[data-dia]")
    .forEach((b) =>
      b.addEventListener("click", () => mudar({ dia: b.dataset.dia as Estado["dia"] })),
    );
  document
    .querySelectorAll<HTMLButtonElement>("button[data-concelho]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        mudar({ concelho: b.dataset.concelho as Estado["concelho"] }),
      ),
    );
  document
    .querySelectorAll<HTMLButtonElement>("button[data-vista]")
    .forEach((b) =>
      b.addEventListener("click", () => mudar({ vista: b.dataset.vista as Estado["vista"] })),
    );
  let espera: ReturnType<typeof setTimeout> | undefined;
  elPesquisa.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => mudar({ q: elPesquisa.value }), 150);
  });
  elLimpar.addEventListener("click", () => {
    mudar({ q: "" });
    elPesquisa.focus();
  });
  elFiltroTipo.addEventListener("click", () => mudar({ tipo: null }));

  document.querySelector('[data-atalho="paroquias"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    mudar({ vista: "igreja" });
    elIgrejas.scrollIntoView({ block: "start" });
  });
  document.querySelectorAll<HTMLAnchorElement>("[data-ir-para-dia]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      mudar({ dia: a.dataset.irParaDia ?? "hoje", vista: "hora" });
      elControlos.scrollIntoView({ block: "start" });
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-barra]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.barra === "hoje") {
        mudar({ dia: "hoje", vista: "hora" });
        scrollTo({ top: 0 });
      } else if (b.dataset.barra === "paroquias") {
        mudar({ vista: "igreja" });
        elIgrejas.scrollIntoView({ block: "start" });
      } else {
        elPesquisa.focus();
        elPesquisa.scrollIntoView({ block: "center" });
      }
    }),
  );
  document.addEventListener("click", (e) => {
    const botao = (e.target as Element).closest<HTMLElement>("[data-partilhar]");
    if (!botao) return;
    e.preventDefault();
    void partilhar(botao.dataset.partilhar ?? "/", botao.dataset.titulo ?? document.title);
  });
  addEventListener("hashchange", abrirLocalDoEndereco);

  iniciarRelatos(idioma);
  desenhar();
  abrirLocalDoEndereco();

  // De minuto a minuto: "em 25 min" e as celebrações que já passaram.
  setInterval(() => {
    if (document.visibilityState === "visible") desenhar();
  }, 60_000);
}

iniciar();
