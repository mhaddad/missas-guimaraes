/**
 * Cache das páginas públicas (ADR-005 §3): a inicial, a lista, a de cada paróquia e os fragmentos.
 * Gerar uma página (Astro + D1) é o trabalho mais pesado do Worker; com a cache, gera-se no
 * máximo uma vez por página, por dia, por versão dos dados e por versão do código. A chave muda sozinha a cada gravação (`versao_dados`), à
 * meia-noite de Lisboa e a cada deploy (a página aponta para CSS e JS com nomes do build: uma
 * cópia de outro deploy ficaria sem estilos). Nunca é preciso apagar nada à mão. Primeiro em
 * memória (por isolado), depois no D1.
 */
import { momentoEmLisboa } from "@missas/horarios";
import { versaoDados } from "./bd.ts";

/** As páginas fixas que vão para a cache. */
export const PAGINAS_PUBLICAS = new Set([
  "/",
  "/en/",
  "/es/",
  "/paroquias/",
  "/en/paroquias/",
  "/es/paroquias/",
]);
const ID = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** Página de cada paróquia (`/paroquia/<id>/`, também em /en/ e /es/). */
const PAROQUIA = new RegExp(`^/(?:(?:en|es)/)?paroquia/${ID}/$`);
/** Detalhe de uma igreja, pedido ao abrir um cartão. */
const FRAGMENTO = new RegExp(`^/fragmentos/(?:pt-PT|en|es)/${ID}/$`);

/**
 * Se a página vai para a cache: as fixas, a de cada paróquia e os fragmentos. Uma paróquia que
 * não existe dá 404, que nunca se guarda (ver `site/src/worker.ts`).
 */
export function ePaginaPublica(caminho: string): boolean {
  return PAGINAS_PUBLICAS.has(caminho) || PAROQUIA.test(caminho) || FRAGMENTO.test(caminho);
}

/** Em memória ficam as mais pedidas; as outras vêm do D1 (uma leitura, sem gerar a página). */
const MAXIMO_EM_MEMORIA = 64;
const memoria = new Map<string, string>();

export async function chavePagina(
  bd: D1Database,
  caminho: string,
  versaoCodigo: string,
  agora = new Date(),
) {
  return `${caminho}|${momentoEmLisboa(agora).data}|v${await versaoDados(bd)}|${versaoCodigo}`;
}

export async function obterPagina(bd: D1Database, chave: string): Promise<string | null> {
  const local = memoria.get(chave);
  if (local !== undefined) return local;
  const guardada = await bd
    .prepare("SELECT conteudo FROM paginas WHERE chave = ?")
    .bind(chave)
    .first<string>("conteudo");
  if (guardada !== null) lembrar(chave, guardada);
  return guardada;
}

export async function guardarPagina(
  bd: D1Database,
  chave: string,
  conteudo: string,
  agora = new Date(),
): Promise<void> {
  lembrar(chave, conteudo);
  const ontem = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await bd.batch([
    bd.prepare("DELETE FROM paginas WHERE criada_em < ?").bind(ontem),
    bd
      .prepare("INSERT OR REPLACE INTO paginas (chave, conteudo, criada_em) VALUES (?, ?, ?)")
      .bind(chave, conteudo, agora.toISOString()),
  ]);
}

function lembrar(chave: string, conteudo: string): void {
  memoria.set(chave, conteudo);
  while (memoria.size > MAXIMO_EM_MEMORIA) memoria.delete(memoria.keys().next().value as string);
}

/** Só para testes. */
export function esquecerPaginas(): void {
  memoria.clear();
}
