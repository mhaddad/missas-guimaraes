/**
 * Formulário "Reportar erro" (§6.7, E2.9). O script do Turnstile só é carregado quando a pessoa
 * abre o formulário. O relato vai para `POST /api/relato` sem nenhum dado de quem o envia.
 */
import { TEXTOS, type Idioma } from "../i18n/index.ts";

interface Turnstile {
  render(alvo: HTMLElement, opcoes: Record<string, unknown>): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let carregamento: Promise<Turnstile> | undefined;

function carregarTurnstile(): Promise<Turnstile> {
  carregamento ??= new Promise((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = SCRIPT_TURNSTILE;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolver(window.turnstile) : rejeitar(new Error("turnstile"));
    script.onerror = () => rejeitar(new Error("turnstile"));
    document.head.append(script);
  });
  return carregamento;
}

/** Liga os botões `[data-relatar]` ao formulário, se a página o tiver. */
export function iniciarRelatos(idioma: Idioma): void {
  const dialogo = document.getElementById("relato") as HTMLDialogElement | null;
  if (!dialogo) return;
  const t = TEXTOS[idioma];
  const form = dialogo.querySelector("form") as HTMLFormElement;
  const local = dialogo.querySelector("#relato-local") as HTMLSelectElement;
  const mensagem = dialogo.querySelector("#relato-mensagem") as HTMLTextAreaElement;
  const estado = dialogo.querySelector("#relato-estado") as HTMLElement;
  const enviar = dialogo.querySelector("#relato-enviar") as HTMLButtonElement;
  const caixa = dialogo.querySelector("#relato-turnstile") as HTMLElement;
  let token = "";
  let widget: string | undefined;

  const mostrar = (texto: string, erro = false) => {
    estado.textContent = texto;
    estado.className = `text-base font-semibold empty:hidden ${erro ? "text-erro" : "text-confirmado"}`;
  };

  async function abrir(idLocal: string): Promise<void> {
    local.value = idLocal;
    mostrar("");
    form.hidden = false;
    dialogo?.showModal();
    mensagem.focus();
    if (widget !== undefined) return;
    try {
      const turnstile = await carregarTurnstile();
      widget = turnstile.render(caixa, {
        sitekey: dialogo?.dataset.siteKey,
        language: idioma === "pt-PT" ? "pt-PT" : idioma,
        callback: (t: string) => (token = t),
        "expired-callback": () => (token = ""),
        "error-callback": () => (token = ""),
      });
    } catch {
      mostrar(t.relatoErro, true);
    }
  }

  document.addEventListener("click", (e) => {
    const botao = (e.target as Element).closest<HTMLElement>("[data-relatar]");
    if (botao) {
      e.preventDefault();
      void abrir(botao.dataset.relatar ?? "");
    }
    if ((e.target as Element).closest("[data-fechar-relato]")) dialogo.close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (mensagem.value.trim().length < 10) return mostrar(t.relatoCurto, true);
    if (!token) return mostrar(t.relatoVerificacao, true);
    enviar.disabled = true;
    mostrar(t.relatoEnviando);
    try {
      const resposta = await fetch("/api/relato", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          local: local.value || null,
          mensagem: mensagem.value,
          idioma,
          token,
        }),
      });
      if (resposta.status === 201) {
        mensagem.value = "";
        mostrar(t.relatoEnviado);
      } else {
        mostrar(resposta.status === 429 ? t.relatoLimite : t.relatoErro, true);
      }
    } catch {
      mostrar(t.relatoErro, true);
    } finally {
      enviar.disabled = false;
      token = "";
      window.turnstile?.reset(widget);
    }
  });

  document.querySelectorAll<HTMLElement>("[data-relatar]").forEach((b) => (b.hidden = false));
}
