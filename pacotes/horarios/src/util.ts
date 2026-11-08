import type { TipoCelebracao } from "./modelo.gerado.ts";

/** Ordem de apresentação dos tipos de celebração. */
export const ORDEM_TIPOS: readonly TipoCelebracao[] = [
  "missa",
  "confissoes",
  "adoracao",
  "terco",
  "outro",
];

/** JSON com as chaves ordenadas: igualdade estrutural que não depende da ordem das chaves. */
export function chaveCanonica(valor: unknown): string {
  return JSON.stringify(valor, (_chave, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return v;
  });
}

export function iguais(a: unknown, b: unknown): boolean {
  return chaveCanonica(a) === chaveCanonica(b);
}
