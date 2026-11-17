/**
 * Pesquisa e filtro por concelho da lista de paróquias (`/paroquias/?q=oliveira&concelho=vizela`).
 * A pesquisa ignora acentos e maiúsculas e aceita partes do nome. Sem JavaScript, os controlos
 * ficam escondidos e a lista mostra todas.
 */
import { plural, TEXTOS, type Idioma } from "../i18n/index.ts";
import { correspondePesquisa, lerEstado, type Concelho } from "../lib/portal.ts";
import { marcar, porId } from "./celebracoes.ts";

const { idioma } = JSON.parse(porId("idioma-paroquias").textContent ?? "{}") as {
  idioma: Idioma;
};
const t = TEXTOS[idioma];
const itens = [...document.querySelectorAll<HTMLElement>("#lista-paroquias > li.paroquia")];
const contagem = porId("contagem-paroquias");
const vazio = porId("vazio-paroquias");
const pesquisa = porId<HTMLInputElement>("pesquisa-paroquias");
const limpar = porId<HTMLButtonElement>("limpar-pesquisa-paroquias");
const inicial = lerEstado(location.search);
let concelho: Concelho = inicial.concelho;
let q = inicial.q;

function desenhar(): void {
  marcar("button[data-concelho]", "data-concelho", concelho);
  if (pesquisa.value !== q) pesquisa.value = q;
  limpar.hidden = q === "";
  let visiveis = 0;
  for (const item of itens) {
    item.hidden =
      (concelho !== "todos" && item.dataset.concelho !== concelho) ||
      !correspondePesquisa({ pesquisa: item.dataset.pesquisa ?? "" }, q);
    if (!item.hidden) visiveis++;
  }
  contagem.textContent = plural(idioma, t.nParoquias, visiveis);
  vazio.hidden = visiveis > 0;

  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (concelho !== "todos") p.set("concelho", concelho);
  const query = p.toString() ? `?${p.toString()}` : "";
  if (query !== location.search) history.replaceState(null, "", `${location.pathname}${query}`);
  document.querySelectorAll<HTMLAnchorElement>("a[data-idioma]").forEach((a) => {
    a.href = `${a.dataset.idioma ?? "/"}${query}`;
  });
}

document.querySelectorAll<HTMLButtonElement>("button[data-concelho]").forEach((b) =>
  b.addEventListener("click", () => {
    concelho = b.dataset.concelho as Concelho;
    desenhar();
  }),
);
pesquisa.addEventListener("input", () => {
  q = pesquisa.value;
  desenhar();
});
limpar.addEventListener("click", () => {
  q = "";
  desenhar();
  pesquisa.focus();
});
desenhar();
document.documentElement.dataset.pronto = "";
