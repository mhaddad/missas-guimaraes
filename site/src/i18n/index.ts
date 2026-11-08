/**
 * Textos da interface (§6.8). O pt-PT é a referência: os outros idiomas têm de ter as mesmas
 * chaves (verificado pelo tipo e por um teste).
 */
import en from "./en.json";
import es from "./es.json";
import ptPT from "./pt-PT.json";

export type Textos = typeof ptPT;
export type Idioma = "pt-PT" | "en" | "es";
export type Plural = { one: string; other: string };
export type TipoEntidade = keyof Textos["pelaEntidade"];

export const TEXTOS: Record<Idioma, Textos> = { "pt-PT": ptPT, en, es };
export const IDIOMAS: readonly Idioma[] = ["pt-PT", "en", "es"];

/** Substitui `{chave}` pelos valores. */
export function formatar(modelo: string, valores: Record<string, string | number> = {}): string {
  return modelo.replace(/\{(\w+)\}/g, (_m, chave: string) =>
    chave in valores ? String(valores[chave]) : `{${chave}}`,
  );
}

const REGRAS_PLURAL = new Map<Idioma, Intl.PluralRules>();

export function plural(idioma: Idioma, formas: Plural, n: number): string {
  let regras = REGRAS_PLURAL.get(idioma);
  if (!regras) {
    regras = new Intl.PluralRules(idioma);
    REGRAS_PLURAL.set(idioma, regras);
  }
  return formatar(regras.select(n) === "one" ? formas.one : formas.other, { n });
}
