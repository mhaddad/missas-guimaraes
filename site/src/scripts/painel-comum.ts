/** Utilitários do painel no navegador: pedidos à API, quem sou eu, construção de DOM. */

export interface Eu {
  id: string;
  nome: string;
  email: string;
  funcao: string;
  perfil: "admin" | "entidade";
  entidades: { id: string; nome: string }[];
}

export class ErroApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
  ) {
    super(`${estado} ${codigo}`);
  }
}

/** Pedido à API; 401 e 403 de acesso levam às páginas próprias. */
export async function api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(caminho, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    credentials: "same-origin",
  });
  const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
  if (resposta.status === 401) {
    location.href = "/admin/entrar/";
    throw new ErroApi(401, "sem_identidade");
  }
  if (resposta.status === 403 && (corpo.erro === "sem_acesso" || corpo.erro === "suspenso")) {
    location.href = "/admin/sem-acesso/";
    throw new ErroApi(403, corpo.erro);
  }
  if (!resposta.ok) throw new ErroApi(resposta.status, corpo.erro ?? "erro");
  return corpo as T;
}

export async function carregarEu(): Promise<Eu> {
  const eu = await api<Eu>("/api/eu");
  const nome = document.getElementById("nome-pessoa");
  if (nome) nome.textContent = eu.nome;
  if (eu.perfil === "admin") {
    document.querySelectorAll<HTMLElement>("[data-so-admin]").forEach((el) => (el.hidden = false));
  }
  return eu;
}

type Filho = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string | boolean | undefined> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    if (nome === "class") el.className = String(valor);
    else el.setAttribute(nome, valor === true ? "" : valor);
  }
  for (const f of filhos) if (f) el.append(f);
  return el;
}

export function icone(nome: string, classe = "size-5"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", `shrink-0 fill-current ${classe}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#i-${nome}`);
  svg.append(use);
  return svg;
}

export function mostrarErro(alvo: HTMLElement, texto: string): void {
  alvo.replaceChildren(
    h(
      "p",
      {
        class: "rounded-cartao border border-erro/30 bg-red-50 p-4 text-base text-erro",
        role: "alert",
      },
      texto,
    ),
  );
}
