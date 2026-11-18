/**
 * Um relato do público no painel (página *Relatos* e cartão na página da paróquia): a mensagem,
 * onde e quando, e as ações para mudar o estado (`PATCH /api/relatos/:id`).
 */
import { momentoEmLisboa } from "@missas/horarios";
import type { RelatoPainel } from "@missas/worker";
import { formatarDataHora, haQuanto } from "../lib/painel.ts";
import { api, h, icone } from "./painel-comum.ts";
import { notificar, textoDoErro } from "./painel-pedidos.ts";

export type { RelatoPainel };
type Estado = RelatoPainel["estado"];

export const ROTULOS_ESTADO: Record<Estado, { texto: string; classe: string }> = {
  aberto: { texto: "Por resolver", classe: "bg-aviso-fundo text-dourado-texto" },
  resolvido: { texto: "Resolvido", classe: "bg-confirmado-fundo text-confirmado" },
  descartado: { texto: "Descartado", classe: "bg-slate-100 text-texto-secundario" },
};

const IDIOMAS: Record<string, string> = { en: "Em inglês", es: "Em espanhol" };

const AVISOS: Record<Estado, string> = {
  aberto: "Relato reaberto.",
  resolvido: "Relato marcado como resolvido.",
  descartado: "Relato descartado.",
};

async function mudar(relato: RelatoPainel, estado: Estado, botao: HTMLButtonElement) {
  botao.disabled = true;
  try {
    await api(`/api/relatos/${encodeURIComponent(relato.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    });
    notificar(AVISOS[estado], "ok");
    return true;
  } catch (e) {
    notificar(textoDoErro(e), "erro");
    botao.disabled = false;
    return false;
  }
}

/**
 * Linha de um relato. `comParoquia`: mostra a paróquia, com ligação para a sua página no
 * painel (na lista geral); `depois` corre quando o estado mudou.
 */
export function linhaRelato(
  relato: RelatoPainel,
  opcoes: { comParoquia: boolean; depois: () => void },
): HTMLLIElement {
  const estado = ROTULOS_ESTADO[relato.estado];
  const botao = (texto: string, classe: string, nome: string, novo: Estado) => {
    const b = h(
      "button",
      { type: "button", class: `${classe} botao-compacto` },
      icone(nome, "size-5"),
      texto,
    );
    b.addEventListener("click", () => {
      void mudar(relato, novo, b).then((ok) => ok && opcoes.depois());
    });
    return b;
  };
  const acoes =
    relato.estado === "aberto"
      ? [
          botao("Marcar como resolvido", "botao-confirmar", "check_circle", "resolvido"),
          botao("Descartar", "botao-secundario", "close", "descartado"),
        ]
      : [botao("Reabrir", "botao-secundario", "history", "aberto")];
  const onde = [
    opcoes.comParoquia && relato.entidade
      ? h(
          "a",
          {
            class: "ligacao font-semibold",
            href: `/admin/paroquia/${encodeURIComponent(relato.entidade.id)}/`,
          },
          relato.entidade.nome,
        )
      : null,
    relato.local ? h("span", {}, relato.local.nome) : null,
    !relato.local ? h("span", {}, "Sem igreja indicada") : null,
  ].filter((x): x is HTMLElement => x !== null);

  return h(
    "li",
    { class: "grid gap-3 px-4 py-4 md:px-5", "data-relato": relato.id },
    h(
      "div",
      { class: "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-secundario" },
      h("span", { class: `etiqueta text-xs ${estado.classe}` }, estado.texto),
      ...onde,
      h(
        "time",
        { datetime: relato.criado_em, title: formatarDataHora(relato.criado_em) },
        haQuanto(relato.criado_em, momentoEmLisboa(new Date()).data),
      ),
      IDIOMAS[relato.idioma] ? h("span", {}, IDIOMAS[relato.idioma]) : null,
    ),
    h(
      "figure",
      { class: "grid gap-1" },
      h(
        "blockquote",
        { class: "border-l-4 border-borda pl-3 whitespace-pre-line text-ardosia" },
        relato.mensagem,
      ),
      h(
        "figcaption",
        { class: "pl-4 text-xs text-texto-secundario" },
        "Enviado por alguém do público pelo site; não verificado.",
      ),
    ),
    h("div", { class: "flex flex-wrap gap-2" }, ...acoes),
  );
}
