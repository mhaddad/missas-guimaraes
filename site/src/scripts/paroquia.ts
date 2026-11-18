/**
 * Ilha da página de uma paróquia: celebrações de hoje, amanhã ou do próximo domingo, só desta
 * paróquia, com o mesmo motor e as mesmas etiquetas da página principal. O dia escolhido fica
 * no endereço (`?dia=amanha`).
 */
import { momentoEmLisboa, prepararCalendario } from "@missas/horarios";
import { formatar, plural, TEXTOS, type Idioma } from "../i18n/index.ts";
import { formatarDiaDaSemanaEData, formatarDiaEMes } from "../lib/formatos.ts";
import {
  celebracoesDoDia,
  dataDaEscolha,
  lerEstado,
  minutosAte,
  type CelebracaoPortal,
  type DadosPortal,
  type EscolhaDia,
} from "../lib/portal.ts";
import {
  atualizarSelos,
  caixaHora,
  etiquetasDe,
  h,
  icone,
  iniciarPartilha,
  marcar,
  porId,
  prepararAcoes,
  quandoTexto,
} from "./celebracoes.ts";
import { iniciarRelatos } from "./relato.ts";

function iniciar(elDados: HTMLElement): void {
  const dados = JSON.parse(elDados.textContent ?? "{}") as DadosPortal;
  const { idioma } = JSON.parse(porId("idioma-paroquia").textContent ?? "{}") as {
    idioma: Idioma;
  };
  const t = TEXTOS[idioma];
  const calendario = prepararCalendario(dados.calendario);
  const locais = new Map(dados.locais.map((l) => [l.id, l]));
  const varios = dados.locais.length > 1;
  let dia: EscolhaDia = lerEstado(location.search).dia;

  const elSeccao = porId("celebracoes");
  const elTitulo = porId("titulo-dia");
  const elFaixa = porId("faixa-dia-santo");
  const elLista = porId("lista-dia");
  const elVazio = porId("vazio-dia");
  const elAnteriores = porId<HTMLDetailsElement>("anteriores");
  const elAnterioresTexto = porId("anteriores-texto");
  const elListaAnteriores = porId("lista-anteriores");
  const elSemInformacao = porId("sem-informacao");
  const elListaSemInformacao = porId("lista-sem-informacao");

  function linha(o: CelebracaoPortal, aSeguir?: number): HTMLLIElement {
    const local = locais.get(o.local);
    if (!local) return h("li");
    const titulo = varios ? local.nome : t.tipos[o.tipo];
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
          aSeguir !== undefined &&
            h(
              "p",
              {
                class:
                  "mb-1 inline-flex items-center gap-1 rounded bg-ardosia px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase",
              },
              icone("schedule", "size-4"),
              `${t.aSeguir} · ${quandoTexto(idioma, aSeguir)}`,
            ),
          h("h3", { class: "text-base leading-snug font-semibold md:text-lg" }, titulo),
          h(
            "p",
            { class: "mt-2 flex flex-wrap gap-1.5 empty:hidden md:gap-2" },
            ...etiquetasDe(idioma, o, local, !varios),
          ),
        ),
      ),
    );
  }

  function linhaPassada(o: CelebracaoPortal): HTMLLIElement {
    const local = locais.get(o.local);
    return h(
      "li",
      {
        class: "flex items-center gap-4 border-t border-borda pt-2 text-base text-texto-secundario",
      },
      h("span", { class: "w-14 font-bold tabular-nums" }, o.hora),
      h("span", { class: "flex-1" }, varios && local ? local.nome : t.tipos[o.tipo]),
    );
  }

  function titulo(data: string): string {
    if (dia === "hoje") return t.celebracoesHoje;
    if (dia === "amanha") return t.celebracoesAmanha;
    return formatar(t.celebracoesData, { data: formatarDiaDaSemanaEData(data, idioma) });
  }

  function desenhar(): void {
    const { data: hoje, hora } = momentoEmLisboa(new Date());
    const momento = { data: hoje, hora };
    marcar("button[data-dia]", "data-dia", dia);
    const doDia = celebracoesDoDia(dados.locais, dia, hoje, calendario);
    elTitulo.textContent = titulo(dataDaEscolha(dia, hoje));

    if (doDia.diaSanto) {
      elFaixa.hidden = false;
      (elFaixa.querySelector("span") as HTMLElement).textContent = formatar(t.faixaDiaSanto, {
        data: formatarDiaEMes(doDia.data, idioma),
        nome: doDia.diaSanto.nome,
      });
    } else elFaixa.hidden = true;

    const passadas = doDia.celebracoes.filter((o) => minutosAte(momento, o) < 0);
    const futuras = doDia.celebracoes.filter((o) => minutosAte(momento, o) >= 0);
    elLista.replaceChildren(
      ...futuras.map((o, i) =>
        linha(o, i === 0 && dia === "hoje" ? minutosAte(momento, o) : undefined),
      ),
    );
    elListaAnteriores.replaceChildren(...passadas.map(linhaPassada));
    elAnteriores.hidden = passadas.length === 0;
    elAnterioresTexto.textContent = plural(idioma, t.anteriores, passadas.length);

    const total = doDia.celebracoes.length + doDia.semInformacao.length;
    elVazio.replaceChildren();
    elVazio.hidden = futuras.length > 0 || (total > 0 && passadas.length === 0);
    elVazio.textContent = total === 0 ? t.vazioParoquia : t.semMaisHojeParoquia;
    if (total > 0 && futuras.length === 0 && dia === "hoje") {
      const verAmanha = h(
        "button",
        { type: "button", class: "ligacao ml-2 min-h-12" },
        t.verAmanha,
      );
      verAmanha.addEventListener("click", () => mudar("amanha"));
      elVazio.append(verAmanha);
    }

    elSemInformacao.hidden = doDia.semInformacao.length === 0;
    elListaSemInformacao.replaceChildren(...doDia.semInformacao.map((o) => linha(o)));

    const query = dia === "hoje" ? "" : `?dia=${dia}`;
    if (query !== location.search)
      history.replaceState(null, "", `${location.pathname}${query}${location.hash}`);
    document.querySelectorAll<HTMLAnchorElement>("a[data-idioma]").forEach((a) => {
      a.href = `${a.dataset.idioma ?? "/"}${query}`;
    });
  }

  function mudar(escolha: EscolhaDia): void {
    dia = escolha;
    desenhar();
  }

  const { data: hoje } = momentoEmLisboa(new Date());
  atualizarSelos(idioma, document, hoje);
  prepararAcoes(document);
  elSeccao.hidden = false;
  document
    .querySelectorAll<HTMLButtonElement>("button[data-dia]")
    .forEach((b) => b.addEventListener("click", () => mudar(b.dataset.dia as EscolhaDia)));
  iniciarPartilha(idioma);
  iniciarRelatos(idioma);
  desenhar();
  setInterval(() => {
    if (document.visibilityState === "visible") desenhar();
  }, 60_000);
}

// Na página "não encontrada" não há dados.
const elDados = document.getElementById("dados-paroquia");
if (elDados) iniciar(elDados);
