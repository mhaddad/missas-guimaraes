/**
 * Importa os YAML de `dados/` para o D1 (ADR-005, passo 2): entidades, locais e uma gravação
 * `importacao` por entidade (versão 1 de cada registo). Valida tudo antes; não importa com erros.
 *
 *   npx tsx scripts/importar-d1.ts --local                 # base local (desenvolvimento)
 *   npx tsx scripts/importar-d1.ts --remote                # base da Cloudflare
 *   npx tsx scripts/importar-d1.ts --dados site/e2e/dados --local
 *   npx tsx scripts/importar-d1.ts --remote --substituir   # só na troca: apaga horários e histórico
 *
 * Sem `--substituir`, recusa importar para uma base que já tenha entidades. Com ele, apaga os
 * horários, o histórico e a cache das páginas (os contactos ficam) e importa de novo.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { validarDados, type ArquivoDados } from "@missas/dados";
import { momentoEmLisboa, type Entidade, type Local } from "@missas/horarios";

const RAIZ = new URL("..", import.meta.url).pathname;
const CONFIG = join(RAIZ, "site/wrangler.jsonc");

const { values } = parseArgs({
  options: {
    dados: { type: "string", default: join(RAIZ, "dados") },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    substituir: { type: "boolean", default: false },
    saida: { type: "string" },
  },
});

/** Texto SQL entre plicas (as plicas duplicam-se). */
export const sql = (valor: string | number | null): string =>
  valor === null
    ? "NULL"
    : typeof valor === "number"
      ? String(valor)
      : `'${valor.replace(/'/g, "''")}'`;

export function gerarSql(
  entidades: Entidade[],
  locais: Map<string, Local>,
  quando: string,
  substituir: boolean,
): string {
  const linhas: string[] = [];
  if (substituir) {
    linhas.push(
      "DROP TRIGGER gravacoes_imutaveis_u;",
      "DROP TRIGGER gravacoes_imutaveis_d;",
      "DROP TRIGGER versoes_imutaveis_u;",
      "DROP TRIGGER versoes_imutaveis_d;",
      "DELETE FROM versoes;",
      "DELETE FROM gravacoes;",
      "DELETE FROM locais;",
      "DELETE FROM entidades;",
      "DELETE FROM paginas;",
      "DELETE FROM sqlite_sequence WHERE name = 'gravacoes';",
      "CREATE TRIGGER gravacoes_imutaveis_u BEFORE UPDATE ON gravacoes BEGIN SELECT RAISE(ABORT, 'o histórico não se altera'); END;",
      "CREATE TRIGGER gravacoes_imutaveis_d BEFORE DELETE ON gravacoes BEGIN SELECT RAISE(ABORT, 'o histórico não se apaga'); END;",
      "CREATE TRIGGER versoes_imutaveis_u BEFORE UPDATE ON versoes BEGIN SELECT RAISE(ABORT, 'o histórico não se altera'); END;",
      "CREATE TRIGGER versoes_imutaveis_d BEFORE DELETE ON versoes BEGIN SELECT RAISE(ABORT, 'o histórico não se apaga'); END;",
    );
  } else {
    // Base com dados: o CHECK da guarda falha e nada é importado.
    linhas.push(
      "INSERT INTO guarda_versoes (conflito) SELECT 1 WHERE EXISTS (SELECT 1 FROM entidades);",
    );
  }
  const gravacao = "(SELECT max(id) FROM gravacoes)";
  for (const e of [...entidades].sort((a, b) => a.id.localeCompare(b.id))) {
    const json = JSON.stringify(e);
    linhas.push(
      `INSERT INTO gravacoes (entidade_id, acao, resumo, alertas, criado_em) VALUES (${sql(e.id)}, 'importacao', '[]', '[]', ${sql(quando)});`,
      `INSERT INTO versoes (gravacao_id, tipo, registo_id, versao, dados) VALUES (${gravacao}, 'entidade', ${sql(e.id)}, 1, ${sql(json)});`,
      `INSERT INTO entidades (id, dados, versao, atualizado_em) VALUES (${sql(e.id)}, ${sql(json)}, 1, ${sql(quando)});`,
    );
    for (const id of e.locais) {
      const l = locais.get(id);
      if (!l) throw new Error(`local em falta: ${id}`);
      const jl = JSON.stringify(l);
      linhas.push(
        `INSERT INTO versoes (gravacao_id, tipo, registo_id, versao, dados) VALUES (${gravacao}, 'local', ${sql(id)}, 1, ${sql(jl)});`,
        `INSERT INTO locais (id, entidade_id, dados, versao, atualizado_em) VALUES (${sql(id)}, ${sql(e.id)}, ${sql(jl)}, 1, ${sql(quando)});`,
      );
    }
  }
  linhas.push(
    "UPDATE config SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE chave = 'versao_dados';",
  );
  return `${linhas.join("\n")}\n`;
}

function principal(): void {
  if (values.local === values.remote && !values.saida) {
    console.error("Indique --local ou --remote (ou --saida arquivo.sql).");
    process.exit(1);
  }
  const pasta = resolve(values.dados);
  const ler = (sub: string): ArquivoDados[] =>
    readdirSync(join(pasta, sub))
      .filter((n) => n.endsWith(".yml"))
      .sort()
      .map((n) => ({
        caminho: `dados/${sub}/${n}`,
        conteudo: readFileSync(join(pasta, sub, n), "utf8"),
      }));
  const arquivos = [
    {
      caminho: "dados/calendario.yml",
      conteudo: readFileSync(join(RAIZ, "dados/calendario.yml"), "utf8"),
    },
    ...ler("entidades"),
    ...ler("locais"),
  ];
  const erros = validarDados(arquivos, {
    hoje: momentoEmLisboa(new Date()).data,
    exigirCalendario: true,
  }).filter((p) => p.nivel === "erro");
  if (erros.length > 0) {
    for (const e of erros) console.error(`✗ ${e.caminho}: ${e.mensagem}`);
    process.exit(1);
  }
  const entidades = arquivos
    .filter((a) => a.caminho.startsWith("dados/entidades/"))
    .map((a) => parse(a.conteudo ?? "") as Entidade);
  const locais = new Map(
    arquivos
      .filter((a) => a.caminho.startsWith("dados/locais/"))
      .map((a) => parse(a.conteudo ?? "") as Local)
      .map((l) => [l.id, l]),
  );
  const conteudo = gerarSql(entidades, locais, new Date().toISOString(), values.substituir);
  const saida = values.saida ?? join(mkdtempSync(join(tmpdir(), "importar-d1-")), "importacao.sql");
  writeFileSync(saida, conteudo);
  console.log(`${entidades.length} entidades e ${locais.size} locais → ${saida}`);
  if (values.local || values.remote) {
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "BD",
        values.remote ? "--remote" : "--local",
        "--config",
        CONFIG,
        "--file",
        saida,
      ],
      { stdio: "inherit", cwd: join(RAIZ, "site") },
    );
    console.log("✓ Importação concluída.");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) principal();
