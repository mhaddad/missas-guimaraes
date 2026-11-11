/**
 * Resumo e alertas de anomalia de um pedido (§8.3, 6-A; Anexo B). Módulo leve, sem validação nem
 * YAML: o painel usa-o no navegador para mostrar o resumo antes de enviar, com o mesmo código
 * que o Worker e o GitHub Actions usam para o recalcular.
 */
import {
  chaveCanonica,
  diff,
  iguais,
  resumirAlteracoes,
  type Local,
} from "@missas/horarios";
import type { ResumoLocal } from "./pedido.ts";

const HORA_MINIMA = "06:00";
const HORA_MAXIMA = "22:30";
const MAX_LOCAIS_SEM_ALERTA = 5;

/** Uma linha só, sem quebras: os textos vêm dos dados e não podem criar *trailers* falsos. */
export function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

export interface ParLocal {
  /** `null` para um local novo. */
  antes: Local | null;
  depois: Local;
}

/**
 * Resumo de um pedido, local a local, com as linhas do motor (§5.1, `diff`). O painel e o
 * Worker calculam-no da mesma forma; o GitHub Actions recalcula-o e recusa se não coincidir.
 */
export function resumirPedido(pares: readonly ParLocal[]): ResumoLocal[] {
  return pares
    .map(({ antes, depois }) => {
      const vazio: Local = {
        ...depois,
        horarios: [],
        excecoes: [],
        dias_santos: null,
        confirmado_em: null,
      };
      delete (vazio as Partial<Local>).confirmado_por;
      const alteracoes = diff(antes ?? vazio, depois).filter(
        // `confirmado_por` acompanha sempre `confirmado_em`, que já tem a sua linha.
        (a) => !(a.tipo === "campo" && a.campo === "confirmado_por"),
      );
      const linhas = resumirAlteracoes(alteracoes).map(umaLinha);
      if (antes === null) linhas.unshift(`🆕 Novo local: ${umaLinha(depois.nome)}`);
      return { local: depois.id, linhas };
    })
    .filter((r) => r.linhas.length > 0)
    .sort((a, b) => a.local.localeCompare(b.local));
}

/**
 * Alertas de anomalia (§8.3, 6-A): não impedem a gravação, mas pedem confirmação reforçada no
 * painel e um e-mail aos administradores.
 */
export function alertasDeAnomalia(pares: readonly ParLocal[]): string[] {
  const alertas: string[] = [];
  const mudados = pares.filter(({ antes, depois }) => !iguais(antes, depois));
  if (mudados.length > MAX_LOCAIS_SEM_ALERTA)
    alertas.push(`O pedido mexe em ${mudados.length} locais.`);
  for (const { antes, depois } of mudados) {
    const nome = umaLinha(depois.nome);
    if (antes && antes.horarios.length > 0) {
      const chavesDepois = new Set(depois.horarios.map(chaveCanonica));
      const retiradas = antes.horarios.filter((r) => !chavesDepois.has(chaveCanonica(r))).length;
      if (depois.horarios.length === 0) alertas.push(`${nome} fica sem nenhum horário.`);
      else if (retiradas * 2 > antes.horarios.length)
        alertas.push(`${nome}: retira ${retiradas} de ${antes.horarios.length} horários.`);
    }
    const existentes = new Set(
      [...(antes?.horarios ?? []), ...(antes?.excecoes ?? [])].map(chaveCanonica),
    );
    const horas = [...depois.horarios, ...depois.excecoes]
      .filter((x) => !existentes.has(chaveCanonica(x)))
      .flatMap((x) => [x.hora, "hora_fim" in x ? x.hora_fim : undefined])
      .filter((h): h is string => typeof h === "string");
    for (const hora of new Set(horas)) {
      if (hora < HORA_MINIMA || hora > HORA_MAXIMA)
        alertas.push(`${nome}: hora fora do habitual (${hora}).`);
    }
  }
  return alertas;
}
