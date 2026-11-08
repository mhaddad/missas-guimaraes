/**
 * Expansão das regras e exceções em celebrações concretas (§5.1, §5.2, §4.5-A, §4.6).
 */
import { SEM_DIAS_SANTOS, type CalendarioMotor, type DiaSanto } from "./calendario.ts";
import {
  diaDaSemana,
  horaDeMinutos,
  intervaloDeDatas,
  minutosDaHora,
  momentoEmLisboa,
  somarDias,
  type Data,
  type HoraTexto,
} from "./datas.ts";
import type { Dia, Excecao, Local, TipoCelebracao } from "./modelo.gerado.ts";
import { regraAplica } from "./regras.ts";

export interface Ocorrencia {
  local: string;
  data: Data;
  hora: HoraTexto;
  hora_fim?: HoraTexto;
  tipo: TipoCelebracao;
  idioma: string;
  nota?: string;
  /** `regra`: vem de uma regra (eventualmente com a hora alterada); `excecao`: acrescentada. */
  origem: "regra" | "excecao";
  /** Índice da regra em `local.horarios`, quando a origem é uma regra. */
  regra?: number;
  /** Hora habitual, quando uma exceção `alterar` mudou a hora nesse dia. */
  hora_original?: HoraTexto;
  /** Dia santo de preceito nessa data. */
  dia_santo?: DiaSanto;
}

export interface Aviso {
  tipo: "dia_santo_sem_informacao";
  local: string;
  data: Data;
  dia_santo: DiaSanto;
}

export interface OpcoesExpansao {
  calendario?: CalendarioMotor;
}

export interface Expansao {
  ocorrencias: Ocorrencia[];
  avisos: Aviso[];
}

const ORDEM_TIPOS: readonly TipoCelebracao[] = [
  "missa",
  "confissoes",
  "adoracao",
  "terco",
  "outro",
];

/** Ordenação estável: data, hora, local, tipo, regra (§5.2, determinismo). */
export function compararOcorrencias(a: Ocorrencia, b: Ocorrencia): number {
  return (
    a.data.localeCompare(b.data) ||
    a.hora.localeCompare(b.hora) ||
    a.local.localeCompare(b.local) ||
    ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) ||
    (a.regra ?? Number.MAX_SAFE_INTEGER) - (b.regra ?? Number.MAX_SAFE_INTEGER)
  );
}

function tipoCorresponde(excecao: Excecao, tipo: TipoCelebracao): boolean {
  return excecao.tipo === undefined || excecao.tipo === tipo;
}

/** Com que "dia" avaliar as regras numa data, segundo o regime de dias santos do local. */
function diaEfetivo(local: Local, diaSanto: DiaSanto | undefined): Dia | undefined {
  if (!diaSanto) return undefined;
  if (local.dias_santos === "horario_domingo") return "dom";
  if (local.dias_santos === "horario_proprio") return "santo";
  return undefined;
}

function expandirDia(local: Local, data: Data, calendario: CalendarioMotor): Expansao {
  const avisos: Aviso[] = [];
  // Um dia santo ao domingo segue as regras de domingo (§4.5-A).
  const diaSanto = diaDaSemana(data) === "dom" ? undefined : calendario.diaSanto(data);
  if (diaSanto && local.dias_santos === null) {
    avisos.push({ tipo: "dia_santo_sem_informacao", local: local.id, data, dia_santo: diaSanto });
  }
  const comoDia = diaEfetivo(local, diaSanto);

  let ocorrencias: Ocorrencia[] = [];
  local.horarios.forEach((regra, indice) => {
    if (!regraAplica(regra, data, comoDia)) return;
    ocorrencias.push({
      local: local.id,
      data,
      hora: regra.hora,
      ...(regra.hora_fim !== undefined && { hora_fim: regra.hora_fim }),
      tipo: regra.tipo,
      idioma: regra.idioma ?? "pt",
      ...(regra.nota !== undefined && { nota: regra.nota }),
      origem: "regra",
      regra: indice,
      ...(diaSanto && { dia_santo: diaSanto }),
    });
  });

  const excecoes = local.excecoes.filter((e) => e.data === data);

  // Precedência: cancelar > alterar > regra; adicionar soma-se (§5.2).
  for (const e of excecoes.filter((x) => x.acao === "cancelar")) {
    ocorrencias = ocorrencias.filter(
      (o) => !(tipoCorresponde(e, o.tipo) && (e.hora === undefined || e.hora === o.hora)),
    );
  }
  for (const e of excecoes.filter((x) => x.acao === "alterar")) {
    if (e.hora === undefined || e.hora_original === undefined) continue;
    const novaHora = e.hora;
    ocorrencias = ocorrencias.map((o) => {
      if (o.hora_original !== undefined || o.hora !== e.hora_original) return o;
      if (!tipoCorresponde(e, o.tipo)) return o;
      const delta = minutosDaHora(novaHora) - minutosDaHora(o.hora);
      const { hora_fim, ...resto } = o;
      const fim = hora_fim === undefined ? undefined : minutosDaHora(hora_fim) + delta;
      return {
        ...resto,
        hora: novaHora,
        hora_original: o.hora,
        ...(fim !== undefined && fim >= 0 && fim < 24 * 60 && { hora_fim: horaDeMinutos(fim) }),
        ...(e.nota !== undefined && { nota: e.nota }),
      };
    });
  }
  for (const e of excecoes.filter((x) => x.acao === "adicionar")) {
    if (e.hora === undefined) continue;
    ocorrencias.push({
      local: local.id,
      data,
      hora: e.hora,
      tipo: e.tipo ?? "missa",
      idioma: "pt",
      ...(e.nota !== undefined && { nota: e.nota }),
      origem: "excecao",
      ...(diaSanto && { dia_santo: diaSanto }),
    });
  }

  return { ocorrencias, avisos };
}

/** Expande regras e exceções de um local entre `de` e `ate` (inclusive), com os avisos. */
export function expandir(local: Local, de: Data, ate: Data, opcoes: OpcoesExpansao = {}): Expansao {
  const calendario = opcoes.calendario ?? SEM_DIAS_SANTOS;
  const ocorrencias: Ocorrencia[] = [];
  const avisos: Aviso[] = [];
  for (const data of intervaloDeDatas(de, ate)) {
    const dia = expandirDia(local, data, calendario);
    ocorrencias.push(...dia.ocorrencias);
    avisos.push(...dia.avisos);
  }
  ocorrencias.sort(compararOcorrencias);
  return { ocorrencias, avisos };
}

/** Celebrações de um local entre `de` e `ate` (inclusive), ordenadas por data e hora. */
export function ocorrencias(
  local: Local,
  de: Data,
  ate: Data,
  opcoes: OpcoesExpansao = {},
): Ocorrencia[] {
  return expandir(local, de, ate, opcoes).ocorrencias;
}

export interface OpcoesProximas extends OpcoesExpansao {
  /** Número máximo de resultados (por omissão, 10). */
  limite?: number;
  /** Quantos dias para a frente, contando com hoje (por omissão, 7). */
  dias?: number;
  /** Só estes tipos de celebração. */
  tipos?: readonly TipoCelebracao[];
}

/**
 * Próximas celebrações a partir de `agora`, em hora de Lisboa, de todos os locais publicados.
 * Inclui as que começam no próprio minuto de `agora`.
 */
export function proximas(
  locais: readonly Local[],
  agora: Date,
  opcoes: OpcoesProximas = {},
): Ocorrencia[] {
  const { limite = 10, dias = 7, tipos } = opcoes;
  const { data: hoje, hora: horaAgora } = momentoEmLisboa(agora);
  const ate = somarDias(hoje, Math.max(dias, 1) - 1);
  const todas: Ocorrencia[] = [];
  for (const local of locais) {
    if (!local.publicar) continue;
    for (const o of ocorrencias(local, hoje, ate, opcoes)) {
      if (o.data === hoje && o.hora < horaAgora) continue;
      if (tipos && !tipos.includes(o.tipo)) continue;
      todas.push(o);
    }
  }
  return todas.sort(compararOcorrencias).slice(0, limite);
}
