/**
 * Reescreve os YAML de dados/ no formato canónico (§8.3, item 7):
 *   npm run formatar:dados
 * Não muda os dados nem os comentários; `npm run validar` falha se algum arquivo não estiver
 * no formato canónico.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatar } from "@missas/dados";

const RAIZ = new URL("..", import.meta.url).pathname;
const caminhos = [
  "dados/calendario.yml",
  ...["dados/entidades", "dados/locais"].flatMap((pasta) =>
    readdirSync(join(RAIZ, pasta))
      .filter((nome) => nome.endsWith(".yml"))
      .sort()
      .map((nome) => `${pasta}/${nome}`),
  ),
];

let alterados = 0;
for (const caminho of caminhos) {
  const atual = readFileSync(join(RAIZ, caminho), "utf8");
  const novo = formatar(atual, caminho);
  if (novo !== atual) {
    writeFileSync(join(RAIZ, caminho), novo);
    console.log(`✎ ${caminho}`);
    alterados++;
  }
}
console.log(`✓ ${caminhos.length} arquivos; ${alterados} reescrito(s).`);
