/**
 * Lista das paróquias no painel: pesquisa (sem acentos, partes do nome), concelho, estado e
 * ordenação, com o estado no endereço (`?q=…&concelho=…&estado=…&ordem=…`).
 */
import { compararPorAntiguidade } from "../lib/painel.ts";
import { normalizar } from "../lib/portal.ts";

const lista = document.getElementById("lista");
const filtros = document.getElementById("filtros") as HTMLFormElement | null;

if (lista && filtros) {
  const pesquisa = filtros.querySelector<HTMLInputElement>("#pesquisa") as HTMLInputElement;
  const estado = filtros.querySelector<HTMLSelectElement>("#estado") as HTMLSelectElement;
  const ordem = filtros.querySelector<HTMLSelectElement>("#ordem") as HTMLSelectElement;
  const contagem = document.getElementById("contagem") as HTMLElement;
  const vazio = document.getElementById("vazio") as HTMLElement;
  const itens = [...lista.querySelectorAll<HTMLElement>("li.paroquia")];
  const params = new URLSearchParams(location.search);
  let concelho = params.get("concelho") ?? "todos";
  pesquisa.value = params.get("q") ?? "";
  estado.value = params.get("estado") ?? "";
  ordem.value = params.get("ordem") ?? "nome";
  if (!estado.value) estado.value = "";
  if (!ordem.value) ordem.value = "nome";

  const porNome = (a: HTMLElement, b: HTMLElement) =>
    (a.dataset.nome ?? "").localeCompare(b.dataset.nome ?? "", "pt");
  const dados = (el: HTMLElement) => ({ nome: el.dataset.nome ?? "", el });
  const antiguidade = compararPorAntiguidade<{ nome: string; el: HTMLElement }>(
    (p) => p.el.dataset.atualizada || null,
  );

  function desenhar(): void {
    document.querySelectorAll<HTMLElement>("button[data-concelho]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.concelho === concelho));
    });
    const termos = normalizar(pesquisa.value).split(" ").filter(Boolean);
    let visiveis = 0;
    for (const item of itens) {
      const texto = item.dataset.pesquisa ?? "";
      item.hidden =
        (concelho !== "todos" && item.dataset.concelho !== concelho) ||
        (estado.value !== "" && item.dataset.estado !== estado.value) ||
        !termos.every((t) => texto.includes(t));
      if (!item.hidden) visiveis++;
    }
    const ordenados = [...itens].sort((a, b) => {
      if (ordem.value === "antigas") return antiguidade(dados(a), dados(b));
      if (ordem.value === "recentes") return antiguidade(dados(b), dados(a));
      return porNome(a, b);
    });
    lista?.append(...ordenados);
    contagem.textContent =
      visiveis === itens.length
        ? `${itens.length} ${itens.length === 1 ? "paróquia" : "paróquias"}`
        : `${visiveis} de ${itens.length} paróquias`;
    vazio.hidden = visiveis > 0;

    const p = new URLSearchParams();
    if (pesquisa.value.trim()) p.set("q", pesquisa.value.trim());
    if (concelho !== "todos") p.set("concelho", concelho);
    if (estado.value) p.set("estado", estado.value);
    if (ordem.value !== "nome") p.set("ordem", ordem.value);
    const query = p.toString() ? `?${p.toString()}` : "";
    if (query !== location.search) history.replaceState(null, "", `${location.pathname}${query}`);
  }

  filtros.addEventListener("submit", (e) => e.preventDefault());
  filtros.addEventListener("input", desenhar);
  filtros.addEventListener("change", desenhar);
  document.querySelectorAll<HTMLButtonElement>("button[data-concelho]").forEach((b) =>
    b.addEventListener("click", () => {
      concelho = b.dataset.concelho ?? "todos";
      desenhar();
    }),
  );
  document.getElementById("limpar-filtros")?.addEventListener("click", () => {
    pesquisa.value = "";
    estado.value = "";
    concelho = "todos";
    desenhar();
    pesquisa.focus();
  });
  desenhar();
}
document.documentElement.dataset.pronto = "";
