/**
 * Envio de pedidos de gravação e acompanhamento do estado (§7.7): *A gravar → Gravado →
 * Publicado*, numa notificação no canto do ecrã, com mensagens próprias para conflito e erro.
 */
import { api, ErroApi, h, icone } from "./painel-comum.ts";

export type EstadoPedido = "A_GRAVAR" | "GRAVADO" | "PUBLICADO" | "CONFLITO" | "ERRO";

interface Registo {
  id: string;
  estado: EstadoPedido;
  motivo?: string;
}

const INTERVALO_MS = 5000;
const DURACAO_MAXIMA_MS = 20 * 60 * 1000;

const TEXTOS: Record<EstadoPedido, string> = {
  A_GRAVAR: "A gravar…",
  GRAVADO: "Gravado. Fica visível no site em poucos minutos.",
  PUBLICADO: "Publicado no site.",
  CONFLITO:
    "Os horários foram alterados por outra pessoa entretanto. Recarregue para ver a versão atual e refaça a alteração.",
  ERRO: "Não foi possível gravar.",
};

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
      return TEXTOS.CONFLITO;
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

export interface Envio {
  /** `null` se não havia nada a mudar. */
  id: string | null;
}

/**
 * Envia o pedido. Se o Worker pedir a confirmação reforçada (alertas de anomalia), pergunta à
 * pessoa e reenvia. Lança `ErroApi` nos outros erros.
 */
export async function enviarPedido(corpo: Record<string, unknown>): Promise<Envio> {
  try {
    const r = await api<{ id?: string; estado: string }>("/api/pedidos", {
      method: "POST",
      body: JSON.stringify(corpo),
    });
    return { id: r.id ?? null };
  } catch (e) {
    if (e instanceof ErroApi && e.codigo === "confirmar_alertas" && !corpo.confirmar_alertas) {
      const alertas = (e.corpo.alertas as string[] | undefined) ?? [];
      if (!confirm(`${alertas.join("\n")}\n\nTem a certeza de que quer continuar?`)) throw e;
      return enviarPedido({ ...corpo, confirmar_alertas: true });
    }
    throw e;
  }
}

/**
 * Acompanha o pedido até um estado final e mostra cada mudança. `aoGravar` corre uma vez,
 * quando o `main` já tem a alteração (para recarregar os dados).
 */
export async function acompanhar(id: string, aoGravar: () => void): Promise<void> {
  const inicio = Date.now();
  let anterior: EstadoPedido | undefined;
  notificar(TEXTOS.A_GRAVAR);
  while (Date.now() - inicio < DURACAO_MAXIMA_MS) {
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
    let registo: Registo;
    try {
      registo = await api<Registo>(`/api/pedidos/${encodeURIComponent(id)}`);
    } catch {
      continue;
    }
    if (registo.estado === anterior) continue;
    anterior = registo.estado;
    switch (registo.estado) {
      case "A_GRAVAR":
        break;
      case "GRAVADO":
        notificar(TEXTOS.GRAVADO, "ok");
        aoGravar();
        break;
      case "PUBLICADO":
        notificar(TEXTOS.PUBLICADO, "ok");
        return;
      case "CONFLITO":
        notificar(TEXTOS.CONFLITO, "erro");
        return;
      case "ERRO":
        notificar(registo.motivo ? `${TEXTOS.ERRO} ${registo.motivo}` : TEXTOS.ERRO, "erro");
        return;
    }
  }
  if (anterior === undefined || anterior === "A_GRAVAR")
    notificar(
      "A gravação está a demorar mais do que o normal. Veja o histórico daqui a alguns minutos.",
      "erro",
    );
}
