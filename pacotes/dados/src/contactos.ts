/**
 * Contactos públicos de uma entidade (responsáveis, telefones, e-mail, site) e textos da morada
 * de um local, editados no painel. REVISÃO DE SEGURANÇA OBRIGATÓRIA: estes textos aparecem no
 * site público (incluindo em `href`), por isso o Worker só grava a forma canónica que o painel
 * produz (`problemaNosContactos`, `problemaNaMorada`). Módulo leve: corre também no navegador.
 */
import { iguais, type Entidade, type Local } from "@missas/horarios";
import { umaLinha, type ResumoLocal } from "./resumo.ts";

export interface ContactosPublicos {
  responsaveis: string[];
  telefones_publicos: string[];
  email: string | null;
  site: string | null;
}

/** Os únicos campos da entidade que um pedido `contactos` muda. */
export const CAMPOS_CONTACTOS = ["responsaveis", "telefones_publicos", "email", "site"] as const;

export const LIMITES_CONTACTOS = {
  responsaveis: 6,
  telefones: 4,
  texto: 120,
  email: 120,
  site: 200,
  notas: 10,
  nota: 500,
  morada: 200,
} as const;

// Caracteres de controlo e quebras de linha (os textos ficam numa linha só).
// eslint-disable-next-line no-control-regex
const CONTROLO = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const TELEFONE = /^[29]\d{2} \d{3} \d{3}$/;

export function contactosDe(e: Entidade): ContactosPublicos {
  return {
    responsaveis: e.responsaveis ?? [],
    telefones_publicos: e.telefones_publicos ?? [],
    email: e.email ?? null,
    site: e.site ?? null,
  };
}

/** Telefone português (fixo ou móvel) na forma `253 123 456`; `null` se não for um. */
export function normalizarTelefone(texto: string): string | null {
  const digitos = texto.replace(/[\s.()-]/g, "").replace(/^(\+|00)351/, "");
  if (!/^[29]\d{8}$/.test(digitos)) return null;
  return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
}

/** E-mail em minúsculas, sem espaços; `null` se não for um. */
export function normalizarEmail(texto: string): string | null {
  const email = texto.trim().toLowerCase();
  return email.length <= LIMITES_CONTACTOS.email && EMAIL.test(email) ? email : null;
}

/** Endereço do site (http ou https; sem protocolo, assume https); `null` se não for um. */
export function normalizarSite(texto: string): string | null {
  const bruto = texto.trim();
  if (!bruto || /[\s"'<>`\\]/.test(bruto)) return null;
  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  let url: URL;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  const site = url.toString();
  return site.length <= LIMITES_CONTACTOS.site ? site : null;
}

const textoValido = (t: unknown, maximo: number, minimo = 1): t is string =>
  typeof t === "string" &&
  t === t.trim() &&
  t.length >= minimo &&
  t.length <= maximo &&
  !CONTROLO.test(t) &&
  !/\s{2}/.test(t);

/** Porque é que estes contactos não podem ser gravados (`null` se podem). Só a forma canónica. */
export function problemaNosContactos(c: ContactosPublicos): string | null {
  const { responsaveis, telefones_publicos: telefones, email, site } = c;
  if (!Array.isArray(responsaveis) || responsaveis.length > LIMITES_CONTACTOS.responsaveis)
    return `no máximo ${LIMITES_CONTACTOS.responsaveis} responsáveis`;
  if (!responsaveis.every((r) => textoValido(r, LIMITES_CONTACTOS.texto, 2)))
    return "nome de responsável inválido";
  if (new Set(responsaveis).size !== responsaveis.length) return "responsável repetido";
  if (!Array.isArray(telefones) || telefones.length > LIMITES_CONTACTOS.telefones)
    return `no máximo ${LIMITES_CONTACTOS.telefones} telefones`;
  if (!telefones.every((t) => typeof t === "string" && TELEFONE.test(t)))
    return "telefone inválido";
  if (new Set(telefones).size !== telefones.length) return "telefone repetido";
  if (email !== null && (typeof email !== "string" || normalizarEmail(email) !== email))
    return "e-mail inválido";
  if (site !== null && (typeof site !== "string" || normalizarSite(site) !== site))
    return "site inválido";
  return null;
}

/** Campos de texto da morada de um local que o painel edita. */
export const CAMPOS_MORADA = ["morada", "localidade", "freguesia"] as const;

/**
 * Porque é que a morada e as notas de um local não podem ser gravadas (`null` se podem). Só se
 * verifica o que mudou (os dados antigos não ficam presos por regras novas).
 */
export function problemaNaMorada(antes: Local, depois: Local): string | null {
  const a = antes as unknown as Record<string, unknown>;
  const d = depois as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_MORADA)
    if (!iguais(a[campo] ?? null, d[campo] ?? null)) {
      const valor = d[campo] ?? null;
      if (valor !== null && !textoValido(valor, LIMITES_CONTACTOS.morada))
        return `${campo} inválido`;
    }
  if (!iguais(antes.notas ?? [], depois.notas ?? [])) {
    const notas = depois.notas ?? [];
    if (notas.length > LIMITES_CONTACTOS.notas)
      return `no máximo ${LIMITES_CONTACTOS.notas} notas`;
    if (!notas.every((n) => textoValido(n, LIMITES_CONTACTOS.nota)))
      return "nota inválida";
  }
  return null;
}

const lista = (l: readonly string[]) => (l.length ? l.join(", ") : "—");
const valor = (v: string | null) => v ?? "—";

/** Resumo de uma mudança de contactos, com o id da entidade (como nos resumos dos locais). */
export function resumirContactos(
  entidade: string,
  antes: ContactosPublicos,
  depois: ContactosPublicos,
): ResumoLocal[] {
  const linhas: string[] = [];
  if (!iguais(antes.responsaveis, depois.responsaveis))
    linhas.push(`👤 Responsáveis: ${lista(antes.responsaveis)} → ${lista(depois.responsaveis)}`);
  if (!iguais(antes.telefones_publicos, depois.telefones_publicos))
    linhas.push(
      `📞 Telefones: ${lista(antes.telefones_publicos)} → ${lista(depois.telefones_publicos)}`,
    );
  if (antes.email !== depois.email)
    linhas.push(`✉️ E-mail: ${valor(antes.email)} → ${valor(depois.email)}`);
  if (antes.site !== depois.site)
    linhas.push(`🌐 Site: ${valor(antes.site)} → ${valor(depois.site)}`);
  return linhas.length ? [{ local: entidade, linhas: linhas.map(umaLinha) }] : [];
}
