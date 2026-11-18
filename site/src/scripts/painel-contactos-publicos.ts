/**
 * Contactos da paróquia que aparecem no site (responsáveis, telefones, e-mail e site): pedido
 * `contactos`. O painel normaliza o que a pessoa escreve (`@missas/dados/contactos`) e mostra o
 * resumo; o Worker volta a verificar e só grava a forma canónica.
 */
import {
  LIMITES_CONTACTOS,
  normalizarEmail,
  normalizarSite,
  normalizarTelefone,
  resumirContactos,
  type ContactosPublicos,
} from "@missas/dados/contactos";
import type { ResumoLocal } from "@missas/dados/resumo";
import { h, icone } from "./painel-comum.ts";
import { campo, novoId, valorDe } from "./painel-modal.ts";

export interface MudancaContactos {
  contactos: ContactosPublicos;
  resumo: ResumoLocal[];
}

const linhas = (texto: string) =>
  texto
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Os contactos escritos no formulário, já normalizados, ou o primeiro problema encontrado. */
export function lerContactos(form: HTMLFormElement): ContactosPublicos | string {
  const responsaveis = [...new Set(linhas(valorDe(form, "responsaveis")))];
  if (responsaveis.length > LIMITES_CONTACTOS.responsaveis)
    return `No máximo ${LIMITES_CONTACTOS.responsaveis} responsáveis.`;
  const longo = responsaveis.find((r) => r.length < 2 || r.length > LIMITES_CONTACTOS.texto);
  if (longo !== undefined)
    return `Cada responsável tem de ter entre 2 e ${LIMITES_CONTACTOS.texto} caracteres.`;

  const telefones: string[] = [];
  for (const t of linhas(valorDe(form, "telefones"))) {
    const normal = normalizarTelefone(t);
    if (!normal) return `Telefone inválido: ${t}. Use os 9 algarismos (por exemplo 253 123 456).`;
    if (!telefones.includes(normal)) telefones.push(normal);
  }
  if (telefones.length > LIMITES_CONTACTOS.telefones)
    return `No máximo ${LIMITES_CONTACTOS.telefones} telefones.`;

  const emailEscrito = valorDe(form, "email").trim();
  const email = emailEscrito ? normalizarEmail(emailEscrito) : null;
  if (emailEscrito && !email) return "E-mail inválido.";

  const siteEscrito = valorDe(form, "site").trim();
  const site = siteEscrito ? normalizarSite(siteEscrito) : null;
  if (siteEscrito && !site) return "Site inválido (por exemplo https://paroquia.pt).";

  return { responsaveis, telefones_publicos: telefones, email, site };
}

/** Abre o modal; resolve com os contactos novos e o resumo, ou `null` se a pessoa cancelar. */
export function abrirContactos(opcoes: {
  dialogo: HTMLDialogElement;
  entidade: string;
  atuais: ContactosPublicos;
}): Promise<MudancaContactos | null> {
  const { dialogo, atuais } = opcoes;
  const idTitulo = novoId("titulo");
  const resumo = h("div", { class: "grid gap-2", "aria-live": "polite" });
  const gravar = h("button", { type: "submit", class: "botao-primario" }, "Gravar");
  const cancelar = h("button", { type: "button", class: "botao-secundario" }, "Cancelar");
  const fechar = h(
    "button",
    {
      type: "button",
      class: "botao-icone -mt-1 -mr-2 border-transparent",
      "aria-label": "Fechar",
      title: "Fechar",
    },
    icone("close"),
  );
  const areaTexto = (nome: string, valor: string[], linhasVisiveis: number) =>
    h(
      "textarea",
      { name: nome, class: "campo py-3", rows: String(linhasVisiveis) },
      valor.join("\n"),
    );
  const form = h(
    "form",
    { class: "modal-conteudo", novalidate: true },
    h(
      "div",
      { class: "modal-cabecalho" },
      h("h2", { id: idTitulo, class: "text-xl font-semibold" }, "Contactos no site"),
      fechar,
    ),
    h(
      "div",
      { class: "modal-corpo" },
      h(
        "p",
        { class: "text-texto-secundario" },
        "Estes contactos aparecem na página da paróquia, para quem a visita. Não ponha contactos pessoais sem autorização.",
      ),
      campo(
        "Responsáveis",
        areaTexto("responsaveis", atuais.responsaveis, 3),
        "Um por linha, com a função. Por exemplo: Pe. João Silva (pároco).",
      ),
      campo(
        "Telefones",
        areaTexto("telefones", atuais.telefones_publicos, 2),
        "Um por linha. Fixo ou telemóvel, com os 9 algarismos.",
      ),
      campo(
        "E-mail",
        h("input", {
          type: "email",
          name: "email",
          class: "campo",
          value: atuais.email ?? "",
          autocomplete: "off",
          maxlength: String(LIMITES_CONTACTOS.email),
        }),
      ),
      campo(
        "Site",
        h("input", {
          type: "text",
          name: "site",
          class: "campo",
          inputmode: "url",
          value: atuais.site ?? "",
          placeholder: "https://",
          maxlength: String(LIMITES_CONTACTOS.site),
        }),
      ),
      h(
        "section",
        { class: "grid gap-2 rounded-cartao border border-borda bg-superficie p-4" },
        h("h3", { class: "rotulo" }, "O que vai mudar"),
        resumo,
      ),
    ),
    h("div", { class: "modal-rodape" }, cancelar, gravar),
  );
  dialogo.setAttribute("aria-labelledby", idTitulo);
  dialogo.replaceChildren(form);

  let pronta: MudancaContactos | null = null;
  const atualizar = () => {
    pronta = null;
    gravar.disabled = true;
    const lidos = lerContactos(form);
    if (typeof lidos === "string") {
      resumo.replaceChildren(h("p", { class: "font-semibold text-erro" }, lidos));
      return;
    }
    const r = resumirContactos(opcoes.entidade, atuais, lidos);
    const mudancas = r.flatMap((x) => x.linhas);
    if (mudancas.length === 0) {
      resumo.replaceChildren(h("p", { class: "text-texto-secundario" }, "Nada muda."));
      return;
    }
    resumo.replaceChildren(
      h("ul", { class: "grid gap-1 break-words" }, ...mudancas.map((l) => h("li", {}, l))),
    );
    pronta = { contactos: lidos, resumo: r };
    gravar.disabled = false;
  };
  form.addEventListener("input", atualizar);
  atualizar();

  return new Promise((resolver) => {
    let resultado: MudancaContactos | null = null;
    cancelar.addEventListener("click", () => dialogo.close());
    fechar.addEventListener("click", () => dialogo.close());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!pronta) return;
      resultado = pronta;
      dialogo.close();
    });
    dialogo.addEventListener("close", () => resolver(resultado), { once: true });
    dialogo.showModal();
  });
}
