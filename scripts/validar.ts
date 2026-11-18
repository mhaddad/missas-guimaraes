/**
 * Valida o calendário (`dados/calendario.yml`): esquema, regras e formato canónico. É o único
 * arquivo de dados no repositório; as entidades e os locais vivem no D1 e são validados a cada
 * gravação (`pacotes/dados/src/gravacao.ts`). Usado na CI (`validar.yml`) e localmente:
 *   npm run validar
 * Termina com código 1 se houver erros; os avisos são mostrados mas não falham.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarDados, type ArquivoDados } from "@missas/dados";
import { momentoEmLisboa } from "@missas/horarios";

const RAIZ = new URL("..", import.meta.url).pathname;

const arquivos: ArquivoDados[] = [
  {
    caminho: "dados/calendario.yml",
    conteudo: readFileSync(join(RAIZ, "dados/calendario.yml"), "utf8"),
  },
];
const problemas = validarDados(arquivos, {
  hoje: momentoEmLisboa(new Date()).data,
  exigirCalendario: true,
});
const erros = problemas.filter((p) => p.nivel === "erro");
const avisos = problemas.filter((p) => p.nivel === "aviso");

for (const p of avisos) console.warn(`⚠ ${p.caminho}: ${p.mensagem}`);
for (const p of erros) console.error(`✗ ${p.caminho}: ${p.mensagem}`);
if (erros.length > 0) {
  console.error(
    `\n${erros.length} erro(s) e ${avisos.length} aviso(s) em ${arquivos.length} arquivos.`,
  );
  process.exit(1);
}
console.log(
  `✓ ${arquivos.length} arquivos de dados válidos${avisos.length ? ` (${avisos.length} aviso(s))` : ""}.`,
);
