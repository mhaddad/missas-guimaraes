/** Formatação de datas e horas no idioma escolhido, sempre no fuso de Lisboa (§6.8). */
import { FUSO_HORARIO } from "@missas/horarios";
import type { Idioma } from "../i18n/index.ts";

const cache = new Map<string, Intl.DateTimeFormat>();

function formato(idioma: Idioma, opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chave = `${idioma}|${JSON.stringify(opcoes)}`;
  let f = cache.get(chave);
  if (!f) {
    // As datas civis (AAAA-MM-DD) são formatadas ao meio-dia UTC: o dia é o mesmo em Lisboa.
    f = new Intl.DateTimeFormat(idioma, { timeZone: FUSO_HORARIO, ...opcoes });
    cache.set(chave, f);
  }
  return f;
}

const meioDia = (data: string) => new Date(`${data}T12:00:00Z`);

/** "8 de dezembro de 2026" */
export function formatarDataLonga(data: string, idioma: Idioma): string {
  return formato(idioma, { day: "numeric", month: "long", year: "numeric" }).format(meioDia(data));
}

/** "terça-feira, 8 de dezembro" */
export function formatarDiaDaSemanaEData(data: string, idioma: Idioma): string {
  return formato(idioma, { weekday: "long", day: "numeric", month: "long" }).format(meioDia(data));
}

/** "8 de dezembro" */
export function formatarDiaEMes(data: string, idioma: Idioma): string {
  return formato(idioma, { day: "numeric", month: "long" }).format(meioDia(data));
}

const DIAS_CURTOS: Record<Idioma, readonly string[]> = {
  "pt-PT": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

/** "Dom" / "Sun" / "Dom" (abreviaturas próprias: o `Intl` dá "domingo" em pt-PT). */
export function formatarDiaCurto(data: string, idioma: Idioma): string {
  return DIAS_CURTOS[idioma][meioDia(data).getUTCDay()] ?? "";
}

/** "15 nov." */
export function formatarDataCurta(data: string, idioma: Idioma): string {
  return formato(idioma, { day: "numeric", month: "short" }).format(meioDia(data));
}
