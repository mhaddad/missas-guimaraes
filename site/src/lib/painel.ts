/**
 * Apoio às páginas do painel (visão geral e lista das paróquias): estado da confirmação, data da
 * última atualização, datas relativas e ordenação. Funções puras, usadas no servidor e testadas.
 */
import { momentoEmLisboa } from "@missas/horarios";
import { selo } from "./portal.ts";

/** Data de Lisboa (`AAAA-MM-DD`) de um instante ISO; uma data simples fica como está. */
export function dataDeLisboa(valor: string): string {
  return valor.length <= 10 ? valor : momentoEmLisboa(new Date(valor)).data;
}

export type EstadoParoquia = "confirmada" | "a-confirmar" | "antiga" | "nunca";

export const ESTADOS: Record<EstadoParoquia, { texto: string; classe: string; ponto: string }> = {
  confirmada: {
    texto: "Confirmada",
    classe: "bg-confirmado-fundo text-confirmado",
    ponto: "bg-confirmado",
  },
  "a-confirmar": {
    texto: "A confirmar",
    classe: "bg-aviso-fundo text-dourado-texto",
    ponto: "bg-dourado",
  },
  antiga: {
    texto: "Sem confirmação recente",
    classe: "bg-red-50 text-erro",
    ponto: "bg-erro",
  },
  nunca: {
    texto: "Nunca confirmada",
    classe: "bg-slate-100 text-texto-secundario",
    ponto: "bg-slate-400",
  },
};

/** Confirmada (≤ 45 dias), a confirmar (46–120), sem confirmação recente (> 120) ou nunca. */
export function estadoDaConfirmacao(confirmadoEm: string | null, hoje: string): EstadoParoquia {
  const { estado } = selo(confirmadoEm, hoje);
  if (estado === "confirmadoHoje" || estado === "confirmado") return "confirmada";
  if (estado === "aConfirmar") return "a-confirmar";
  if (estado === "antigo") return "antiga";
  return "nunca";
}

/**
 * Última vez que alguém tratou dos horários: a gravação mais recente no painel ou, se for mais
 * recente, a confirmação (data). `null` se nunca houve nenhuma.
 */
export function ultimaAtualizacao(p: {
  confirmado_em: string | null;
  ultima_gravacao: string | null;
}): string | null {
  const gravacao = p.ultima_gravacao ? dataDeLisboa(p.ultima_gravacao) : null;
  if (gravacao && p.confirmado_em) return gravacao > p.confirmado_em ? gravacao : p.confirmado_em;
  return gravacao ?? p.confirmado_em;
}

/** As que há mais tempo não são atualizadas primeiro (as que nunca foram, à frente). */
export function compararPorAntiguidade<T extends { nome: string }>(
  data: (p: T) => string | null,
): (a: T, b: T) => number {
  return (a, b) => {
    const da = data(a);
    const db = data(b);
    if (da !== db) {
      if (da === null) return -1;
      if (db === null) return 1;
      return da.localeCompare(db);
    }
    return a.nome.localeCompare(b.nome, "pt");
  };
}

const FUSO = "Europe/Lisbon";
/** Mês por extenso: com o mês abreviado, alguns navegadores escrevem "17/11". */
const DATA = new Intl.DateTimeFormat("pt-PT", {
  timeZone: FUSO,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const HORA = new Intl.DateTimeFormat("pt-PT", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-11-17" → "17 de novembro de 2026" (data `AAAA-MM-DD`, sem fuso). */
export function formatarData(data: string): string {
  return DATA.format(new Date(`${data.slice(0, 10)}T12:00:00Z`));
}

/** "17 de novembro de 2026, 09:15" (hora de Lisboa). */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return `${DATA.format(d)}, ${HORA.format(d)}`;
}

/** "hoje", "ontem", "há 5 dias", "há 3 semanas", "há 2 meses", "há mais de um ano". */
export function haQuanto(data: string, hoje: string): string {
  const dias = Math.round((Date.parse(hoje) - Date.parse(dataDeLisboa(data))) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 14) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return "há mais de um ano";
}

export const ACOES: Record<string, string> = {
  importacao: "Horários iniciais",
  confirmacao: "Confirmou os horários",
  alteracao: "Alterou os horários",
  "novo-local": "Acrescentou um local",
  restauro: "Restaurou uma versão anterior",
};
