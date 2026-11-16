/**
 * Filtro por concelho da lista de paróquias (`/paroquias/?concelho=vizela`). Sem JavaScript, a
 * lista mostra todas e o filtro fica escondido.
 */
import { plural, TEXTOS, type Idioma } from "../i18n/index.ts";
import { lerEstado, type Concelho } from "../lib/portal.ts";
import { marcar, porId } from "./celebracoes.ts";

const { idioma } = JSON.parse(porId("idioma-paroquias").textContent ?? "{}") as {
  idioma: Idioma;
};
const t = TEXTOS[idioma];
const itens = [...document.querySelectorAll<HTMLElement>("#lista-paroquias > li.paroquia")];
const contagem = porId("contagem-paroquias");
let concelho: Concelho = lerEstado(location.search).concelho;

function desenhar(): void {
  marcar("button[data-concelho]", "data-concelho", concelho);
  let visiveis = 0;
  for (const item of itens) {
    item.hidden = concelho !== "todos" && item.dataset.concelho !== concelho;
    if (!item.hidden) visiveis++;
  }
  contagem.textContent = plural(idioma, t.nParoquias, visiveis);
  const query = concelho === "todos" ? "" : `?concelho=${concelho}`;
  if (query !== location.search) history.replaceState(null, "", `${location.pathname}${query}`);
  document.querySelectorAll<HTMLAnchorElement>("a[data-idioma]").forEach((a) => {
    a.href = `${a.dataset.idioma ?? "/"}${query}`;
  });
}

porId("filtro-concelho").hidden = false;
document.querySelectorAll<HTMLButtonElement>("button[data-concelho]").forEach((b) =>
  b.addEventListener("click", () => {
    concelho = b.dataset.concelho as Concelho;
    desenhar();
  }),
);
desenhar();
