/**
 * Valida todos os YAML de dados/ (§8.3). Usado na CI (`validar.yml`) e localmente:
 *   npm run validar
 * Termina com código 1 se houver erros.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validarDados, type ArquivoDados } from "@missas/dados";

const RAIZ = new URL("..", import.meta.url).pathname;

function lerPasta(pasta: string): ArquivoDados[] {
  return readdirSync(join(RAIZ, pasta))
    .filter((nome) => !nome.startsWith("."))
    .sort()
    .map((nome) => ({
      caminho: `${pasta}/${nome}`,
      conteudo: readFileSync(join(RAIZ, pasta, nome), "utf8"),
    }));
}

const esquemas = {
  local: JSON.parse(readFileSync(join(RAIZ, "dados/schema/local.schema.json"), "utf8")) as object,
  entidade: JSON.parse(
    readFileSync(join(RAIZ, "dados/schema/entidade.schema.json"), "utf8"),
  ) as object,
};

const arquivos = [...lerPasta("dados/entidades"), ...lerPasta("dados/locais")];
const erros = validarDados(arquivos, esquemas);

if (erros.length > 0) {
  for (const erro of erros) console.error(`✗ ${erro.caminho}: ${erro.mensagem}`);
  console.error(`\n${erros.length} erro(s) em ${arquivos.length} arquivos.`);
  process.exit(1);
}
console.log(`✓ ${arquivos.length} arquivos de dados válidos.`);
