/**
 * Leitura dos dados no build (Node): locais publicados, entidades e calendário, já validados.
 * Só corre no build; o navegador recebe `DadosPortal` em JSON.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { lerCalendario, lerEntidade, lerLocal } from "@missas/dados";
import type { Calendario, Entidade, Local } from "@missas/horarios";
import { textoPesquisa, type DadosPortal, type LocalPortal } from "./portal.ts";

/** Pasta `dados/` do repositório, procurada a partir da pasta atual. */
function pastaDados(): string {
  let pasta = process.cwd();
  for (;;) {
    const candidata = join(pasta, "dados");
    if (existsSync(join(candidata, "calendario.yml"))) return candidata;
    const acima = dirname(pasta);
    if (acima === pasta) throw new Error("Não encontrei a pasta dados/ do repositório.");
    pasta = acima;
  }
}

function lerPasta<T>(pasta: string, ler: (conteudo: string) => T): T[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith(".yml"))
    .sort()
    .map((n) => ler(readFileSync(join(pasta, n), "utf8")));
}

let cache:
  { locais: Local[]; entidades: Map<string, Entidade>; calendario: Calendario } | undefined;

export function carregarDados(): {
  locais: Local[];
  entidades: Map<string, Entidade>;
  calendario: Calendario;
} {
  if (cache) return cache;
  const raiz = pastaDados();
  const locais = lerPasta(join(raiz, "locais"), lerLocal);
  const entidades = new Map(lerPasta(join(raiz, "entidades"), lerEntidade).map((e) => [e.id, e]));
  const calendario = lerCalendario(readFileSync(resolve(raiz, "calendario.yml"), "utf8"));
  cache = { locais, entidades, calendario };
  return cache;
}

/** Locais publicados, por ordem alfabética do nome (com a localidade a desempatar). */
export function locaisPublicados(): { local: Local; entidade: Entidade }[] {
  const { locais, entidades } = carregarDados();
  return locais
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

/** Dados enviados ao navegador. Exceções passadas ficam de fora. */
export function dadosPortal(agora: Date, hoje: string): DadosPortal {
  const { calendario } = carregarDados();
  const locais: LocalPortal[] = locaisPublicados().map(({ local, entidade }) => ({
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
  return { locais, calendario, geradoEm: agora.toISOString() };
}
