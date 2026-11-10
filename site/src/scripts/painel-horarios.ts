/**
 * E-1 — Horários (§7.3), só de leitura (E3.7): seletor de entidade, cartão da entidade, resumo,
 * horários habituais, exceções próximas e regime dos dias santos de cada local.
 */
import {
  compararRegras,
  descreverRegra,
  etiquetas,
  momentoEmLisboa,
  type Entidade,
  type Local,
  type Regra,
} from "@missas/horarios";
import { TEXTOS, type TipoEntidade } from "../i18n/index.ts";
import { descreverExcecao } from "../lib/detalhe.ts";
import { selo } from "../lib/portal.ts";
import { classeSelo, textoSelo } from "../lib/selo.ts";
import { api, carregarEu, ErroApi, h, icone, mostrarErro, type Eu } from "./painel-comum.ts";

interface EntidadeLista {
  id: string;
  nome: string;
  tipo: string;
  locais: string[];
}

interface EstadoEntidade {
  origem: "main" | "site";
  entidade: Pick<Entidade, "id" | "nome" | "tipo">;
  sha: string | null;
  locais: { local: Local; sha: string | null }[];
}

const t = TEXTOS["pt-PT"];
const conteudo = document.getElementById("conteudo-entidade") as HTMLElement;
const escolha = document.getElementById("escolha-entidade") as HTMLElement;
const seletor = document.getElementById("entidade") as HTMLSelectElement;
const filtro = document.getElementById("filtro-entidade") as HTMLInputElement;
const caixaFiltro = document.getElementById("caixa-filtro") as HTMLElement;

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

function cartaoRegra(regra: Regra, hoje: string): HTMLElement {
  const automaticas = etiquetas(regra, "pt-PT");
  const semSemanal = regra.semanas_do_mes || regra.quinzenal ? automaticas : automaticas.slice(1);
  const inativa = regra.validade?.ate !== undefined && regra.validade.ate < hoje;
  return h(
    "li",
    {
      class: `flex items-start gap-4 rounded-cartao border border-borda bg-cartao p-4 ${inativa ? "opacity-60" : ""}`,
    },
    h(
      "div",
      {
        class:
          "flex w-24 shrink-0 flex-col items-center rounded-cartao bg-superficie px-1 py-2 text-center",
      },
      h(
        "span",
        { class: "text-xs font-bold tracking-wide text-texto-secundario uppercase" },
        rotuloDias(regra),
      ),
      h("span", { class: "text-timetable-time font-bold tabular-nums" }, regra.hora),
    ),
    h(
      "div",
      { class: "min-w-0 flex-1" },
      h(
        "p",
        { class: "text-base font-semibold" },
        regra.tipo === "missa"
          ? descreverRegra(regra, "pt-PT")
          : descreverRegra(regra, "pt-PT", { comTipo: true }),
      ),
      h(
        "p",
        { class: "mt-2 flex flex-wrap gap-2 empty:hidden" },
        ...semSemanal.map((e) =>
          h("span", { class: "etiqueta bg-slate-100 text-texto-secundario" }, e),
        ),
        regra.nota && h("span", { class: "etiqueta bg-azul-fundo text-azul-texto" }, regra.nota),
      ),
    ),
  );
}

function seccaoLocal(local: Local, tipoEntidade: TipoEntidade, hoje: string): HTMLElement {
  const regras = [...local.horarios].sort(compararRegras);
  const excecoes = local.excecoes
    .filter((e) => e.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data));
  const { estado, dias } = selo(local.confirmado_em, hoje);
  return h(
    "section",
    { class: "grid gap-4 rounded-xl border border-borda bg-superficie p-4 md:p-5" },
    h(
      "div",
      { class: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        {},
        h("h2", { class: "text-xl font-semibold" }, local.nome),
        h(
          "p",
          { class: "flex items-center gap-1 text-base text-texto-secundario" },
          icone("location_on", "size-4"),
          [local.localidade, local.concelho].filter(Boolean).join(" · "),
        ),
        h(
          "p",
          { class: `mt-2 inline-block rounded px-2 py-1 text-sm ${classeSelo(estado)}` },
          textoSelo("pt-PT", "longo", estado, dias, local.confirmado_em, tipoEntidade),
        ),
      ),
      h(
        "a",
        {
          class: "ligacao inline-flex min-h-12 items-center",
          href: `/#${local.id}`,
          target: "_blank",
          rel: "noopener",
        },
        "Ver no site",
      ),
    ),
    !local.publicar &&
      h(
        "p",
        { class: "rounded-cartao bg-aviso-fundo p-3 text-base text-dourado-texto" },
        "Este local não está publicado no site.",
      ),
    h(
      "h3",
      { class: "text-base font-bold tracking-wide text-texto-secundario uppercase" },
      "Horários habituais",
    ),
    regras.length
      ? h("ul", { class: "grid gap-3" }, ...regras.map((r) => cartaoRegra(r, hoje)))
      : h("p", { class: "text-texto-secundario" }, "Sem horários registados."),
    h(
      "h3",
      { class: "text-base font-bold tracking-wide text-texto-secundario uppercase" },
      "Exceções próximas",
    ),
    excecoes.length
      ? h(
          "ul",
          { class: "list-disc pl-5 text-base" },
          ...excecoes.map((e) => h("li", {}, descreverExcecao(e, "pt-PT"))),
        )
      : h("p", { class: "text-texto-secundario" }, "Nenhuma."),
    h(
      "h3",
      { class: "text-base font-bold tracking-wide text-texto-secundario uppercase" },
      "Dias santos de preceito",
    ),
    h("p", { class: "text-base" }, t.regimes[local.dias_santos ?? "null"]),
  );
}

function resumo(estadoEntidade: EstadoEntidade, hoje: string): HTMLElement {
  const locais = estadoEntidade.locais.map((l) => l.local);
  // Em vigor: já começou e ainda não acabou (a validade, se houver, inclui hoje).
  const ativas = locais
    .flatMap((l) => l.horarios)
    .filter(
      (r) =>
        !(r.validade?.ate && r.validade.ate < hoje) && !(r.validade?.de && r.validade.de > hoje),
    ).length;
  const excecoes = locais.flatMap((l) => l.excecoes).filter((e) => e.data >= hoje).length;
  const numero = (rotulo: string, valor: number, nome: string) =>
    h(
      "div",
      { class: "flex items-center gap-3 rounded-cartao border border-borda bg-cartao p-4" },
      icone(nome, "size-6 text-dourado-texto"),
      h(
        "div",
        {},
        h(
          "p",
          { class: "text-sm font-bold tracking-wide text-texto-secundario uppercase" },
          rotulo,
        ),
        h("p", { class: "text-xl font-semibold" }, String(valor)),
      ),
    );
  return h(
    "div",
    { class: "grid gap-3 sm:grid-cols-3" },
    numero("Horários em vigor", ativas, "schedule"),
    numero("Locais", locais.length, "church"),
    numero("Exceções agendadas", excecoes, "event"),
  );
}

async function mostrarEntidade(id: string): Promise<void> {
  conteudo.replaceChildren(h("p", { class: "text-texto-secundario" }, "A carregar…"));
  const hoje = momentoEmLisboa(new Date()).data;
  try {
    const estado = await api<EstadoEntidade>(`/api/entidades/${encodeURIComponent(id)}`);
    const tipo = (
      estado.entidade.tipo in t.pelaEntidade ? estado.entidade.tipo : "outro"
    ) as TipoEntidade;
    conteudo.replaceChildren(
      h(
        "div",
        { class: "grid gap-6" },
        h(
          "div",
          { class: "rounded-xl border border-borda bg-cartao p-5" },
          h("h1", { class: "text-2xl font-bold" }, estado.entidade.nome),
          h(
            "p",
            { class: "mt-2 text-base text-texto-secundario" },
            "Por agora o painel só mostra os horários. Confirmar, acrescentar e mudar horários chega nas próximas versões.",
          ),
          estado.origem === "site" &&
            h(
              "p",
              { class: "mt-2 text-sm text-texto-secundario" },
              "Dados da última publicação do site (a leitura direta do repositório ainda não está configurada).",
            ),
        ),
        resumo(estado, hoje),
        ...estado.locais.map(({ local }) => seccaoLocal(local, tipo, hoje)),
      ),
    );
  } catch (e) {
    if (e instanceof ErroApi && e.estado === 403)
      mostrarErro(conteudo, "Não tem acesso a esta entidade.");
    else if (!(e instanceof ErroApi && e.estado === 401))
      mostrarErro(
        conteudo,
        "Não foi possível carregar os horários. Tente novamente daqui a pouco.",
      );
  }
}

function preencherSeletor(lista: EntidadeLista[], escolhida: string): void {
  const termo = filtro.value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const visiveis = lista.filter(
    (e) =>
      e.id === escolhida ||
      e.nome
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(termo),
  );
  seletor.replaceChildren(
    ...visiveis.map((e) => h("option", { value: e.id, selected: e.id === escolhida }, e.nome)),
  );
}

async function iniciar(): Promise<void> {
  let eu: Eu;
  let lista: EntidadeLista[];
  try {
    eu = await carregarEu();
    lista = await api<EntidadeLista[]>("/api/entidades");
  } catch (e) {
    if (!(e instanceof ErroApi && (e.estado === 401 || e.estado === 403)))
      mostrarErro(conteudo, "Não foi possível abrir o painel.");
    return;
  }
  if (lista.length === 0) {
    conteudo.replaceChildren(
      h(
        "p",
        {},
        "Ainda não tem nenhuma entidade associada. Fale com a secretaria do Arciprestado.",
      ),
    );
    return;
  }
  const pedida = new URLSearchParams(location.search).get("entidade");
  const guardada = (() => {
    try {
      return localStorage.getItem("painel.entidade");
    } catch {
      return null;
    }
  })();
  const inicial = [pedida, guardada, eu.entidades[0]?.id, lista[0]?.id].find(
    (id) => id && lista.some((e) => e.id === id),
  ) as string;

  if (lista.length > 1) {
    escolha.hidden = false;
    caixaFiltro.hidden = eu.perfil !== "admin";
    preencherSeletor(lista, inicial);
    filtro.addEventListener("input", () => preencherSeletor(lista, seletor.value));
    seletor.addEventListener("change", () => {
      const id = seletor.value;
      try {
        localStorage.setItem("painel.entidade", id);
      } catch {
        /* sem armazenamento local */
      }
      history.replaceState(null, "", `?entidade=${encodeURIComponent(id)}`);
      void mostrarEntidade(id);
    });
  }
  await mostrarEntidade(inicial);
}

void iniciar();
