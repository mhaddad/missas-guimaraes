/**
 * Formato do pedido enviado ao GitHub Actions (Anexo B) e a sua assinatura HMAC (§8.4).
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA (assinatura e caminhos).
 *
 * O mesmo código corre no Worker (que monta e assina) e no Node (`scripts/aplicar-pedido.ts`,
 * que verifica). Só usa WebCrypto, `btoa`/`atob` e `TextEncoder`, disponíveis nos dois.
 *
 * A assinatura é `HMAC-SHA256(PEDIDO_HMAC, pedido_em_base64)` em hexadecimal: assina-se o texto
 * exato que viaja no input do workflow, antes de qualquer interpretação.
 */

export type TipoPedido = "confirmacao" | "alteracao" | "novo-local" | "restauro";
export type CanalPedido = "painel" | "email";
export type FuncaoContacto = "paroco" | "secretaria" | "colaborador" | "equipa";

export interface ResumoLocal {
  /** Id do local. */
  local: string;
  /** Linhas de `resumirAlteracoes` do motor, pela ordem do diff. */
  linhas: string[];
}

export interface Pedido {
  versao: 1;
  /** `p_` + 12 a 32 hexadecimais; vai para o commit como *trailer* `Pedido:`. */
  id: string;
  tipo: TipoPedido;
  /** Instante ISO 8601 em UTC (`…Z`); o pedido vale 15 minutos. */
  emitido_em: string;
  /** Só o id opaco e a função, nunca o nome nem o e-mail. */
  contacto: { ref: string; funcao: FuncaoContacto };
  canal: CanalPedido;
  entidade: string;
  /** SHA do blob do Git de cada arquivo tocado, na versão que o painel carregou (`null` = novo). */
  base: Record<string, string | null>;
  /** Estado completo de cada arquivo depois da alteração. Omitido em `confirmacao`. */
  arquivos?: Record<string, Record<string, unknown>>;
  resumo: ResumoLocal[];
  /** Só em `restauro`: o commit cuja versão se repõe. */
  restaura?: string;
}

const TIPOS: readonly TipoPedido[] = ["confirmacao", "alteracao", "novo-local", "restauro"];
const CANAIS: readonly CanalPedido[] = ["painel", "email"];
const FUNCOES: readonly FuncaoContacto[] = ["paroco", "secretaria", "colaborador", "equipa"];

export const PADRAO_ID_PEDIDO = /^p_[0-9a-f]{12,32}$/;
const PADRAO_ID_CONTACTO = /^c_[0-9a-f]{4,32}$/;
const PADRAO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Só arquivos de dados das entidades e dos locais: nada de `..`, barras extra ou outras pastas. */
export const PADRAO_CAMINHO = /^dados\/(locais|entidades)\/[a-z0-9]+(-[a-z0-9]+)*\.yml$/;
const PADRAO_SHA = /^[0-9a-f]{40}$/;
const PADRAO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const MAX_ARQUIVOS = 50;

/** Duração de um pedido assinado (§8.4, passo 1). */
export const VALIDADE_PEDIDO_MS = 15 * 60 * 1000;
/** Tolerância para relógios adiantados. */
export const FOLGA_RELOGIO_MS = 60 * 1000;

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function soChaves(valor: Record<string, unknown>, permitidas: readonly string[]): boolean {
  return Object.keys(valor).every((k) => permitidas.includes(k));
}

/**
 * Lê e valida a estrutura de um pedido já descodificado. Devolve o pedido ou o motivo da recusa.
 * Não verifica o conteúdo dos arquivos (isso é `prepararPedido`, com o repositório à vista).
 */
export function lerPedido(valor: unknown): Pedido | string {
  if (!objeto(valor)) return "pedido: não é um objeto";
  const p = valor;
  if (
    !soChaves(p, [
      "versao",
      "id",
      "tipo",
      "emitido_em",
      "contacto",
      "canal",
      "entidade",
      "base",
      "arquivos",
      "resumo",
      "restaura",
    ])
  )
    return "pedido: campos desconhecidos";
  if (p.versao !== 1) return "versao";
  if (typeof p.id !== "string" || !PADRAO_ID_PEDIDO.test(p.id)) return "id";
  if (!TIPOS.includes(p.tipo as TipoPedido)) return "tipo";
  if (
    typeof p.emitido_em !== "string" ||
    !PADRAO_INSTANTE.test(p.emitido_em) ||
    Number.isNaN(Date.parse(p.emitido_em))
  )
    return "emitido_em";
  const c = p.contacto;
  if (
    !objeto(c) ||
    !soChaves(c, ["ref", "funcao"]) ||
    typeof c.ref !== "string" ||
    !PADRAO_ID_CONTACTO.test(c.ref) ||
    !FUNCOES.includes(c.funcao as FuncaoContacto)
  )
    return "contacto";
  if (!CANAIS.includes(p.canal as CanalPedido)) return "canal";
  if (typeof p.entidade !== "string" || !PADRAO_ID.test(p.entidade)) return "entidade";

  if (!objeto(p.base)) return "base";
  const base = Object.entries(p.base);
  if (base.length > MAX_ARQUIVOS) return "base";
  for (const [caminho, sha] of base) {
    if (!PADRAO_CAMINHO.test(caminho)) return `base: caminho inválido`;
    if (sha !== null && (typeof sha !== "string" || !PADRAO_SHA.test(sha))) return "base: sha";
  }

  if (p.tipo === "confirmacao") {
    if (p.arquivos !== undefined) return "arquivos: uma confirmação não traz arquivos";
  } else {
    if (!objeto(p.arquivos)) return "arquivos";
    const arquivos = Object.entries(p.arquivos);
    if (arquivos.length === 0 || arquivos.length > MAX_ARQUIVOS) return "arquivos";
    for (const [caminho, conteudo] of arquivos) {
      if (!PADRAO_CAMINHO.test(caminho)) return "arquivos: caminho inválido";
      if (!objeto(conteudo)) return "arquivos: conteúdo";
      if (!(caminho in p.base)) return "base: falta o sha de um arquivo";
    }
  }

  if (!Array.isArray(p.resumo) || p.resumo.length > MAX_ARQUIVOS) return "resumo";
  for (const r of p.resumo) {
    if (
      !objeto(r) ||
      !soChaves(r, ["local", "linhas"]) ||
      typeof r.local !== "string" ||
      !PADRAO_ID.test(r.local) ||
      !Array.isArray(r.linhas) ||
      !r.linhas.every((l) => typeof l === "string")
    )
      return "resumo";
  }

  if (p.tipo === "restauro") {
    if (typeof p.restaura !== "string" || !PADRAO_SHA.test(p.restaura)) return "restaura";
  } else if (p.restaura !== undefined) return "restaura: só em restauros";

  return p as unknown as Pedido;
}

/** O pedido vale de `emitido_em` até 15 minutos depois (com 1 minuto de folga para trás). */
export function pedidoDentroDoPrazo(pedido: Pedido, agora: Date): boolean {
  const emitido = Date.parse(pedido.emitido_em);
  const t = agora.getTime();
  return emitido - FOLGA_RELOGIO_MS <= t && t <= emitido + VALIDADE_PEDIDO_MS;
}

// ── base64 (UTF-8) ──────────────────────────────────────────────────────────────────────────

export function codificarPedido(pedido: Pedido): string {
  const bytes = new TextEncoder().encode(JSON.stringify(pedido));
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

/** Devolve o JSON descodificado (ainda por validar com `lerPedido`), ou `null`. */
export function descodificarPedido(base64: string): unknown {
  try {
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

// ── HMAC-SHA256 ─────────────────────────────────────────────────────────────────────────────

/** Tamanho mínimo do segredo partilhado (32 bytes em hexadecimal ou base64 dão ≥ 43 caracteres). */
export const TAMANHO_MINIMO_SEGREDO = 32;

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) throw new Error("segredo HMAC demasiado curto");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function assinar(segredo: string, texto: string): Promise<string> {
  const chave = await chaveHmac(segredo);
  return hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(texto)));
}

/** Comparação em tempo constante (o próprio `verify` do WebCrypto). Nunca lança. */
export async function verificarAssinatura(
  segredo: string,
  texto: string,
  assinatura: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(assinatura)) return false;
  try {
    const chave = await chaveHmac(segredo);
    const bytes = Uint8Array.from(assinatura.match(/../g) ?? [], (h) => parseInt(h, 16));
    return await crypto.subtle.verify("HMAC", chave, bytes, new TextEncoder().encode(texto));
  } catch {
    return false;
  }
}

// ── SHA do blob do Git ──────────────────────────────────────────────────────────────────────

/** O mesmo valor que `git hash-object` e que o `sha` da API de conteúdos do GitHub. */
export async function shaBlob(conteudo: string): Promise<string> {
  const corpo = new TextEncoder().encode(conteudo);
  const cabecalho = new TextEncoder().encode(`blob ${corpo.length}\0`);
  const tudo = new Uint8Array(cabecalho.length + corpo.length);
  tudo.set(cabecalho);
  tudo.set(corpo, cabecalho.length);
  return hex(await crypto.subtle.digest("SHA-1", tudo));
}

/** Novo id de pedido: `p_` + 16 hexadecimais aleatórios. */
export function novoIdPedido(): string {
  return `p_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
