/**
 * Gravação pelo painel e notificação no canto do ecrã (ADR-005): a gravação é imediata e o site
 * mostra-a logo; há mensagens próprias para conflito e erro.
 */
import { api, ErroApi, h, icone } from "./painel-comum.ts";

const CONFLITO =
  "Os horários foram alterados por outra pessoa entretanto. Recarregue para ver a versão atual e refaça a alteração.";

let regiao: HTMLElement | undefined;

/** Notificação no canto do ecrã, anunciada aos leitores de ecrã. */
export function notificar(texto: string, tipo: "info" | "ok" | "erro" = "info"): void {
  if (!regiao) {
    regiao = h("div", {
      role: "status",
      "aria-live": "polite",
      class:
        "fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-md empty:hidden sm:left-auto sm:mx-0",
    });
    document.body.append(regiao);
  }
  const cores = {
    info: "border-borda bg-cartao text-ardosia",
    ok: "border-confirmado/30 bg-confirmado-fundo text-confirmado",
    erro: "border-erro/30 bg-red-50 text-erro",
  };
  const nomeIcone = { info: "schedule", ok: "check_circle", erro: "error" }[tipo];
  const fechar = h(
    "button",
    { type: "button", class: "ml-auto min-h-12 px-2 font-semibold", "aria-label": "Fechar aviso" },
    "✕",
  );
  const caixa = h(
    "div",
    {
      class: `flex items-start gap-3 rounded-cartao border p-4 text-base font-semibold shadow-lg ${cores[tipo]}`,
    },
    icone(nomeIcone, "mt-0.5 size-5"),
    h("p", { class: "py-3" }, texto),
    fechar,
  );
  fechar.addEventListener("click", () => regiao?.replaceChildren());
  regiao.replaceChildren(caixa);
}

/** Texto para um erro da API ao enviar um pedido. */
export function textoDoErro(e: unknown): string {
  if (!(e instanceof ErroApi)) return "Sem ligação. Verifique a internet e tente novamente.";
  switch (e.codigo) {
    case "conflito":
      return CONFLITO;
    case "invalido":
      return `Os dados não puderam ser gravados: ${String(e.corpo.motivo ?? "")}`;
    case "limite":
      return "Muitos pedidos seguidos. Aguarde um pouco e tente novamente.";
    case "gravacao_indisponivel":
      return "A gravação ainda não está ativa neste ambiente.";
    case "ambito":
    case "perfil":
      return "Não tem permissão para esta alteração.";
    default:
      return "Não foi possível enviar. Tente novamente daqui a pouco.";
  }
}

/**
 * Grava (`POST /api/gravacoes`, imediato). Devolve `true` se gravou, `false` se não havia nada a
 * mudar. Se o servidor pedir a confirmação reforçada (alertas de anomalia), pergunta à pessoa com
 * `confirmarAlertas` (o diálogo do painel) e reenvia. Lança `ErroApi` nos outros erros.
 */
export async function enviarGravacao(
  corpo: Record<string, unknown>,
  confirmarAlertas: (alertas: string[]) => Promise<boolean>,
): Promise<boolean> {
  try {
    const r = await api<{ estado: string }>("/api/gravacoes", {
      method: "POST",
      body: JSON.stringify(corpo),
    });
    return r.estado === "GRAVADO";
  } catch (e) {
    if (e instanceof ErroApi && e.codigo === "confirmar_alertas" && !corpo.confirmar_alertas) {
      const alertas = (e.corpo.alertas as string[] | undefined) ?? [];
      if (!(await confirmarAlertas(alertas))) throw e;
      return enviarGravacao({ ...corpo, confirmar_alertas: true }, confirmarAlertas);
    }
    throw e;
  }
}
