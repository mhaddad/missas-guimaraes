/**
 * Pré-compila os validadores do Ajv a partir de dados/schema/*.schema.json (E1.9, §8.3 item 1).
 * Os Workers não permitem gerar código em tempo de execução (`new Function`), por isso o
 * painel, o Worker e a CI usam todos este mesmo código gerado.
 *   npm run gerar:validadores                → reescreve pacotes/dados/src/validadores.gerado.js
 *   npm run gerar:validadores -- --verificar → falha se não estiver atualizado (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { format, resolveConfig } from "prettier";

const RAIZ = new URL("../../..", import.meta.url).pathname;
const DESTINO = join(RAIZ, "pacotes/dados/src/validadores.gerado.js");

function esquema(nome: string): object {
  return JSON.parse(readFileSync(join(RAIZ, "dados/schema", nome), "utf8")) as object;
}

async function gerar(): Promise<string> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    code: { source: true, esm: true, lines: true },
  });
  ajv.addSchema(esquema("local.schema.json"), "local");
  ajv.addSchema(esquema("entidade.schema.json"), "entidade");
  ajv.addSchema(esquema("calendario.schema.json"), "calendario");
  const codigo = standaloneCode.default(ajv, {
    validarLocal: "local",
    validarEntidade: "entidade",
    validarCalendario: "calendario",
  });
  // O Ajv ainda escreve `require(...)` para as funções de apoio, mesmo em modo ESM:
  // passam a `import`, compatível com o Node, os navegadores (via bundler) e o Worker.
  const imports: string[] = [];
  const semRequire = codigo.replace(
    /const (\w+) = require\("([^"]+)"\)\.default;?/g,
    (_m, nome: string, modulo: string) => {
      imports.push(`import ${nome}_modulo from "${modulo}.js";`);
      return `const ${nome} = ${nome}_modulo.default ?? ${nome}_modulo;`;
    },
  );
  if (/require\(/.test(semRequire)) throw new Error("Ficou um require() no código gerado.");
  const cabecalho =
    "// Gerado por pacotes/dados/scripts/gerar-validadores.ts a partir de dados/schema/*.schema.json. Não editar à mão.\n" +
    "/* eslint-disable */\n";
  const config = (await resolveConfig(DESTINO)) ?? {};
  return format(cabecalho + imports.join("\n") + "\n" + semRequire, { ...config, parser: "babel" });
}

const novo = await gerar();
if (process.argv.includes("--verificar")) {
  if (readFileSync(DESTINO, "utf8") !== novo) {
    console.error("✗ validadores.gerado.js desatualizado: corra `npm run gerar:validadores`.");
    process.exit(1);
  }
  console.log("✓ Validadores pré-compilados atualizados.");
} else {
  writeFileSync(DESTINO, novo);
  console.log(`✓ ${DESTINO}`);
}
