/**
 * E-1 — Página de uma paróquia no painel (§7.3): cabeçalho com *Está tudo certo* (P1), novo
 * horário e nova exceção; indicadores; horários habituais de cada local (editar e apagar, P2);
 * exceções próximas (P3); dias santos (P4); locais; histórico (E-6) com *Restaurar esta versão*
 * para administradores (§8.8). A entidade vem da página (`data-entidade`), já autorizada.
 */
import { alertasDeAnomalia, resumirPedido, type ParLocal } from "@missas/dados/resumo";
import {
  compararRegras,
  descreverHorarios,
  descreverRegra,
  etiquetas,
  iguais,
  momentoEmLisboa,
  type Entidade,
  type Local,
  type Regra,
} from "@missas/horarios";
import { TEXTOS, type TipoEntidade } from "../i18n/index.ts";
import { descreverExcecao } from "../lib/detalhe.ts";
import { ACOES, formatarData, formatarDataHora, haQuanto } from "../lib/painel.ts";
import { selo } from "../lib/portal.ts";
import { classeSelo, textoSelo } from "../lib/selo.ts";
import { api, ErroApi, h, icone, mostrarErro } from "./painel-comum.ts";
import { abrirDiasSantos } from "./painel-dias-santos.ts";
import { abrirEditor, type OpcoesEditor } from "./painel-editar.ts";
import { abrirExcecao, type OpcoesExcecao } from "./painel-excecoes.ts";
import type { Alteracao } from "./painel-modal.ts";
import { enviarGravacao, notificar, textoDoErro } from "./painel-pedidos.ts";

interface EstadoEntidade {
  entidade: Entidade;
  versao: number;
  locais: { local: Local; versao: number }[];
}

const t = TEXTOS["pt-PT"];
const conteudo = document.getElementById("conteudo-entidade") as HTMLElement;
const dialogo = document.getElementById("dialogo-pedido") as HTMLDialogElement;
const dialogoEditor = document.getElementById("dialogo-editor") as HTMLDialogElement;
const admin = conteudo.dataset.perfil === "admin";

/** Pergunta de confirmação num diálogo; `true` se a pessoa confirmar. */
function perguntar(titulo: string, conteudo: Node[], textoConfirmar: string): Promise<boolean> {
  (dialogo.querySelector("#titulo-pedido") as HTMLElement).textContent = titulo;
  (dialogo.querySelector("#corpo-pedido") as HTMLElement).replaceChildren(...conteudo);
  (dialogo.querySelector("#confirmar-pedido") as HTMLElement).textContent = textoConfirmar;
  dialogo.returnValue = "";
  dialogo.showModal();
  return new Promise((resolver) =>
    dialogo.addEventListener("close", () => resolver(dialogo.returnValue === "confirmar"), {
      once: true,
    }),
  );
}

/** Linhas do resumo de um pedido, local a local, como a pessoa as vai confirmar. */
function listaDoResumo(pares: ParLocal[]): HTMLElement {
  const nomes = new Map(pares.map((p) => [p.depois.id, p.depois.nome]));
  return h(
    "ul",
    { class: "grid gap-3" },
    ...resumirPedido(pares).map((r) =>
      h(
        "li",
        {},
        h("p", { class: "font-semibold" }, nomes.get(r.local) ?? r.local),
        h(
          "ul",
          { class: "mt-1 grid gap-1 pl-4 text-texto-secundario" },
          ...r.linhas.map((l) => h("li", {}, l)),
        ),
      ),
    ),
  );
}

/** Grava (imediato, ADR-005) e mostra a entidade com o estado novo. */
async function enviarEAcompanhar(
  corpo: Record<string, unknown>,
  botao: HTMLButtonElement,
  semAlteracoes: string,
): Promise<void> {
  botao.disabled = true;
  try {
    const gravado = await enviarGravacao(corpo);
    if (!gravado) {
      notificar(semAlteracoes, "ok");
      return;
    }
    notificar("Gravado. Já está no site.", "ok");
    await mostrarEntidade(String(corpo.entidade));
  } catch (e) {
    if (!(e instanceof ErroApi && e.codigo === "confirmar_alertas"))
      notificar(textoDoErro(e), "erro");
  } finally {
    botao.disabled = false;
  }
}

/** P1 — Está tudo certo: mostra os horários atuais e pede a confirmação. */
async function confirmarTudo(estado: EstadoEntidade, botao: HTMLButtonElement): Promise<void> {
  const conteudo = [
    h("p", {}, "Estes são os horários atuais:"),
    h(
      "ul",
      { class: "grid gap-3" },
      ...estado.locais.map(({ local }) =>
        h(
          "li",
          {},
          h("p", { class: "font-semibold" }, local.nome),
          h(
            "p",
            { class: "text-texto-secundario" },
            local.horarios.length ? descreverHorarios(local, "pt-PT") : "Sem horários registados.",
          ),
        ),
      ),
    ),
  ];
  if (
    !(await perguntar("Está tudo certo?", conteudo, "Confirmo que estes horários estão corretos"))
  )
    return;
  const hoje = momentoEmLisboa(new Date()).data;
  const pares = estado.locais.map(({ local }) => ({
    antes: local,
    depois: { ...local, confirmado_em: hoje },
  }));
  // O `base` garante que se confirma exatamente o que a pessoa viu.
  const base = Object.fromEntries(estado.locais.map((l) => [l.local.id, l.versao]));
  await enviarEAcompanhar(
    { tipo: "confirmacao", entidade: estado.entidade.id, base, resumo: resumirPedido(pares) },
    botao,
    "Os horários já estavam confirmados hoje.",
  );
}

/** P2 — Novo horário, editar ou apagar: um pedido `alteracao` por gravação (D24). */
async function editarHorario(
  estado: EstadoEntidade,
  opcoes: Pick<OpcoesEditor, "modo" | "indiceLocal" | "indiceRegra">,
  botao: HTMLButtonElement,
): Promise<void> {
  await gravarAlteracao(
    estado,
    await abrirEditor({ dialogo: dialogoEditor, locais: estado.locais, ...opcoes }),
    botao,
  );
}

/** P3 — Exceção numa data: nova, editar ou apagar. */
async function editarExcecao(
  estado: EstadoEntidade,
  opcoes: Pick<OpcoesExcecao, "modo" | "indiceLocal" | "indiceExcecao">,
  botao: HTMLButtonElement,
): Promise<void> {
  await gravarAlteracao(
    estado,
    await abrirExcecao({ dialogo: dialogoEditor, locais: estado.locais, ...opcoes }),
    botao,
  );
}

/** P4 — Regime dos dias santos de um local. */
async function editarDiasSantos(
  estado: EstadoEntidade,
  indiceLocal: number,
  botao: HTMLButtonElement,
): Promise<void> {
  await gravarAlteracao(
    estado,
    await abrirDiasSantos({ dialogo: dialogoEditor, locais: estado.locais, indiceLocal }),
    botao,
  );
}

/** Envia a alteração de um local (pedido `alteracao`) e acompanha o estado. */
async function gravarAlteracao(
  estado: EstadoEntidade,
  alteracao: Alteracao | null,
  botao: HTMLButtonElement,
): Promise<void> {
  if (!alteracao) return;
  const { local, depois, confirmarAlertas } = alteracao;
  await enviarEAcompanhar(
    {
      tipo: "alteracao",
      entidade: estado.entidade.id,
      locais: { [local.local.id]: { versao: local.versao, dados: depois } },
      resumo: resumirPedido([{ antes: local.local, depois }]),
      ...(confirmarAlertas && { confirmar_alertas: true }),
    },
    botao,
    "Nada mudou.",
  );
}

/** Uma gravação do histórico (ADR-005). */
interface Gravacao {
  id: number;
  data: string;
  acao: "importacao" | "confirmacao" | "alteracao" | "novo-local" | "restauro";
  resumo: { local: string; linhas: string[] }[];
  restaura: number | null;
  contacto: { ref: string; funcao: string | null; nome?: string } | null;
}

/** Restaurar esta versão (só `admin`, §8.8): mostra a diferença e envia um pedido `restauro`. */
async function restaurar(estado: EstadoEntidade, versao: Gravacao, botao: HTMLButtonElement) {
  let antiga: { entidade: Entidade; locais: { local: Local }[] };
  try {
    antiga = await api(
      `/api/entidades/${encodeURIComponent(estado.entidade.id)}/gravacoes/${versao.id}`,
    );
  } catch {
    notificar("Não foi possível abrir essa versão.", "erro");
    return;
  }
  const atuais = new Map(estado.locais.map((l) => [l.local.id, l]));
  const entidadeMuda = !iguais(antiga.entidade, estado.entidade);
  const pares: ParLocal[] = [];
  for (const { local } of antiga.locais) {
    const atual = atuais.get(local.id);
    if (atual && iguais(atual.local, local)) continue;
    pares.push({ antes: atual?.local ?? null, depois: local });
  }
  if (!entidadeMuda && pares.length === 0) {
    notificar("Essa versão é igual à atual.", "ok");
    return;
  }
  const alertas = alertasDeAnomalia(pares);
  const conteudo = [
    h("p", {}, `Repor os horários como estavam em ${formatarDataHora(versao.data)}:`),
    pares.length
      ? listaDoResumo(pares)
      : h("p", { class: "text-texto-secundario" }, "Só muda a ficha da entidade."),
    alertas.length > 0 &&
      h(
        "div",
        { class: "rounded-cartao bg-aviso-fundo p-3 text-dourado-texto", role: "note" },
        ...alertas.map((a) => h("p", {}, a)),
      ),
    h(
      "p",
      { class: "text-texto-secundario" },
      "O restauro grava uma versão nova; as anteriores ficam no histórico.",
    ),
  ].filter((n): n is HTMLElement => n instanceof HTMLElement);
  if (!(await perguntar("Restaurar esta versão?", conteudo, "Restaurar"))) return;
  await enviarEAcompanhar(
    {
      tipo: "restauro",
      entidade: estado.entidade.id,
      restaura: versao.id,
      // As versões que o painel viu: o servidor recusa se alguém gravou entretanto.
      base: {
        entidade: estado.versao,
        locais: Object.fromEntries(estado.locais.map((l) => [l.local.id, l.versao])),
      },
      resumo: resumirPedido(pares),
      ...(alertas.length > 0 && { confirmar_alertas: true }),
    },
    botao,
    "Essa versão é igual à atual.",
  );
}

const FUNCOES: Record<string, string> = {
  pároco: "Pároco",
  secretaria: "Secretaria",
  colaborador: "Colaborador",
  equipa: "Equipa do Arciprestado",
};

// --- Peças comuns -------------------------------------------------------------------------------

let cartoes = 0;

/** Cartão com cabeçalho (título, contagem e ação opcional) e corpo. */
function cartao(
  titulo: string,
  corpo: (Node | null | false)[],
  opcoes: { extra?: Node | null; rodape?: Node | null; nivel?: "h2" | "h3" } = {},
): HTMLElement {
  const id = `cartao-${++cartoes}`;
  return h(
    "section",
    { class: "cartao flex flex-col", "aria-labelledby": id },
    h(
      "div",
      {
        class:
          "flex min-h-14 items-center justify-between gap-3 border-b border-borda px-4 py-3 md:px-5",
      },
      h(opcoes.nivel ?? "h2", { id, class: "text-lg font-semibold" }, titulo),
      opcoes.extra ?? null,
    ),
    ...corpo,
    opcoes.rodape
      ? h("div", { class: "border-t border-borda px-4 py-2 md:px-5" }, opcoes.rodape)
      : null,
  );
}

function botaoIcone(
  nome: string,
  rotulo: string,
  aoClicar: (b: HTMLButtonElement) => void,
  perigo = false,
): HTMLButtonElement {
  const botao = h(
    "button",
    {
      type: "button",
      class: `botao-icone${perigo ? " botao-icone-perigo" : ""}`,
      "aria-label": rotulo,
      title: rotulo.split(":")[0],
    },
    icone(nome),
  );
  botao.addEventListener("click", () => aoClicar(botao));
  return botao;
}

/** Botão discreto de rodapé de cartão ("+ Novo horário"). */
function botaoAdicionar(texto: string, aoClicar: (b: HTMLButtonElement) => void): HTMLElement {
  const botao = h(
    "button",
    {
      type: "button",
      class:
        "inline-flex min-h-12 items-center gap-2 rounded-cartao px-2 font-semibold text-dourado-texto hover:bg-superficie",
    },
    icone("add"),
    texto,
  );
  botao.addEventListener("click", () => aoClicar(botao));
  return botao;
}

const vazio = (texto: string) =>
  h("p", { class: "px-4 py-5 text-texto-secundario md:px-5" }, texto);

// --- Histórico ------------------------------------------------------------------------------------

async function mostrarHistorico(alvo: HTMLElement, estado: EstadoEntidade): Promise<void> {
  alvo.replaceChildren(vazio("A carregar…"));
  let versoes: Gravacao[];
  try {
    versoes = await api(`/api/entidades/${encodeURIComponent(estado.entidade.id)}/historico`);
  } catch {
    mostrarErro(alvo, "Não foi possível carregar o histórico.");
    return;
  }
  const nomes = new Map(estado.locais.map((l) => [l.local.id, l.local.nome]));
  if (versoes.length === 0) {
    alvo.replaceChildren(vazio("Sem alterações registadas."));
    return;
  }
  alvo.replaceChildren(
    h(
      "ol",
      { class: "divide-y divide-borda" },
      ...versoes.map((v, i) => {
        const quem = v.contacto
          ? (v.contacto.nome ?? FUNCOES[v.contacto.funcao ?? ""] ?? "Contacto da paróquia")
          : "Equipa técnica";
        const botao =
          admin && i > 0
            ? h(
                "button",
                { type: "button", class: "botao-secundario" },
                icone("history"),
                "Restaurar esta versão",
              )
            : null;
        botao?.addEventListener("click", () => void restaurar(estado, v, botao));
        return h(
          "li",
          {
            class: "grid gap-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:px-5",
          },
          h(
            "div",
            { class: "min-w-0" },
            h(
              "p",
              { class: "flex flex-wrap items-center gap-2" },
              h("span", { class: "font-semibold" }, ACOES[v.acao] ?? v.acao),
              i === 0 &&
                h(
                  "span",
                  { class: "etiqueta bg-confirmado-fundo text-xs text-confirmado" },
                  "Versão atual",
                ),
            ),
            h(
              "p",
              { class: "text-sm text-texto-secundario" },
              h("time", { datetime: v.data }, formatarDataHora(v.data)),
              ` · ${quem}`,
            ),
            ...v.resumo.map((r) =>
              h(
                "div",
                { class: "mt-2 text-base text-texto-secundario" },
                estado.locais.length > 1 &&
                  h("p", { class: "font-semibold text-ardosia" }, nomes.get(r.local) ?? r.local),
                h("ul", { class: "grid gap-1" }, ...r.linhas.map((l) => h("li", {}, l))),
              ),
            ),
          ),
          botao,
        );
      }),
    ),
  );
}

// --- Horários habituais ---------------------------------------------------------------------------

const DIAS_CURTOS: Record<string, string> = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sáb",
  dom: "Dom",
  santo: "Dia santo",
};

function rotuloDias(regra: Regra): string {
  const dias = regra.dias;
  if (
    dias.length === 5 &&
    ["seg", "ter", "qua", "qui", "sex"].every((d) => dias.includes(d as never))
  )
    return "Dias úteis";
  return dias.map((d) => DIAS_CURTOS[d] ?? d).join(" · ");
}

interface AcoesRegra {
  editar(botao: HTMLButtonElement): void;
  apagar(botao: HTMLButtonElement): void;
}

function caixaHora(cima: string, hora: string): HTMLElement {
  return h(
    "div",
    {
      class:
        "flex w-20 shrink-0 flex-col items-center rounded-cartao bg-superficie px-1 py-2 text-center md:w-24",
    },
    h(
      "span",
      { class: "text-xs leading-tight font-bold tracking-wide text-texto-secundario uppercase" },
      cima,
    ),
    h("span", { class: "text-timetable-time font-bold tabular-nums" }, hora),
  );
}

function botoesLinha(descricao: string, acoes: AcoesRegra): HTMLElement {
  return h(
    "div",
    { class: "flex shrink-0 gap-2" },
    botaoIcone("edit", `Editar: ${descricao}`, acoes.editar),
    botaoIcone("delete", `Apagar: ${descricao}`, acoes.apagar, true),
  );
}

function linhaRegra(regra: Regra, hoje: string, acoes: AcoesRegra): HTMLElement {
  const automaticas = etiquetas(regra, "pt-PT");
  const semSemanal = regra.semanas_do_mes || regra.quinzenal ? automaticas : automaticas.slice(1);
  const terminou = regra.validade?.ate !== undefined && regra.validade.ate < hoje;
  const futura = regra.validade?.de !== undefined && regra.validade.de > hoje;
  return h(
    "li",
    { class: `flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5 ${terminou ? "opacity-60" : ""}` },
    caixaHora(rotuloDias(regra), regra.hora),
    h(
      "div",
      { class: "min-w-0 flex-1" },
      h(
        "p",
        { class: "font-semibold" },
        regra.tipo === "missa"
          ? descreverRegra(regra, "pt-PT")
          : descreverRegra(regra, "pt-PT", { comTipo: true }),
      ),
      h(
        "p",
        { class: "mt-1 flex flex-wrap gap-1.5 empty:hidden" },
        terminou &&
          h("span", { class: "etiqueta bg-slate-100 text-sm text-texto-secundario" }, "Terminou"),
        futura &&
          h(
            "span",
            { class: "etiqueta bg-azul-fundo text-sm text-azul-texto" },
            "Ainda não começou",
          ),
        ...semSemanal.map((e) =>
          h("span", { class: "etiqueta bg-slate-100 text-sm text-texto-secundario" }, e),
        ),
        regra.nota &&
          h("span", { class: "etiqueta bg-azul-fundo text-sm text-azul-texto" }, regra.nota),
      ),
    ),
    botoesLinha(`${rotuloDias(regra)} às ${regra.hora}`, acoes),
  );
}

function cartaoHorarios(estado: EstadoEntidade, indiceLocal: number, hoje: string): HTMLElement {
  const { local } = estado.locais[indiceLocal] as { local: Local };
  const varios = estado.locais.length > 1;
  // Ordenadas para mostrar, mas com o índice original em `local.horarios` (para editar).
  const regras = local.horarios
    .map((regra, indice) => ({ regra, indice }))
    .sort((a, b) => compararRegras(a.regra, b.regra));
  const verNoSite = h(
    "a",
    {
      class: "ligacao inline-flex min-h-12 shrink-0 items-center gap-1 text-sm",
      href: `/paroquia/${local.entidade}/#${local.id}`,
      target: "_blank",
      rel: "noopener",
    },
    "Ver no site",
    icone("open_in_new", "size-4"),
  );
  return cartao(
    varios ? `Horários · ${local.nome}` : "Horários habituais",
    [
      !local.publicar &&
        h(
          "p",
          { class: "mx-4 mt-3 rounded-cartao bg-aviso-fundo p-3 text-dourado-texto md:mx-5" },
          "Este local não está publicado no site.",
        ),
      regras.length
        ? h(
            "ul",
            { class: "divide-y divide-borda" },
            ...regras.map(({ regra, indice }) =>
              linhaRegra(regra, hoje, {
                editar: (b) =>
                  void editarHorario(
                    estado,
                    { modo: "editar", indiceLocal, indiceRegra: indice },
                    b,
                  ),
                apagar: (b) =>
                  void editarHorario(
                    estado,
                    { modo: "apagar", indiceLocal, indiceRegra: indice },
                    b,
                  ),
              }),
            ),
          )
        : vazio("Ainda não há horários registados."),
    ],
    {
      extra: verNoSite,
      rodape: botaoAdicionar(
        "Novo horário",
        (b) => void editarHorario(estado, { modo: "novo", indiceLocal }, b),
      ),
    },
  );
}

// --- Coluna lateral -------------------------------------------------------------------------------

function cartaoExcecoes(estado: EstadoEntidade, hoje: string): HTMLElement {
  const varios = estado.locais.length > 1;
  const proximas = estado.locais
    .flatMap(({ local }, indiceLocal) =>
      local.excecoes.map((excecao, indiceExcecao) => ({
        local,
        excecao,
        indiceLocal,
        indiceExcecao,
      })),
    )
    .filter(({ excecao }) => excecao.data >= hoje)
    .sort((a, b) => a.excecao.data.localeCompare(b.excecao.data));
  const MES = new Intl.DateTimeFormat("pt-PT", { month: "short", timeZone: "UTC" });
  return cartao(
    "Exceções próximas",
    [
      proximas.length
        ? h(
            "ul",
            { class: "divide-y divide-borda" },
            ...proximas.map(({ local, excecao, indiceLocal, indiceExcecao }) => {
              const texto = descreverExcecao(excecao, "pt-PT");
              const data = new Date(`${excecao.data}T12:00:00Z`);
              return h(
                "li",
                { class: "flex items-start gap-3 px-4 py-3 md:px-5" },
                h(
                  "div",
                  {
                    class:
                      "flex w-14 shrink-0 flex-col items-center rounded-cartao bg-aviso-fundo py-1 text-dourado-texto",
                  },
                  h(
                    "span",
                    { class: "text-xl leading-tight font-bold tabular-nums" },
                    String(data.getUTCDate()),
                  ),
                  h(
                    "span",
                    { class: "text-xs font-bold uppercase" },
                    MES.format(data).replace(".", ""),
                  ),
                ),
                h(
                  "div",
                  { class: "min-w-0 flex-1" },
                  h("p", {}, texto),
                  varios && h("p", { class: "text-sm text-texto-secundario" }, local.nome),
                ),
                botoesLinha(texto, {
                  editar: (b) =>
                    void editarExcecao(estado, { modo: "editar", indiceLocal, indiceExcecao }, b),
                  apagar: (b) =>
                    void editarExcecao(estado, { modo: "apagar", indiceLocal, indiceExcecao }, b),
                }),
              );
            }),
          )
        : vazio("Nenhuma exceção agendada."),
    ],
    {
      extra:
        proximas.length > 0
          ? h(
              "span",
              { class: "etiqueta bg-aviso-fundo text-sm text-dourado-texto" },
              String(proximas.length),
            )
          : null,
      rodape: botaoAdicionar(
        "Adicionar exceção",
        (b) => void editarExcecao(estado, { modo: "nova" }, b),
      ),
    },
  );
}

function cartaoDiasSantos(estado: EstadoEntidade): HTMLElement {
  const varios = estado.locais.length > 1;
  return cartao("Dias santos de preceito", [
    h(
      "ul",
      { class: "divide-y divide-borda" },
      ...estado.locais.map(({ local }, indiceLocal) => {
        const falta = local.dias_santos === null;
        const botao = h(
          "button",
          {
            type: "button",
            class: falta ? "botao-primario shrink-0" : "botao-secundario shrink-0",
            "aria-label": `${falta ? "Indicar" : "Alterar"} o horário dos dias santos${varios ? ` em ${local.nome}` : ""}`,
          },
          falta ? "Indicar" : "Alterar",
        );
        botao.addEventListener("click", () => void editarDiasSantos(estado, indiceLocal, botao));
        return h(
          "li",
          { class: "flex items-center gap-3 px-4 py-3 md:px-5" },
          h(
            "div",
            { class: "min-w-0 flex-1" },
            varios && h("p", { class: "font-semibold" }, local.nome),
            h(
              "p",
              {
                class: falta
                  ? "flex items-start gap-1 text-dourado-texto"
                  : "text-texto-secundario",
              },
              falta && icone("warning", "mt-0.5 size-5"),
              falta ? "Ainda não indicado." : t.regimes[local.dias_santos ?? "null"],
            ),
          ),
          botao,
        );
      }),
    ),
  ]);
}

function cartaoLocais(estado: EstadoEntidade): HTMLElement {
  return cartao(
    "Igrejas e capelas",
    [
      h(
        "ul",
        { class: "divide-y divide-borda" },
        ...estado.locais.map(({ local }) =>
          h(
            "li",
            { class: "flex items-center gap-3 px-4 py-3 md:px-5" },
            icone("church", "size-6 shrink-0 text-dourado-texto"),
            h(
              "div",
              { class: "min-w-0 flex-1" },
              h("p", { class: "font-semibold" }, local.nome),
              h(
                "p",
                { class: "text-sm text-texto-secundario" },
                [local.localidade, local.concelho].filter(Boolean).join(" · "),
              ),
            ),
            h(
              "span",
              {
                class: `etiqueta shrink-0 text-xs ${local.publicar ? "bg-confirmado-fundo text-confirmado" : "bg-slate-100 text-texto-secundario"}`,
              },
              local.publicar ? "No site" : "Não publicado",
            ),
          ),
        ),
      ),
    ],
    { extra: h("span", { class: "text-sm text-texto-secundario" }, String(estado.locais.length)) },
  );
}

// --- Cabeçalho e indicadores ----------------------------------------------------------------------

function indicadores(estado: EstadoEntidade, hoje: string): HTMLElement {
  const locais = estado.locais.map((l) => l.local);
  // Em vigor: já começou e ainda não acabou (a validade, se houver, inclui hoje).
  const ativas = locais
    .flatMap((l) => l.horarios)
    .filter(
      (r) =>
        !(r.validade?.ate && r.validade.ate < hoje) && !(r.validade?.de && r.validade.de > hoje),
    ).length;
  const excecoes = locais.flatMap((l) => l.excecoes).filter((e) => e.data >= hoje).length;
  const datas = locais.filter((l) => l.publicar).map((l) => l.confirmado_em);
  const confirmacao =
    datas.length === 0 || datas.includes(null)
      ? null
      : (datas as string[]).reduce((a, b) => (a < b ? a : b));
  const numero = (rotulo: string, valor: string, nome: string, detalhe?: string) =>
    h(
      "li",
      { class: "cartao flex items-center gap-3 p-3 md:p-4" },
      h(
        "span",
        {
          class:
            "hidden size-11 shrink-0 items-center justify-center rounded-cartao bg-superficie sm:inline-flex",
        },
        icone(nome, "size-6 text-dourado-texto"),
      ),
      h(
        "div",
        { class: "min-w-0" },
        h("p", { class: "rotulo" }, rotulo),
        h("p", { class: "text-xl font-bold" }, valor),
        detalhe ? h("p", { class: "text-sm text-texto-secundario" }, detalhe) : null,
      ),
    );
  return h(
    "ul",
    { class: "grid grid-cols-2 gap-3 lg:grid-cols-4", "aria-label": "Resumo" },
    numero("Horários em vigor", String(ativas), "schedule"),
    numero("Igrejas e capelas", String(locais.length), "church"),
    numero("Exceções agendadas", String(excecoes), "event"),
    numero(
      "Última confirmação",
      confirmacao ? haQuanto(confirmacao, hoje) : "Nunca",
      "verified",
      confirmacao ? formatarData(confirmacao) : "Use Está tudo certo",
    ),
  );
}

function cabecalho(estado: EstadoEntidade, hoje: string): HTMLElement {
  const tipo = (
    estado.entidade.tipo in t.pelaEntidade ? estado.entidade.tipo : "outro"
  ) as TipoEntidade;
  const principal = estado.locais.find((l) => l.local.publicar)?.local ?? estado.locais[0]?.local;
  const datas = estado.locais.filter((l) => l.local.publicar).map((l) => l.local.confirmado_em);
  const confirmadoEm =
    datas.length === 0 || datas.includes(null)
      ? null
      : (datas as string[]).reduce((a, b) => (a < b ? a : b));
  const { estado: estadoSelo, dias } = selo(confirmadoEm, hoje);

  const botaoConfirmar = h(
    "button",
    { type: "button", class: "botao-confirmar" },
    icone("check_circle"),
    "Está tudo certo",
  );
  botaoConfirmar.addEventListener("click", () => void confirmarTudo(estado, botaoConfirmar));
  const botaoExcecao = h(
    "button",
    { type: "button", class: "botao-secundario" },
    icone("event"),
    "Adicionar exceção",
  );
  botaoExcecao.addEventListener(
    "click",
    () => void editarExcecao(estado, { modo: "nova" }, botaoExcecao),
  );
  const botaoNovo = h(
    "button",
    { type: "button", class: "botao-primario" },
    icone("add"),
    "Novo horário",
  );
  botaoNovo.addEventListener(
    "click",
    () => void editarHorario(estado, { modo: "novo" }, botaoNovo),
  );

  const semRegime = estado.locais
    .filter(({ local }) => local.dias_santos === null)
    .map(({ local }) => local.nome);
  const telefones = estado.entidade.telefones_publicos ?? [];

  return h(
    "section",
    { class: "cartao p-4 md:p-6", "aria-labelledby": "titulo-entidade" },
    h(
      "div",
      { class: "flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between" },
      h(
        "div",
        { class: "flex min-w-0 items-start gap-4" },
        h(
          "span",
          {
            class:
              "hidden size-14 shrink-0 items-center justify-center rounded-xl bg-azul-fundo text-azul-texto sm:inline-flex",
          },
          icone("church", "size-8"),
        ),
        h(
          "div",
          { class: "min-w-0" },
          h(
            "h1",
            { id: "titulo-entidade", class: "text-2xl leading-tight font-bold md:text-3xl" },
            estado.entidade.nome,
          ),
          h(
            "p",
            { class: "mt-2 flex flex-wrap items-center gap-2 text-texto-secundario" },
            principal?.concelho &&
              h(
                "span",
                {
                  class:
                    "etiqueta bg-slate-100 text-xs tracking-wide text-texto-secundario uppercase",
                },
                principal.concelho,
              ),
            principal?.localidade && h("span", {}, principal.localidade),
            telefones.length > 0 &&
              h(
                "span",
                { class: "inline-flex items-center gap-1" },
                icone("call", "size-4"),
                telefones.join(" · "),
              ),
          ),
          h(
            "p",
            { class: "mt-3" },
            h(
              "span",
              {
                class: `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${classeSelo(estadoSelo)}`,
              },
              icone("verified", "size-4"),
              textoSelo("pt-PT", "longo", estadoSelo, dias, confirmadoEm, tipo),
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "grid gap-2 sm:flex sm:flex-wrap lg:shrink-0 lg:flex-nowrap lg:justify-end" },
        botaoConfirmar,
        botaoExcecao,
        botaoNovo,
      ),
    ),
    semRegime.length > 0 &&
      h(
        "p",
        {
          class: "mt-4 flex items-start gap-2 rounded-cartao bg-aviso-fundo p-3 text-dourado-texto",
          role: "note",
        },
        icone("warning", "mt-0.5 size-5"),
        `Falta indicar o que há nos dias santos de preceito em: ${semRegime.join(", ")}.`,
      ),
  );
}

// --- Página ---------------------------------------------------------------------------------------

async function mostrarEntidade(id: string): Promise<void> {
  conteudo.setAttribute("aria-busy", "true");
  const hoje = momentoEmLisboa(new Date()).data;
  try {
    const estado = await api<EstadoEntidade>(`/api/entidades/${encodeURIComponent(id)}`);
    const listaHistorico = h("div", {});
    const botaoHistorico = h(
      "button",
      { type: "button", class: "botao-secundario" },
      icone("history"),
      "Ver alterações",
    );
    botaoHistorico.addEventListener("click", () => {
      botaoHistorico.hidden = true;
      void mostrarHistorico(listaHistorico, estado);
    });
    document.title = `${estado.entidade.nome} — Painel dos horários`;
    conteudo.replaceChildren(
      h(
        "div",
        { class: "grid gap-6" },
        cabecalho(estado, hoje),
        indicadores(estado, hoje),
        h(
          "div",
          { class: "grid items-start gap-6 lg:grid-cols-3" },
          h(
            "div",
            { class: "grid gap-6 lg:col-span-2" },
            ...estado.locais.map((_, indiceLocal) => cartaoHorarios(estado, indiceLocal, hoje)),
          ),
          h(
            "div",
            { class: "grid gap-6" },
            cartaoExcecoes(estado, hoje),
            cartaoDiasSantos(estado),
            cartaoLocais(estado),
          ),
        ),
        cartao("Histórico de alterações", [listaHistorico], {
          extra: botaoHistorico,
        }),
      ),
    );
  } catch (e) {
    if (e instanceof ErroApi && e.estado === 403)
      mostrarErro(conteudo, "Não tem acesso a esta paróquia.");
    else if (!(e instanceof ErroApi && e.estado === 401))
      mostrarErro(
        conteudo,
        "Não foi possível carregar os horários. Tente novamente daqui a pouco.",
      );
  } finally {
    conteudo.setAttribute("aria-busy", "false");
  }
}

void mostrarEntidade(conteudo.dataset.entidade ?? "");
