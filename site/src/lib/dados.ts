/**
 * Dados das páginas públicas (ADR-005): o middleware lê-os do D1 (`Astro.locals.dados`) e estas
 * funções preparam o que a página precisa. Sem acesso a arquivos nem à base: só transformam.
 */
import type { Calendario, Entidade, Local } from "@missas/horarios";
import { textoPesquisa, type DadosPortal, type LocalPortal } from "./portal.ts";

export interface DadosPublicos {
  locais: Local[];
  entidades: Entidade[];
  calendario: Calendario;
}

/** Locais publicados, por ordem alfabética do nome (com a localidade a desempatar). */
export function locaisPublicados(dados: DadosPublicos): { local: Local; entidade: Entidade }[] {
  const entidades = new Map(dados.entidades.map((e) => [e.id, e]));
  return dados.locais
    .filter((l) => l.publicar)
    .map((local) => {
      const entidade = entidades.get(local.entidade);
      if (!entidade) throw new Error(`Entidade em falta: ${local.entidade}`);
      return { local, entidade };
    })
    .sort(
      (a, b) =>
        a.local.nome.localeCompare(b.local.nome, "pt") ||
        (a.local.localidade ?? "").localeCompare(b.local.localidade ?? "", "pt"),
    );
}

/** Paróquia na lista `/paroquias/`: a entidade, a localização resumida e o concelho. */
export interface ParoquiaResumo {
  entidade: Entidade;
  /** Localidade (freguesia) e concelho da igreja principal: "Nespereira · Guimarães". */
  lugar: string;
  concelho: string;
}

/**
 * Entidades com pelo menos um local publicado, por ordem da localidade (é por aí que as pessoas
 * procuram), com o nome a desempatar. A igreja principal é o primeiro local da entidade.
 */
export function paroquiasPublicadas(dados: DadosPublicos): ParoquiaResumo[] {
  const publicados = new Map(dados.locais.filter((l) => l.publicar).map((l) => [l.id, l]));
  const lista: (ParoquiaResumo & { localidade: string })[] = [];
  for (const entidade of dados.entidades) {
    const principal = entidade.locais.map((id) => publicados.get(id)).find(Boolean);
    if (!principal) continue;
    lista.push({
      entidade,
      lugar: [principal.localidade, principal.concelho].filter(Boolean).join(" · "),
      concelho: principal.concelho,
      localidade: principal.localidade ?? entidade.nome,
    });
  }
  return lista
    .sort(
      (a, b) =>
        a.localidade.localeCompare(b.localidade, "pt") ||
        a.entidade.nome.localeCompare(b.entidade.nome, "pt"),
    )
    .map(({ localidade: _l, ...p }) => p);
}

/** Dados enviados ao navegador. Exceções passadas ficam de fora. */
export function dadosPortal(dados: DadosPublicos, agora: Date, hoje: string): DadosPortal {
  const locais: LocalPortal[] = locaisPublicados(dados).map(({ local, entidade }) => ({
    id: local.id,
    nome: local.nome,
    localidade: local.localidade ?? null,
    freguesia: local.freguesia ?? null,
    concelho: local.concelho,
    orago: local.orago ?? null,
    morada: local.morada ?? null,
    geo: local.geo,
    dias_santos: local.dias_santos,
    horarios: local.horarios,
    excecoes: local.excecoes.filter((e) => e.data >= hoje),
    ...(local.notas?.length && { notas: local.notas }),
    ...(local.notas_i18n && { notas_i18n: local.notas_i18n }),
    confirmado_em: local.confirmado_em,
    entidade: {
      id: entidade.id,
      nome: entidade.nome,
      tipo: entidade.tipo,
      telefones: entidade.telefones_publicos ?? [],
    },
    pesquisa: textoPesquisa(local, entidade),
  }));
  return { locais, calendario: dados.calendario, geradoEm: agora.toISOString() };
}
