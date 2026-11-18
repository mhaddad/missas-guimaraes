/**
 * Horários no D1 (ADR-005): leitura das entidades e dos locais, gravação numa só transação com
 * controlo de versões, histórico (`gravacoes` + `versoes`) e o estado de uma gravação antiga.
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA (integridade do histórico).
 */
import type { EstadoEntidade, Registo, ResumoLocal, TipoGravacao } from "@missas/dados";
import type { Entidade, Local } from "@missas/horarios";

export interface EnvBd {
  BD?: D1Database;
}

interface LinhaRegisto {
  id: string;
  dados: string;
  versao: number;
}

const lerJson = <T>(texto: string): T => JSON.parse(texto) as T;

export async function versaoDados(bd: D1Database): Promise<number> {
  return Number(
    (await bd.prepare("SELECT valor FROM config WHERE chave = 'versao_dados'").first("valor")) ?? 0,
  );
}

export async function lerEntidade(bd: D1Database, id: string): Promise<Registo<Entidade> | null> {
  const l = await bd
    .prepare("SELECT id, dados, versao FROM entidades WHERE id = ?")
    .bind(id)
    .first<LinhaRegisto>();
  return l ? { dados: lerJson<Entidade>(l.dados), versao: l.versao } : null;
}

export async function lerLocais(
  bd: D1Database,
  ids: readonly string[],
): Promise<Map<string, Registo<Local>>> {
  const mapa = new Map<string, Registo<Local>>();
  if (ids.length === 0) return mapa;
  const marcas = ids.map(() => "?").join(", ");
  const { results } = await bd
    .prepare(`SELECT id, dados, versao FROM locais WHERE id IN (${marcas})`)
    .bind(...ids)
    .all<LinhaRegisto>();
  for (const l of results) mapa.set(l.id, { dados: lerJson<Local>(l.dados), versao: l.versao });
  return mapa;
}

/** Estado atual de uma entidade, dos seus locais e de outros locais referidos. */
export async function lerEstado(
  bd: D1Database,
  entidadeId: string,
  outros: readonly string[] = [],
): Promise<EstadoEntidade | null> {
  const entidade = await lerEntidade(bd, entidadeId);
  if (!entidade) return null;
  const ids = [...new Set([...entidade.dados.locais, ...outros])];
  return { entidade, locais: await lerLocais(bd, ids) };
}

/** Todas as entidades e todos os locais (para o site e o catálogo). */
export async function lerTudo(bd: D1Database): Promise<{ entidades: Entidade[]; locais: Local[] }> {
  const [entidades, locais] = await bd.batch([
    bd.prepare("SELECT dados FROM entidades ORDER BY id"),
    bd.prepare("SELECT dados FROM locais ORDER BY id"),
  ]);
  return {
    entidades: (entidades?.results as { dados: string }[]).map((l) => lerJson<Entidade>(l.dados)),
    locais: (locais?.results as { dados: string }[]).map((l) => lerJson<Local>(l.dados)),
  };
}

// ── Gravação ────────────────────────────────────────────────────────────────────────────────

export interface Gravacao {
  entidadeId: string;
  /** Só as ações que a tabela aceita (um pedido `contactos` grava-se como `alteracao`). */
  acao: Exclude<TipoGravacao, "contactos"> | "importacao";
  contactoId: string | null;
  canal: string | null;
  resumo: ResumoLocal[];
  alertas: string[];
  restaura?: number;
  /** Nova versão da entidade, se mudou; `versaoAnterior` `null` = entidade nova (importação). */
  entidade?: { dados: Entidade; versaoAnterior: number | null };
  /** Locais que mudam; `versaoAnterior` `null` = local novo. */
  locais: { dados: Local; versaoAnterior: number | null }[];
}

export class ConflitoDeVersao extends Error {
  override name = "ConflitoDeVersao";
}

/**
 * Grava tudo numa transação: guardas de versão (anulam o lote se alguém gravou entretanto),
 * a gravação, as versões novas, os registos atuais e o contador `versao_dados`. Devolve o id
 * da gravação.
 */
export async function gravar(bd: D1Database, g: Gravacao, agora = new Date()): Promise<number> {
  const quando = agora.toISOString();
  const guarda = (tabela: "entidades" | "locais", id: string, versao: number | null) =>
    versao === null
      ? bd
          .prepare(
            `INSERT INTO guarda_versoes (conflito) SELECT 1 WHERE EXISTS (SELECT 1 FROM ${tabela} WHERE id = ?)`,
          )
          .bind(id)
      : bd
          .prepare(
            `INSERT INTO guarda_versoes (conflito) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM ${tabela} WHERE id = ? AND versao = ?)`,
          )
          .bind(id, versao);

  const registos: {
    tipo: "entidade" | "local";
    id: string;
    dados: object;
    anterior: number | null;
  }[] = [
    ...(g.entidade
      ? [
          {
            tipo: "entidade" as const,
            id: g.entidade.dados.id,
            dados: g.entidade.dados,
            anterior: g.entidade.versaoAnterior,
          },
        ]
      : []),
    ...g.locais.map((l) => ({
      tipo: "local" as const,
      id: l.dados.id,
      dados: l.dados,
      anterior: l.versaoAnterior,
    })),
  ];

  const instrucoes: D1PreparedStatement[] = [
    ...registos.map((r) =>
      guarda(r.tipo === "entidade" ? "entidades" : "locais", r.id, r.anterior),
    ),
    bd
      .prepare(
        "INSERT INTO gravacoes (entidade_id, acao, contacto_id, canal, resumo, alertas, restaura, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        g.entidadeId,
        g.acao,
        g.contactoId,
        g.canal,
        JSON.stringify(g.resumo),
        JSON.stringify(g.alertas),
        g.restaura ?? null,
        quando,
      ),
  ];
  for (const r of registos) {
    const versao = (r.anterior ?? 0) + 1;
    const json = JSON.stringify(r.dados);
    instrucoes.push(
      bd
        .prepare(
          "INSERT INTO versoes (gravacao_id, tipo, registo_id, versao, dados) VALUES ((SELECT max(id) FROM gravacoes), ?, ?, ?, ?)",
        )
        .bind(r.tipo, r.id, versao, json),
    );
    if (r.tipo === "entidade") {
      instrucoes.push(
        r.anterior === null
          ? bd
              .prepare(
                "INSERT INTO entidades (id, dados, versao, atualizado_em) VALUES (?, ?, ?, ?)",
              )
              .bind(r.id, json, versao, quando)
          : bd
              .prepare("UPDATE entidades SET dados = ?, versao = ?, atualizado_em = ? WHERE id = ?")
              .bind(json, versao, quando, r.id),
      );
    } else {
      const entidadeId = (r.dados as Local).entidade;
      instrucoes.push(
        r.anterior === null
          ? bd
              .prepare(
                "INSERT INTO locais (id, entidade_id, dados, versao, atualizado_em) VALUES (?, ?, ?, ?, ?)",
              )
              .bind(r.id, entidadeId, json, versao, quando)
          : bd
              .prepare(
                "UPDATE locais SET entidade_id = ?, dados = ?, versao = ?, atualizado_em = ? WHERE id = ?",
              )
              .bind(entidadeId, json, versao, quando, r.id),
      );
    }
  }
  instrucoes.push(
    bd.prepare(
      "UPDATE config SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE chave = 'versao_dados'",
    ),
    bd.prepare("SELECT max(id) AS id FROM gravacoes"),
  );

  let resultados: D1Result[];
  try {
    resultados = await bd.batch(instrucoes);
  } catch (e) {
    const mensagem = String((e as Error).message ?? e);
    if (/CHECK constraint failed: conflito|UNIQUE constraint failed/.test(mensagem))
      throw new ConflitoDeVersao("alguém gravou entretanto");
    throw e;
  }
  const ultimo = resultados.at(-1)?.results as { id: number }[] | undefined;
  return Number(ultimo?.[0]?.id);
}

// ── Histórico ───────────────────────────────────────────────────────────────────────────────

export interface LinhaGravacao {
  id: number;
  /** Só as ações que a tabela aceita (um pedido `contactos` grava-se como `alteracao`). */
  acao: Exclude<TipoGravacao, "contactos"> | "importacao";
  contacto_id: string | null;
  canal: string | null;
  resumo: ResumoLocal[];
  alertas: string[];
  restaura: number | null;
  criado_em: string;
}

export async function historicoDaEntidade(
  bd: D1Database,
  entidadeId: string,
  limite = 30,
): Promise<LinhaGravacao[]> {
  const { results } = await bd
    .prepare(
      "SELECT id, acao, contacto_id, canal, resumo, alertas, restaura, criado_em FROM gravacoes WHERE entidade_id = ? ORDER BY id DESC LIMIT ?",
    )
    .bind(entidadeId, limite)
    .all<Omit<LinhaGravacao, "resumo" | "alertas"> & { resumo: string; alertas: string }>();
  return results.map((l) => ({
    ...l,
    resumo: lerJson<ResumoLocal[]>(l.resumo),
    alertas: lerJson<string[]>(l.alertas),
  }));
}

/**
 * Estado da entidade logo depois da gravação `gravacaoId` (para o restauro e para mostrar a
 * diferença): para cada registo, a última versão com `gravacao_id <= gravacaoId`. `null` se a
 * gravação não for desta entidade.
 */
export async function estadoNaGravacao(
  bd: D1Database,
  entidadeId: string,
  gravacaoId: number,
): Promise<{ entidade: Entidade; locais: Map<string, Local> } | null> {
  const dona = await bd
    .prepare("SELECT entidade_id FROM gravacoes WHERE id = ?")
    .bind(gravacaoId)
    .first<string>("entidade_id");
  if (dona !== entidadeId) return null;
  const ultima = (tipo: string, ids: readonly string[]) =>
    bd
      .prepare(
        `SELECT v.registo_id AS id, v.dados FROM versoes v
         WHERE v.tipo = ? AND v.registo_id IN (${ids.map(() => "?").join(", ")})
           AND v.versao = (SELECT max(w.versao) FROM versoes w
                           WHERE w.tipo = v.tipo AND w.registo_id = v.registo_id AND w.gravacao_id <= ?)`,
      )
      .bind(tipo, ...ids, gravacaoId)
      .all<{ id: string; dados: string }>();
  const ent = (await ultima("entidade", [entidadeId])).results[0];
  if (!ent) return null;
  const entidade = lerJson<Entidade>(ent.dados);
  const locais = new Map<string, Local>();
  if (entidade.locais.length > 0) {
    for (const l of (await ultima("local", entidade.locais)).results)
      locais.set(l.id, lerJson<Local>(l.dados));
  }
  return { entidade, locais };
}
