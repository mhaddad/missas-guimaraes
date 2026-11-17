/**
 * Visão geral do painel (só administradores) e lista das paróquias: o estado de cada entidade
 * (confirmação mais antiga dos locais publicados, última gravação no painel, pendências) e as
 * últimas gravações. Só leituras; o histórico continua em `gravacoes` + `versoes`.
 */
import type { ResumoLocal, TipoGravacao } from "@missas/dados";
import { lerTudo } from "./bd.ts";

/** Uma entidade como aparece na lista do painel. */
export interface ParoquiaPainel {
  id: string;
  nome: string;
  tipo: string;
  /** Concelho e localidade da igreja principal (o primeiro local publicado). */
  concelho: string | null;
  localidade: string | null;
  locais: number;
  publicados: number;
  /** Regras de horário de todos os locais. */
  horarios: number;
  /**
   * Confirmação mais antiga entre os locais publicados (ou todos, se nenhum estiver publicado);
   * `null` se algum nunca foi confirmado.
   */
  confirmado_em: string | null;
  /** Última gravação feita no painel (confirmação, alteração, novo local ou restauro). */
  ultima_gravacao: string | null;
  /** Locais publicados sem o regime dos dias santos indicado. */
  sem_dias_santos: number;
}

export interface AtualizacaoRecente {
  id: number;
  entidade: { id: string; nome: string };
  acao: TipoGravacao;
  data: string;
  /** Nome de quem gravou (o painel só mostra isto a administradores). */
  quem: string | null;
  resumo: ResumoLocal[];
}

export interface VisaoGeral {
  paroquias: ParoquiaPainel[];
  recentes: AtualizacaoRecente[];
  /** Gravações no painel nos últimos 30 dias. */
  gravacoes30dias: number;
}

/** Estado de todas as entidades, por ordem alfabética do nome. */
export async function estadoDasParoquias(bd: D1Database): Promise<ParoquiaPainel[]> {
  const [{ entidades, locais }, { results: ultimas }] = await Promise.all([
    lerTudo(bd),
    bd
      .prepare(
        "SELECT entidade_id, max(criado_em) AS ultima FROM gravacoes WHERE acao != 'importacao' GROUP BY entidade_id",
      )
      .all<{ entidade_id: string; ultima: string }>(),
  ]);
  const porId = new Map(locais.map((l) => [l.id, l]));
  const ultima = new Map(ultimas.map((u) => [u.entidade_id, u.ultima]));
  return entidades
    .map((e): ParoquiaPainel => {
      const seus = e.locais.flatMap((id) => porId.get(id) ?? []);
      const publicados = seus.filter((l) => l.publicar);
      const contam = publicados.length > 0 ? publicados : seus;
      const principal = contam[0];
      const datas = contam.map((l) => l.confirmado_em);
      return {
        id: e.id,
        nome: e.nome,
        tipo: e.tipo,
        concelho: principal?.concelho ?? null,
        localidade: principal?.localidade ?? null,
        locais: seus.length,
        publicados: publicados.length,
        horarios: seus.reduce((n, l) => n + l.horarios.length, 0),
        confirmado_em:
          datas.length === 0 || datas.includes(null)
            ? null
            : (datas as string[]).reduce((a, b) => (a < b ? a : b)),
        ultima_gravacao: ultima.get(e.id) ?? null,
        sem_dias_santos: publicados.filter((l) => l.dias_santos === null).length,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

/** As últimas gravações feitas no painel (sem a importação), com o nome da entidade. */
export async function ultimasAtualizacoes(
  bd: D1Database,
  nomes: ReadonlyMap<string, string>,
  limite = 10,
): Promise<AtualizacaoRecente[]> {
  const { results } = await bd
    .prepare(
      `SELECT g.id, g.entidade_id, g.acao, g.criado_em, g.resumo, c.nome AS quem
       FROM gravacoes g LEFT JOIN contactos c ON c.id = g.contacto_id
       WHERE g.acao != 'importacao' ORDER BY g.id DESC LIMIT ?`,
    )
    .bind(limite)
    .all<{
      id: number;
      entidade_id: string;
      acao: TipoGravacao;
      criado_em: string;
      resumo: string;
      quem: string | null;
    }>();
  return results.map((g) => ({
    id: g.id,
    entidade: { id: g.entidade_id, nome: nomes.get(g.entidade_id) ?? g.entidade_id },
    acao: g.acao,
    data: g.criado_em,
    quem: g.quem,
    resumo: JSON.parse(g.resumo) as ResumoLocal[],
  }));
}

export async function visaoGeral(bd: D1Database, agora = new Date()): Promise<VisaoGeral> {
  const paroquias = await estadoDasParoquias(bd);
  const nomes = new Map(paroquias.map((p) => [p.id, p.nome]));
  const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const [recentes, contagem] = await Promise.all([
    ultimasAtualizacoes(bd, nomes),
    bd
      .prepare("SELECT count(*) AS n FROM gravacoes WHERE acao != 'importacao' AND criado_em >= ?")
      .bind(desde)
      .first<number>("n"),
  ]);
  return { paroquias, recentes, gravacoes30dias: Number(contagem ?? 0) };
}
