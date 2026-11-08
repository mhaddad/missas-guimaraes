/**
 * Datas civis (`AAAA-MM-DD`) e horas (`HH:MM`) sem fuso, sempre interpretadas em Europe/Lisbon.
 *
 * O motor não usa `Date` para datas civis nem a hora local do sistema: a aritmética é feita
 * sobre "dias desde 1970-01-01" (calendário gregoriano proléptico), o que é igual em qualquer
 * fuso. O único ponto onde entra um instante real é `momentoEmLisboa`, que usa `Intl` com o
 * fuso explícito. Assim o resultado é o mesmo no navegador de um turista, no Worker e na CI
 * (§5.2, C17). Não depende de `Temporal`, que ainda não existe em todos os navegadores.
 */
import type { Dia } from "./modelo.gerado.ts";

export const FUSO_HORARIO = "Europe/Lisbon";

/** Data civil no formato `AAAA-MM-DD`. */
export type Data = string;
/** Hora no formato `HH:MM` (00:00–23:59). */
export type HoraTexto = string;

export type DiaDaSemana = Exclude<Dia, "santo">;

/** Ordem de `getUTCDay()`: 0 = domingo. */
const DIAS_UTC: readonly DiaDaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** Ordem de apresentação: segunda a domingo. */
export const DIAS_DA_SEMANA: readonly DiaDaSemana[] = [
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
  "dom",
];

const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PADRAO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_POR_DIA = 86_400_000;

export function eDataValida(texto: string): boolean {
  const m = PADRAO_DATA.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

export function eHoraValida(texto: string): boolean {
  return PADRAO_HORA.test(texto);
}

export function partesDaData(data: Data): { ano: number; mes: number; dia: number } {
  const m = PADRAO_DATA.exec(data);
  if (!m) throw new RangeError(`Data inválida: ${data}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function criarData(ano: number, mes: number, dia: number): Data {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Número de dias desde 1970-01-01. */
export function paraDias(data: Data): number {
  const { ano, mes, dia } = partesDaData(data);
  return Math.round(Date.UTC(ano, mes - 1, dia) / MS_POR_DIA);
}

export function deDias(dias: number): Data {
  const d = new Date(dias * MS_POR_DIA);
  return criarData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function somarDias(data: Data, n: number): Data {
  return deDias(paraDias(data) + n);
}

export function diferencaEmDias(a: Data, b: Data): number {
  return paraDias(a) - paraDias(b);
}

export function diaDaSemana(data: Data): DiaDaSemana {
  const indice = ((paraDias(data) % 7) + 7 + 4) % 7; // 1970-01-01 foi quinta-feira
  return DIAS_UTC[indice] as DiaDaSemana;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Ocorrências do dia da semana no mês (§5.2): `ceil(dia/7)` e, se for a última, também `-1`.
 * Ex.: 2026-11-28 (4.º e último sábado) → [4, -1].
 */
export function semanasDoMes(data: Data): number[] {
  const { ano, mes, dia } = partesDaData(data);
  const semanas = [Math.ceil(dia / 7)];
  if (dia + 7 > diasNoMes(ano, mes)) semanas.push(-1);
  return semanas;
}

/** Último dia da semana indicado num mês (ex.: último domingo de março). */
export function ultimoDiaDaSemanaDoMes(ano: number, mes: number, alvo: DiaDaSemana): Data {
  let data = criarData(ano, mes, diasNoMes(ano, mes));
  while (diaDaSemana(data) !== alvo) data = somarDias(data, -1);
  return data;
}

/** Datas de `de` a `ate`, inclusive. */
export function* intervaloDeDatas(de: Data, ate: Data): Generator<Data> {
  for (let n = paraDias(de); n <= paraDias(ate); n++) yield deDias(n);
}

export function minutosDaHora(hora: HoraTexto): number {
  const m = PADRAO_HORA.exec(hora);
  if (!m) throw new RangeError(`Hora inválida: ${hora}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function horaDeMinutos(minutos: number): HoraTexto {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Data {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return criarData(ano, mes, dia);
}

const FORMATO_LISBOA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_HORARIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Data e hora de Lisboa num instante real, independentemente do fuso do sistema (C17). */
export function momentoEmLisboa(instante: Date): { data: Data; hora: HoraTexto } {
  const partes = Object.fromEntries(
    FORMATO_LISBOA.formatToParts(instante).map((p) => [p.type, p.value]),
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}
