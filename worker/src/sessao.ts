/**
 * Sessões do painel (ADR-005). REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 * O cookie `__Host-sessao` leva 32 bytes aleatórios; no D1 fica só o SHA-256 desse valor, por
 * isso não há chave de assinatura nem nada que roubar na base. A sessão dura 14 dias e só vale
 * enquanto o contacto puder entrar (ativo ou sem lembretes).
 */
import { obterContacto, podeEntrar, type Contacto } from "./contactos.ts";

export const COOKIE_SESSAO = "__Host-sessao";
export const DURACAO_SESSAO_MS = 14 * 24 * 60 * 60 * 1000;

export function base64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function aleatorio(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(texto: string): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valor de um cookie no cabeçalho `Cookie`. */
export function lerCookie(cabecalho: string | null, nome: string): string | null {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function cookieSessao(valor: string, maxIdadeS: number): string {
  return `${COOKIE_SESSAO}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxIdadeS}`;
}

export async function criarSessao(
  bd: D1Database,
  contactoId: string,
  agora = new Date(),
): Promise<string> {
  const token = aleatorio();
  await bd.batch([
    // Limpeza oportunista das sessões e entradas já expiradas.
    bd.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(agora.toISOString()),
    bd.prepare("DELETE FROM entradas WHERE expira_em < ?").bind(agora.toISOString()),
    bd
      .prepare("INSERT INTO sessoes (id, contacto_id, criada_em, expira_em) VALUES (?, ?, ?, ?)")
      .bind(
        await sha256Hex(token),
        contactoId,
        agora.toISOString(),
        new Date(agora.getTime() + DURACAO_SESSAO_MS).toISOString(),
      ),
  ]);
  return token;
}

/** O contacto da sessão do pedido, ou `null` (sem cookie, expirada, apagada ou suspenso). */
export async function lerSessao(
  bd: D1Database,
  pedido: Request,
  agora = new Date(),
): Promise<Contacto | null> {
  const token = lerCookie(pedido.headers.get("cookie"), COOKIE_SESSAO);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sessao = await bd
    .prepare("SELECT contacto_id, expira_em FROM sessoes WHERE id = ?")
    .bind(await sha256Hex(token))
    .first<{ contacto_id: string; expira_em: string }>();
  if (!sessao || sessao.expira_em <= agora.toISOString()) return null;
  const contacto = await obterContacto(bd, sessao.contacto_id);
  return contacto && podeEntrar(contacto) ? contacto : null;
}

export async function terminarSessao(bd: D1Database, pedido: Request): Promise<void> {
  const token = lerCookie(pedido.headers.get("cookie"), COOKIE_SESSAO);
  if (token)
    await bd
      .prepare("DELETE FROM sessoes WHERE id = ?")
      .bind(await sha256Hex(token))
      .run();
}
