/**
 * Formato canónico dos YAML de dados/ (§8.3, item 7; E1.8). O painel (via GitHub Actions) e a
 * edição manual escrevem da mesma forma, para que os diffs mostrem só o que mudou:
 * - chaves pela ordem do esquema (`dados/schema/*.schema.json`);
 * - listas em bloco sem indentação extra (`- tipo: missa`);
 * - listas de valores de uma regra em linha (`dias: [sab]`, `semanas_do_mes: [2, 4]`);
 * - cada exceção numa linha (`- {data: '2026-12-25', acao: adicionar, hora: '00:00'}`);
 * - horas e datas sempre entre plicas (`'09:00'`, `'2026-11-08'`);
 * - comentários preservados.
 */
import {
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
  type Document,
  type Node,
  type YAMLMap,
} from "yaml";
import { chaveCanonica, iguais } from "@missas/horarios";

export type TipoArquivo = "local" | "entidade" | "calendario";

export const ORDEM_LOCAL = [
  "id",
  "tipo",
  "entidade",
  "concelho",
  "nome",
  "orago",
  "localidade",
  "freguesia",
  "morada",
  "codigo_postal",
  "geo",
  "publicar",
  "dias_santos",
  "acessibilidade",
  "horarios",
  "excecoes",
  "notas",
  "notas_i18n",
  "confirmado_em",
  "confirmado_por",
  "revisao",
] as const;

export const ORDEM_REGRA = [
  "tipo",
  "dias",
  "hora",
  "hora_fim",
  "epoca",
  "semanas_do_mes",
  "meses",
  "quinzenal",
  "validade",
  "idioma",
  "nota",
  "nota_i18n",
] as const;

export const ORDEM_EXCECAO = ["data", "acao", "tipo", "hora_original", "hora", "hora_fim", "idioma", "nota"] as const;

export const ORDEM_ENTIDADE = [
  "id",
  "tipo",
  "nome",
  "orago",
  "arciprestado",
  "diocese",
  "responsaveis",
  "telefones_publicos",
  "email",
  "site",
  "locais",
] as const;

const ORDENS_INTERNAS: Record<string, readonly string[]> = {
  geo: ["lat", "lon"],
  validade: ["de", "ate"],
  notas_i18n: ["en", "es"],
  nota_i18n: ["en", "es"],
  confirmado_por: ["canal", "ref"],
  revisao: ["pendente", "motivos"],
};

/** Chaves cujo valor é sempre uma hora ou data entre plicas. */
const CHAVES_ENTRE_PLICAS = new Set([
  "hora",
  "hora_fim",
  "hora_original",
  "data",
  "de",
  "ate",
  "referencia",
  "confirmado_em",
]);

const LISTAS_EM_LINHA = new Set(["dias", "semanas_do_mes", "meses"]);

const OPCOES_ESCRITA = {
  indentSeq: false,
  lineWidth: 0,
  minContentWidth: 0,
  flowCollectionPadding: false,
  singleQuote: true,
} as const;

function chaveDe(par: { key: unknown }): string {
  const k = par.key;
  return isScalar(k) ? String(k.value) : String(k);
}

/** Ordena as chaves de um mapa; as desconhecidas ficam no fim, pela ordem em que estavam. */
function ordenar(mapa: YAMLMap, ordem: readonly string[]): void {
  const posicao = (par: { key: unknown }) => {
    const i = ordem.indexOf(chaveDe(par));
    return i === -1 ? ordem.length : i;
  };
  const indexados = mapa.items.map((par, i) => ({ par, i }));
  indexados.sort((a, b) => posicao(a.par) - posicao(b.par) || a.i - b.i);
  mapa.items = indexados.map((x) => x.par);
}

function plicas(no: unknown): void {
  if (isScalar(no) && typeof no.value === "string") no.type = Scalar.QUOTE_SINGLE;
}

function canonizarValor(chave: string, valor: unknown): void {
  if (CHAVES_ENTRE_PLICAS.has(chave)) plicas(valor);
  if (isMap(valor)) {
    const ordem = ORDENS_INTERNAS[chave];
    if (ordem) ordenar(valor, ordem);
    valor.flow = false;
    for (const par of valor.items) canonizarValor(chaveDe(par), par.value);
  } else if (isSeq(valor)) {
    valor.flow = LISTAS_EM_LINHA.has(chave) || valor.items.length === 0;
    for (const item of valor.items) {
      if (isScalar(item) && typeof item.value === "string" && item.type === Scalar.QUOTE_DOUBLE) {
        // Prefere plicas; o `yaml` volta a aspas se o texto o exigir.
        item.type = Scalar.QUOTE_SINGLE;
      }
    }
  }
}

function canonizarRegra(regra: unknown): void {
  if (!isMap(regra)) return;
  regra.flow = false;
  ordenar(regra, ORDEM_REGRA);
  for (const par of regra.items) canonizarValor(chaveDe(par), par.value);
}

function canonizarExcecao(excecao: unknown): void {
  if (!isMap(excecao)) return;
  ordenar(excecao, ORDEM_EXCECAO);
  for (const par of excecao.items) {
    const chave = chaveDe(par);
    if (CHAVES_ENTRE_PLICAS.has(chave)) plicas(par.value);
  }
  excecao.flow = true;
}

function canonizarDocumento(doc: Document, tipo: TipoArquivo): void {
  const raiz = doc.contents;
  if (tipo === "calendario" || !isMap(raiz)) return;
  ordenar(raiz, tipo === "local" ? ORDEM_LOCAL : ORDEM_ENTIDADE);
  for (const par of raiz.items) {
    const chave = chaveDe(par);
    const valor = par.value;
    if (chave === "horarios" && isSeq(valor)) {
      valor.flow = valor.items.length === 0;
      valor.items.forEach(canonizarRegra);
    } else if (chave === "excecoes" && isSeq(valor)) {
      valor.flow = valor.items.length === 0;
      valor.items.forEach(canonizarExcecao);
    } else {
      canonizarValor(chave, valor);
    }
  }
}

function tipoPeloCaminho(caminho: string): TipoArquivo {
  if (caminho.includes("/locais/")) return "local";
  if (caminho.includes("/entidades/")) return "entidade";
  return "calendario";
}

function texto(doc: Document): string {
  if (doc.errors.length > 0) throw doc.errors[0];
  return doc.toString(OPCOES_ESCRITA);
}

/** Reescreve um YAML no formato canónico, sem mudar os dados nem os comentários. */
export function formatar(conteudo: string, tipoOuCaminho: TipoArquivo | string): string {
  const tipo =
    tipoOuCaminho === "local" || tipoOuCaminho === "entidade" || tipoOuCaminho === "calendario"
      ? tipoOuCaminho
      : tipoPeloCaminho(tipoOuCaminho);
  const doc = parseDocument(conteudo);
  if (doc.errors.length > 0) throw doc.errors[0];
  canonizarDocumento(doc, tipo);
  return texto(doc);
}

/**
 * Novo nó para `valor`. Numa lista, os itens que não mudaram reaproveitam o nó antigo, com os
 * seus comentários; só os itens novos ou alterados são criados de novo.
 */
function noPara(doc: Document, valor: unknown, atual: Node | undefined): Node {
  if (isSeq(atual) && Array.isArray(valor)) {
    const antigos = atual.items.map((no) => ({
      no,
      chave: chaveCanonica(isNode(no) ? no.toJSON() : no),
      usado: false,
    }));
    atual.items = valor.map((item: unknown) => {
      const chave = chaveCanonica(item);
      const par = antigos.find((a) => !a.usado && a.chave === chave);
      if (par) {
        par.usado = true;
        return par.no;
      }
      return doc.createNode(item);
    });
    return atual;
  }
  const no = doc.createNode(valor) as Node;
  if (atual?.commentBefore) no.commentBefore = atual.commentBefore;
  if (atual?.comment) no.comment = atual.comment;
  return no;
}

/**
 * Escreve um objeto (local ou entidade) no formato canónico. Com `original`, mantém os
 * comentários e os nós que não mudaram (também regra a regra, nas listas); só os valores
 * alterados são reescritos.
 */
export function serializar(dados: object, tipo: Exclude<TipoArquivo, "calendario">, original?: string): string {
  const doc: Document = parseDocument(original ?? "{}");
  if (doc.errors.length > 0) throw doc.errors[0];
  let mapa: YAMLMap;
  if (isMap(doc.contents)) {
    mapa = doc.contents;
  } else {
    mapa = doc.createNode({}) as YAMLMap;
    doc.contents = mapa;
  }
  const novos = dados as Record<string, unknown>;
  mapa.items = mapa.items.filter((par) => chaveDe(par) in novos && novos[chaveDe(par)] !== undefined);
  for (const [chave, valor] of Object.entries(novos)) {
    if (valor === undefined) continue;
    const atual = mapa.get(chave, true) as Node | undefined;
    if (atual !== undefined && iguais(atual.toJSON(), valor)) continue;
    mapa.set(chave, noPara(doc, valor, atual));
  }
  canonizarDocumento(doc, tipo);
  return texto(doc);
}
