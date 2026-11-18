/**
 * Ilha da página principal (§6.2–6.6): atalhos de dia, concelho, pesquisa, celebrações por hora,
 * "A seguir", detalhe por baixo de cada linha, selos e partilha. A lista das paróquias e o
 * horário semanal de cada igreja estão nas páginas `/paroquias/` e `/paroquia/<id>/`.
 */
import { momentoEmLisboa, prepararCalendario } from "@missas/horarios";
import { formatar, plural, TEXTOS, type Idioma } from "../i18n/index.ts";
import { formatarDiaDaSemanaEData, formatarDiaEMes } from "../lib/formatos.ts";
import {
  celebracoesDoDia,
  escreverEstado,
  filtrarLocais,
  lerEstado,
  minutosAte,
  type CelebracaoPortal,
  type DadosPortal,
  type Estado,
  type LocalPortal,
} from "../lib/portal.ts";
import {
  atualizarSelos,
  botaoComoChegar,
  caixaHora,
  etiquetasDe,
  h,
  icone,
  iniciarPartilha,
  lugarDe,
  comBlocosDoDomingo,
  marcar,
  porId,
  prepararAcoes,
  quandoTexto,
  seloCurto,
} from "./celebracoes.ts";
import { iniciarRelatos } from "./relato.ts";

// --- Dados e estado ---------------------------------------------------------------------------

const dados = JSON.parse(porId("dados-portal").textContent ?? "{}") as DadosPortal;
const { idioma } = JSON.parse(porId("idioma-portal").textContent ?? "{}") as { idioma: Idioma };
const t = TEXTOS[idioma];
const calendario = prepararCalendario(dados.calendario);
const locais = new Map(dados.locais.map((l) => [l.id, l]));
let estado: Estado = lerEstado(location.search);

const agora = () => momentoEmLisboa(new Date());
const paginaDaParoquia = (local: LocalPortal) => `${t.caminho}paroquia/${local.entidade.id}/`;

// --- Detalhe de um local, pedido ao servidor ao abrir uma linha ---------------------------------

/** Detalhes já pedidos ao servidor (um pedido por local, mesmo com várias linhas abertas). */
const fragmentos = new Map<string, Promise<string | null>>();

function pedirDetalhe(id: string): Promise<string | null> {
  let pedido = fragmentos.get(id);
  if (!pedido) {
    pedido = fetch(`/fragmentos/${idioma}/${encodeURIComponent(id)}/`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    fragmentos.set(id, pedido);
  }
  return pedido;
}

/** Põe o detalhe do local dentro de `alvo` (só uma vez); se falhar, tenta de novo ao reabrir. */
async function carregarDetalhe(alvo: HTMLElement, id: string, hoje: string): Promise<void> {
  if (alvo.dataset.carregado) return;
  alvo.dataset.carregado = "1";
  const html = await pedirDetalhe(id);
  if (html === null) {
    delete alvo.dataset.carregado;
    fragmentos.delete(id);
    return;
  }
  // HTML do próprio servidor (mesma origem), gerado pelo Astro com os dados já escapados.
  const modelo = document.createElement("template");
  modelo.innerHTML = html;
  atualizarSelos(idioma, modelo.content, hoje);
  prepararAcoes(modelo.content);
  alvo.replaceChildren(modelo.content);
}

// --- Linhas das celebrações ---------------------------------------------------------------------

function linhaCelebracao(o: CelebracaoPortal, hoje: string, passada = false): HTMLLIElement {
  const local = locais.get(o.local);
  if (!local) return h("li");

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

  const detalheId = `detalhe-${o.local}-${o.data}-${o.hora.replace(":", "")}-${o.tipo}`;
  const botao = h(
    "button",
    {
      type: "button",
      class:
        "text-left text-base leading-snug font-semibold underline-offset-4 hover:underline md:text-lg",
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
  botao.addEventListener("click", () => {
    const aberto = botao.getAttribute("aria-expanded") === "true";
    botao.setAttribute("aria-expanded", String(!aberto));
    detalhe.hidden = aberto;
    if (!aberto) void carregarDetalhe(detalhe, local.id, hoje);
  });

  return h(
    "li",
    { class: "min-w-0 rounded-cartao border border-borda bg-cartao" },
    h(
      "div",
      { class: "flex items-start gap-3 p-3 md:gap-4 md:p-5" },
      caixaHora(idioma, o),
      h(
        "div",
        { class: "min-w-0 flex-1" },
        h(
          "h3",
          { class: "flex flex-wrap items-center gap-x-2 gap-y-1" },
          botao,
          seloCurto(idioma, local, hoje),
        ),
        h(
          "p",
          {
            class: "mt-0.5 flex items-center gap-1 text-sm text-texto-secundario md:text-base",
          },
          icone("location_on", "size-4"),
          h("span", { class: "truncate" }, lugarDe(local)),
        ),
        h(
          "p",
          { class: "mt-2 flex flex-wrap gap-1.5 empty:hidden md:gap-2" },
          ...etiquetasDe(idioma, o, local),
        ),
      ),
      botaoComoChegar(idioma, local),
    ),
    detalhe,
  );
}

// --- "A seguir" ---------------------------------------------------------------------------------

function cartaoASeguir(o: CelebracaoPortal, minutos: number, hoje: string): HTMLElement {
  const local = locais.get(o.local) as LocalPortal;
  const partilhar = h(
    "button",
    {
      type: "button",
      class: "botao-escuro",
      "data-partilhar": paginaDaParoquia(local),
      "data-titulo": local.entidade.nome,
    },
    icone("share"),
    t.partilhar,
  );
  const tipoOuNota = o.nota ?? (o.tipo === "missa" ? undefined : t.tipos[o.tipo]);
  return h(
    "div",
    {
      class:
        "flex flex-col gap-5 rounded-xl bg-ardosia p-5 text-white shadow-lg md:flex-row md:items-center md:gap-6 md:p-8",
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
          `${t.aSeguir} · ${quandoTexto(idioma, minutos)}`,
        ),
        seloCurto(idioma, local, hoje),
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
        h("a", { href: paginaDaParoquia(local), class: "hover:underline" }, local.nome),
      ),
      h(
        "p",
        { class: "mt-1 flex items-center gap-1 text-base text-slate-300" },
        icone("location_on", "size-4"),
        lugarDe(local),
      ),
    ),
    h(
      "div",
      { class: "grid grid-cols-[1fr_auto] gap-3 md:flex" },
      botaoComoChegar(idioma, local, "botao-claro justify-center"),
      partilhar,
    ),
  );
}

// --- Desenho da página --------------------------------------------------------------------------

const elControlos = porId("controlos");
const elPesquisa = porId<HTMLInputElement>("pesquisa");
const elLimpar = porId<HTMLButtonElement>("limpar-pesquisa");
const elFiltroTipo = porId<HTMLButtonElement>("filtro-tipo");
const elFaixaDiaSanto = porId("faixa-dia-santo");
const elASeguir = porId("a-seguir");
const elTituloDia = porId("titulo-dia");
const elAindaHoje = porId("ainda-hoje");
const elListaHora = porId("lista-hora");
const elVazioHora = porId("vazio-hora");
const elAnteriores = porId<HTMLDetailsElement>("anteriores");
const elAnterioresTexto = porId("anteriores-texto");
const elListaAnteriores = porId("lista-anteriores");
const elSemInformacao = porId("sem-informacao");
const elListaSemInformacao = porId("lista-sem-informacao");

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
  if (elPesquisa.value !== estado.q) elPesquisa.value = estado.q;
  elLimpar.hidden = estado.q === "";
  elFiltroTipo.hidden = estado.tipo === null;

  const filtrados = filtrarLocais(dados.locais, estado);
  const dia = celebracoesDoDia(filtrados, estado.dia, hoje, calendario, estado.tipo);

  // Faixa de dia santo (§6.4)
  if (dia.diaSanto) {
    elFaixaDiaSanto.hidden = false;
    (elFaixaDiaSanto.querySelector("span") as HTMLElement).textContent = formatar(t.faixaDiaSanto, {
      data: formatarDiaEMes(dia.data, idioma),
      nome: dia.diaSanto.nome,
    });
  } else elFaixaDiaSanto.hidden = true;

  elTituloDia.textContent = tituloDoDia(dia.data);

  const passadas = dia.celebracoes.filter((o) => minutosAte(momento, o) < 0);
  const futuras = dia.celebracoes.filter((o) => minutosAte(momento, o) >= 0);

  elListaHora.replaceChildren(
    ...comBlocosDoDomingo(idioma, futuras, (o) => linhaCelebracao(o, hoje)),
  );
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
    const verAmanha = h("button", { type: "button", class: "ligacao ml-2 min-h-12" }, t.verAmanha);
    verAmanha.addEventListener("click", () => mudar({ dia: "amanha" }));
    elVazioHora.append(verAmanha);
  }

  elSemInformacao.hidden = dia.semInformacao.length === 0;
  elListaSemInformacao.replaceChildren(
    ...comBlocosDoDomingo(idioma, dia.semInformacao, (o) => linhaCelebracao(o, hoje, false)),
  );

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

// --- Ligações antigas a um local (/#nespereira) → página da paróquia ----------------------------

function abrirLocalDoEndereco(): void {
  const local = locais.get(decodeURIComponent(location.hash.slice(1)));
  if (local) location.replace(`${paginaDaParoquia(local)}#${local.id}`);
}

// --- Arranque -----------------------------------------------------------------------------------

function iniciar(): void {
  abrirLocalDoEndereco();
  const { data: hoje } = agora();
  atualizarSelos(idioma, document, hoje);
  prepararAcoes(document);

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

  document.querySelectorAll<HTMLAnchorElement>("[data-ir-para-dia]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      mudar({ dia: a.dataset.irParaDia ?? "hoje" });
      elControlos.scrollIntoView({ block: "start" });
    }),
  );
  addEventListener("hashchange", abrirLocalDoEndereco);

  iniciarPartilha(idioma);
  iniciarRelatos(idioma);
  desenhar();
  // Os controlos já estão visíveis antes do script; isto diz que já respondem (testes e2e).
  document.documentElement.dataset.pronto = "";

  // De minuto a minuto: "em 25 min" e as celebrações que já passaram.
  setInterval(() => {
    if (document.visibilityState === "visible") desenhar();
  }, 60_000);
}

iniciar();
