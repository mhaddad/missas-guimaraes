/**
 * Página *Relatos* do painel (só administradores): lista de `/api/relatos` por estado, com o
 * estado escolhido no endereço (`?estado=…`).
 */
import { api, ErroApi, h, mostrarErro } from "./painel-comum.ts";
import { linhaRelato, type RelatoPainel } from "./painel-relatos-comum.ts";

const lista = document.getElementById("lista-relatos") as HTMLUListElement;
const contagem = document.getElementById("contagem-relatos") as HTMLElement;
const ESTADOS = ["aberto", "resolvido", "descartado", "todos"] as const;
type Filtro = (typeof ESTADOS)[number];

const pedido = new URLSearchParams(location.search).get("estado");
let estado: Filtro = (ESTADOS as readonly string[]).includes(pedido ?? "")
  ? (pedido as Filtro)
  : "aberto";

const VAZIO: Record<Filtro, string> = {
  aberto: "Não há relatos por resolver.",
  resolvido: "Ainda não há relatos resolvidos.",
  descartado: "Não há relatos descartados.",
  todos: "Ainda ninguém reportou um erro.",
};

async function carregar(): Promise<void> {
  document.querySelectorAll<HTMLButtonElement>("button[data-estado]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.estado === estado));
  });
  const query = estado === "aberto" ? "" : `?estado=${estado}`;
  if (query !== location.search) history.replaceState(null, "", `${location.pathname}${query}`);
  lista.setAttribute("aria-busy", "true");
  try {
    const relatos = await api<RelatoPainel[]>(`/api/relatos?estado=${estado}`);
    contagem.textContent = `${relatos.length} ${relatos.length === 1 ? "relato" : "relatos"}`;
    lista.replaceChildren(
      ...(relatos.length > 0
        ? relatos.map((r) => linhaRelato(r, { comParoquia: true, depois: () => void carregar() }))
        : [h("li", { class: "px-4 py-5 text-texto-secundario md:px-5" }, VAZIO[estado])]),
    );
  } catch (e) {
    if (!(e instanceof ErroApi && e.estado === 401)) {
      const caixa = h("li", { class: "p-4" });
      mostrarErro(caixa, "Não foi possível carregar os relatos. Tente novamente daqui a pouco.");
      lista.replaceChildren(caixa);
    }
  } finally {
    lista.setAttribute("aria-busy", "false");
    document.documentElement.dataset.pronto = "";
  }
}

document.querySelectorAll<HTMLButtonElement>("button[data-estado]").forEach((b) =>
  b.addEventListener("click", () => {
    estado = (b.dataset.estado as Filtro) ?? "aberto";
    void carregar();
  }),
);
void carregar();
