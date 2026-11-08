/**
 * Calendário (§4.7): época da hora legal e dias santos de preceito (§4.5-A).
 *
 * Os dias santos de cada ano calculam-se a partir das regras de `dados/calendario.yml`
 * (datas fixas e `pascoa±N`); as datas escritas em `anos` servem de verificação
 * (`verificarCalendario`) e de leitura para pessoas.
 */
import {
  diaDaSemana,
  eDataValida,
  partesDaData,
  pascoa,
  somarDias,
  ultimoDiaDaSemanaDoMes,
  type Data,
} from "./datas.ts";
import type { Calendario, RegraDiaSanto } from "./modelo.gerado.ts";

export type Epoca = "verao" | "inverno";

/**
 * Verão (hora legal): do último domingo de março (inclusive) ao último domingo de outubro
 * (exclusive). Regra da União Europeia, igual para todos os anos.
 */
export function epocaDe(data: Data): Epoca {
  const { ano } = partesDaData(data);
  const inicio = ultimoDiaDaSemanaDoMes(ano, 3, "dom");
  const fim = ultimoDiaDaSemanaDoMes(ano, 10, "dom");
  return data >= inicio && data < fim ? "verao" : "inverno";
}

export interface DiaSanto {
  id: string;
  nome: string;
}

export interface CalendarioMotor {
  /** Dia santo de preceito nessa data, se houver. */
  diaSanto(data: Data): DiaSanto | undefined;
}

const PADRAO_MOVEL = /^pascoa([+-]\d{1,3})$/;

export function dataDaRegra(regra: RegraDiaSanto, ano: number): Data {
  if ("data" in regra) return `${String(ano).padStart(4, "0")}-${regra.data}`;
  const m = PADRAO_MOVEL.exec(regra.data_movel);
  if (!m) throw new Error(`Dia santo ${regra.id}: data_movel inválida (${regra.data_movel}).`);
  return somarDias(pascoa(ano), Number(m[1]));
}

export function prepararCalendario(calendario: Calendario): CalendarioMotor {
  const regras = calendario.dias_santos_de_preceito.regras;
  const porAno = new Map<number, Map<Data, DiaSanto>>();

  function doAno(ano: number): Map<Data, DiaSanto> {
    let mapa = porAno.get(ano);
    if (!mapa) {
      mapa = new Map();
      for (const regra of regras) {
        mapa.set(dataDaRegra(regra, ano), { id: regra.id, nome: regra.nome });
      }
      porAno.set(ano, mapa);
    }
    return mapa;
  }

  return {
    diaSanto(data) {
      return doAno(partesDaData(data).ano).get(data);
    },
  };
}

/** Calendário sem dias santos (útil quando o calendário não é relevante). */
export const SEM_DIAS_SANTOS: CalendarioMotor = { diaSanto: () => undefined };

/**
 * Confere as datas escritas em `anos` com as calculadas pelas regras e com a regra da hora legal.
 * Devolve mensagens de erro (vazio = coerente).
 */
export function verificarCalendario(calendario: Calendario): string[] {
  const erros: string[] = [];
  const regras = calendario.dias_santos_de_preceito.regras;
  for (const regra of regras) {
    // 2000 é bissexto: aceita 02-29 e recusa 02-30, 04-31…
    if ("data" in regra && !eDataValida(`2000-${regra.data}`)) {
      erros.push(`dias santos: ${regra.id} tem uma data que não existe (${regra.data})`);
    }
    if ("data_movel" in regra && !PADRAO_MOVEL.test(regra.data_movel)) {
      erros.push(`dias santos: ${regra.id} tem data_movel inválida (${regra.data_movel})`);
    }
  }
  for (const [anoTexto, ano] of Object.entries(calendario.anos)) {
    if (!ano) continue;
    const n = Number(anoTexto);
    for (const regra of regras) {
      let esperada: Data;
      try {
        esperada = dataDaRegra(regra, n);
      } catch {
        continue;
      }
      const escrita = ano.dias_santos[regra.id];
      if (escrita !== esperada) {
        erros.push(
          `anos.${anoTexto}.dias_santos.${regra.id}: ${escrita ?? "em falta"} ≠ ${esperada}`,
        );
      }
    }
    for (const id of Object.keys(ano.dias_santos)) {
      if (!regras.some((r) => r.id === id)) {
        erros.push(`anos.${anoTexto}.dias_santos.${id}: não existe nas regras`);
      }
    }
    const pascoaEscrita = ano.moveis.pascoa;
    if (pascoaEscrita !== undefined && pascoaEscrita !== pascoa(n)) {
      erros.push(`anos.${anoTexto}.moveis.pascoa: ${pascoaEscrita} ≠ ${pascoa(n)}`);
    }
    const verao = ultimoDiaDaSemanaDoMes(n, 3, "dom");
    const inverno = ultimoDiaDaSemanaDoMes(n, 10, "dom");
    if (ano.hora_legal.inicio_verao !== verao) {
      erros.push(
        `anos.${anoTexto}.hora_legal.inicio_verao: ${ano.hora_legal.inicio_verao} ≠ ${verao}`,
      );
    }
    if (ano.hora_legal.inicio_inverno !== inverno) {
      erros.push(
        `anos.${anoTexto}.hora_legal.inicio_inverno: ${ano.hora_legal.inicio_inverno} ≠ ${inverno}`,
      );
    }
    for (const [chave, data] of Object.entries(ano.moveis)) {
      if (data === undefined) continue;
      if (chave.endsWith("domingo") || ["ramos", "pascoa", "pentecostes"].includes(chave)) {
        if (diaDaSemana(data) !== "dom")
          erros.push(`anos.${anoTexto}.moveis.${chave}: não é domingo`);
      }
    }
  }
  return erros;
}
