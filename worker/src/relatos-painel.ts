/**
 * Relatos do público no painel (§6.7). REVISÃO DE SEGURANÇA OBRIGATÓRIA: âmbito por perfil.
 *
 * Um relato pertence à entidade do local relatado. Os administradores veem todos (incluindo os
 * que não indicam local); o contacto de uma paróquia vê só os dos seus locais. Mudar o estado
 * (aberto, resolvido, descartado) fica na auditoria com o id opaco de quem o fez. Um relato
 * nunca altera horários: a correção faz-se no painel, como qualquer outra alteração.
 */

export const ESTADOS_RELATO = ["aberto", "resolvido", "descartado"] as const;
export type EstadoRelato = (typeof ESTADOS_RELATO)[number];

export interface RelatoPainel {
  id: string;
  mensagem: string;
  idioma: string;
  estado: EstadoRelato;
  criado_em: string;
  local: { id: string; nome: string } | null;
  entidade: { id: string; nome: string } | null;
}

const MAXIMO = 500;
export const PADRAO_ID_RELATO = /^r_[0-9a-f]{10}$/;

interface Linha {
  id: string;
  local_id: string | null;
  mensagem: string;
  idioma: string;
  estado: EstadoRelato;
  criado_em: string;
  local_nome: string | null;
  entidade_id: string | null;
  entidade_nome: string | null;
}

const SELECAO = `SELECT r.id, r.local_id, r.mensagem, r.idioma, r.estado, r.criado_em,
    json_extract(l.dados, '$.nome') AS local_nome, l.entidade_id,
    json_extract(e.dados, '$.nome') AS entidade_nome
  FROM relatos r
  LEFT JOIN locais l ON l.id = r.local_id
  LEFT JOIN entidades e ON e.id = l.entidade_id`;

function paraPainel(r: Linha): RelatoPainel {
  return {
    id: r.id,
    mensagem: r.mensagem,
    idioma: r.idioma,
    estado: r.estado,
    criado_em: r.criado_em,
    local: r.local_id ? { id: r.local_id, nome: r.local_nome ?? r.local_id } : null,
    entidade: r.entidade_id ? { id: r.entidade_id, nome: r.entidade_nome ?? r.entidade_id } : null,
  };
}

/**
 * Relatos do âmbito, do mais recente para o mais antigo. `ambito`: `"todas"` (administradores,
 * incluindo os relatos sem local) ou as entidades da pessoa. O âmbito e os filtros aplicam-se no
 * SQL, antes do limite (relatos de outras paróquias nunca empurram os desta para fora da lista);
 * `pode` volta a confirmar cada linha.
 */
export async function listarRelatos(
  bd: D1Database,
  ambito: "todas" | readonly string[],
  pode: (entidade: string | null) => boolean,
  filtro: { estado?: EstadoRelato; entidade?: string } = {},
): Promise<RelatoPainel[]> {
  const { results } = await bd
    .prepare(
      `${SELECAO}
       WHERE (?1 IS NULL OR r.estado = ?1)
         AND (?2 IS NULL OR l.entidade_id = ?2)
         AND (?3 IS NULL OR l.entidade_id IN (SELECT value FROM json_each(?3)))
       ORDER BY r.criado_em DESC LIMIT ${MAXIMO}`,
    )
    .bind(
      filtro.estado ?? null,
      filtro.entidade ?? null,
      ambito === "todas" ? null : JSON.stringify(ambito),
    )
    .all<Linha>();
  return results.filter((r) => pode(r.entidade_id)).map(paraPainel);
}

export async function obterRelato(bd: D1Database, id: string): Promise<RelatoPainel | null> {
  const r = await bd.prepare(`${SELECAO} WHERE r.id = ?`).bind(id).first<Linha>();
  return r ? paraPainel(r) : null;
}

/**
 * Muda o estado e regista-o na auditoria, numa só transação. Só muda se o relato ainda estiver
 * no estado `de` (dois pedidos ao mesmo tempo: o segundo devolve `false` e não regista nada).
 */
export async function mudarEstadoRelato(
  bd: D1Database,
  mudanca: {
    id: string;
    de: EstadoRelato;
    para: EstadoRelato;
    entidade: string | null;
    quem: string;
    agora: Date;
  },
): Promise<boolean> {
  const { id, de, para, entidade, quem, agora } = mudanca;
  const [atualizacao] = await bd.batch([
    bd.prepare("UPDATE relatos SET estado = ? WHERE id = ? AND estado = ?").bind(para, id, de),
    bd
      .prepare(
        "INSERT INTO auditoria (contacto_id, acao, detalhe, criado_em) SELECT ?, ?, ?, ? WHERE changes() > 0",
      )
      .bind(quem, `relato.${para}`, JSON.stringify({ id, entidade, de }), agora.toISOString()),
  ]);
  return (atualizacao?.meta.changes ?? 0) > 0;
}

/** Relatos por resolver (todos): para a visão geral do administrador. */
export async function contarRelatosAbertos(bd: D1Database): Promise<number> {
  return Number(
    (await bd
      .prepare("SELECT count(*) AS n FROM relatos WHERE estado = 'aberto'")
      .first<number>("n")) ?? 0,
  );
}
