/** E-9 — Acessos (P8): lista e formulário de contactos, só para administradores. */
import { momentoEmLisboa } from "@missas/horarios";
import { api, carregarEu, ErroApi, h, icone, mostrarErro } from "./painel-comum.ts";

interface ContactoApi {
  id: string;
  nome: string;
  email: string;
  funcao: string;
  perfil: "admin" | "entidade";
  entidades: string[];
  estado: string;
  consentimento: { em: string; versao: string; meio: string };
}

interface EntidadeLista {
  id: string;
  nome: string;
}

const ERROS: Record<string, string> = {
  nome: "Escreva o nome (2 a 100 caracteres).",
  email: "Escreva um e-mail válido.",
  entidades: "Escolha pelo menos uma entidade para um contacto do perfil Entidade.",
  consentimento:
    "Registe a data (não pode ser no futuro) e a versão do formulário de adesão assinado.",
  email_em_uso: "Este e-mail já pertence a outro contacto.",
  proprio: "Não pode tirar-se a si próprio de administrador nem suspender-se.",
  ultimo_admin: "Tem de ficar pelo menos um administrador ativo.",
};

const ESTADOS: Record<string, string> = {
  ativo: "Ativo",
  sem_lembretes: "Sem lembretes",
  suspenso: "Suspenso",
  removido: "Removido",
};

const lista = document.getElementById("lista-contactos") as HTMLElement;
const dialogo = document.getElementById("dialogo-contacto") as HTMLDialogElement;
const form = document.getElementById("form-contacto") as HTMLFormElement;
const estadoForm = document.getElementById("estado-contacto") as HTMLElement;
const listaEntidades = document.getElementById("lista-entidades") as HTMLElement;
const filtroEntidades = document.getElementById("filtro-entidades") as HTMLInputElement;
const titulo = document.getElementById("titulo-contacto") as HTMLElement;
const campo = (nome: string) =>
  form.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement;

let entidades: EntidadeLista[] = [];
let emEdicao: ContactoApi | null = null;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function desenharEntidades(escolhidas: Set<string>): void {
  const termo = normalizar(filtroEntidades.value);
  listaEntidades.replaceChildren(
    ...entidades.map((e) => {
      const caixa = h("input", {
        type: "checkbox",
        name: "entidades",
        value: e.id,
        checked: escolhidas.has(e.id),
      });
      const linha = h(
        "label",
        { class: "flex min-h-11 items-center gap-3 rounded px-2 text-base hover:bg-superficie" },
        caixa,
        e.nome,
      );
      linha.hidden = termo !== "" && !normalizar(e.nome).includes(termo) && !escolhidas.has(e.id);
      return linha;
    }),
  );
}

function escolhidas(): Set<string> {
  return new Set(
    [...form.querySelectorAll<HTMLInputElement>('input[name="entidades"]:checked')].map(
      (c) => c.value,
    ),
  );
}

function abrir(contacto: ContactoApi | null): void {
  emEdicao = contacto;
  form.reset();
  estadoForm.textContent = "";
  titulo.textContent = contacto ? `Editar: ${contacto.nome}` : "Novo contacto";
  if (contacto) {
    campo("nome").value = contacto.nome;
    campo("email").value = contacto.email;
    campo("funcao").value = contacto.funcao;
    campo("estado").value = contacto.estado;
    (
      form.querySelector(`input[name="perfil"][value="${contacto.perfil}"]`) as HTMLInputElement
    ).checked = true;
    campo("consentimento_em").value = contacto.consentimento.em;
    campo("consentimento_versao").value = contacto.consentimento.versao;
    campo("consentimento_meio").value = contacto.consentimento.meio;
  } else {
    campo("consentimento_em").value = momentoEmLisboa(new Date()).data;
  }
  filtroEntidades.value = "";
  desenharEntidades(new Set(contacto?.entidades ?? []));
  dialogo.showModal();
  campo("nome").focus();
}

async function carregar(): Promise<void> {
  const contactos = await api<ContactoApi[]>("/api/acessos");
  const nomeEntidade = (id: string) => entidades.find((e) => e.id === id)?.nome ?? id;
  if (contactos.length === 0) {
    lista.replaceChildren(h("p", {}, "Ainda não há contactos."));
    return;
  }
  const iniciais = (nome: string) =>
    nome
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  lista.replaceChildren(
    h(
      "ul",
      { class: "cartao divide-y divide-borda" },
      ...contactos.map((c) => {
        const ativo = c.estado === "ativo" || c.estado === "sem_lembretes";
        const editar = h(
          "button",
          { type: "button", class: "botao-secundario", "aria-label": `Editar ${c.nome}` },
          icone("edit"),
          h("span", { class: "hidden sm:inline" }, "Editar"),
        );
        editar.addEventListener("click", () => abrir(c));
        return h(
          "li",
          {
            class: `flex items-start gap-3 px-4 py-4 md:gap-4 md:px-5 ${ativo ? "" : "opacity-70"}`,
          },
          h(
            "span",
            {
              class:
                "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-azul-fundo font-bold text-azul-texto",
              "aria-hidden": "true",
            },
            iniciais(c.nome),
          ),
          h(
            "div",
            { class: "min-w-0 flex-1" },
            h(
              "p",
              { class: "flex flex-wrap items-center gap-2" },
              h("span", { class: "text-lg font-semibold" }, c.nome),
              h(
                "span",
                {
                  class: `etiqueta text-xs ${c.perfil === "admin" ? "bg-ardosia text-white" : "bg-slate-100 text-texto-secundario"}`,
                },
                c.perfil === "admin" ? "Administrador" : "Paróquia",
              ),
              h(
                "span",
                {
                  class: `etiqueta text-xs ${ativo ? "bg-confirmado-fundo text-confirmado" : "bg-red-50 text-erro"}`,
                },
                ESTADOS[c.estado] ?? c.estado,
              ),
            ),
            h("p", { class: "break-all text-texto-secundario" }, c.email),
            c.entidades.length > 0 &&
              h("p", { class: "mt-1" }, c.entidades.map(nomeEntidade).join(" · ")),
            h(
              "p",
              { class: "mt-1 text-sm text-texto-secundario" },
              `Consentimento: ${c.consentimento.em} (${c.consentimento.versao}, ${c.consentimento.meio})`,
            ),
          ),
          editar,
        );
      }),
    ),
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = {
    nome: campo("nome").value,
    email: campo("email").value,
    funcao: campo("funcao").value,
    estado: campo("estado").value,
    perfil: (form.querySelector('input[name="perfil"]:checked') as HTMLInputElement).value,
    entidades: [...escolhidas()],
    consentimento: {
      em: campo("consentimento_em").value,
      versao: campo("consentimento_versao").value,
      meio: campo("consentimento_meio").value,
    },
  };
  try {
    await api(emEdicao ? `/api/acessos/${emEdicao.id}` : "/api/acessos", {
      method: emEdicao ? "PUT" : "POST",
      body: JSON.stringify(dados),
    });
    dialogo.close();
    await carregar();
  } catch (erro) {
    estadoForm.textContent =
      erro instanceof ErroApi
        ? (ERROS[erro.codigo] ?? `Não foi possível gravar (${erro.estado}).`)
        : "Não foi possível gravar.";
  }
});

filtroEntidades.addEventListener("input", () => desenharEntidades(escolhidas()));
dialogo
  .querySelectorAll("[data-fechar]")
  .forEach((b) => b.addEventListener("click", () => dialogo.close()));

async function iniciar(): Promise<void> {
  try {
    const eu = await carregarEu();
    if (eu.perfil !== "admin") {
      mostrarErro(lista, "Só os administradores gerem os acessos.");
      return;
    }
    entidades = await api<EntidadeLista[]>("/api/entidades");
    const novo = document.getElementById("novo-contacto") as HTMLButtonElement;
    novo.hidden = false;
    novo.addEventListener("click", () => abrir(null));
    await carregar();
  } catch (e) {
    if (!(e instanceof ErroApi && (e.estado === 401 || e.estado === 403)))
      mostrarErro(lista, "Não foi possível carregar os acessos.");
  }
}

void iniciar();
