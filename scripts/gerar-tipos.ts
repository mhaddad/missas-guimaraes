/**
 * Gera os tipos TypeScript do modelo de dados a partir de dados/schema/*.schema.json (E1.1),
 * para que o esquema seja a única fonte de verdade.
 *   npm run gerar:tipos           → reescreve pacotes/horarios/src/modelo.gerado.ts
 *   npm run gerar:tipos -- --verificar → falha se o arquivo não estiver atualizado (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile, type JSONSchema } from "json-schema-to-typescript";
import { format, resolveConfig } from "prettier";

const RAIZ = new URL("..", import.meta.url).pathname;
const DESTINO = join(RAIZ, "pacotes/horarios/src/modelo.gerado.ts");

const ESQUEMAS: { arquivo: string; nome: string }[] = [
  { arquivo: "local.schema.json", nome: "Local" },
  { arquivo: "entidade.schema.json", nome: "Entidade" },
  { arquivo: "calendario.schema.json", nome: "Calendario" },
];

/** Dá nomes estáveis aos `$defs`, para que os tipos gerados se possam importar. */
const NOMES_DEFS: Record<string, string> = {
  regra: "Regra",
  excecao: "Excecao",
  dia: "Dia",
  tipo_celebracao: "TipoCelebracao",
  hora: "Hora",
  data: "DataISO",
  id: "Id",
  regra_dia_santo: "RegraDiaSanto",
  ano: "AnoCalendario",
};

function comTitulos(esquema: Record<string, unknown>): JSONSchema {
  const copia = structuredClone(esquema);
  delete copia.$id;
  const defs = copia.$defs as Record<string, Record<string, unknown>> | undefined;
  for (const [chave, def] of Object.entries(defs ?? {})) {
    const nome = NOMES_DEFS[chave];
    if (nome) def.title = nome;
  }
  return copia as JSONSchema;
}

async function gerar(): Promise<string> {
  const partes: string[] = [];
  const vistos = new Set<string>();
  for (const { arquivo, nome } of ESQUEMAS) {
    const esquema = JSON.parse(readFileSync(join(RAIZ, "dados/schema", arquivo), "utf8")) as Record<
      string,
      unknown
    >;
    esquema.title = nome;
    const codigo = await compile(comTitulos(esquema), nome, {
      bannerComment: "",
      additionalProperties: false,
      unreachableDefinitions: true,
      format: false,
      strictIndexSignatures: true,
    });
    // Tipos partilhados entre esquemas (Id, DataISO…) só uma vez.
    const blocos = codigo.split(/\n(?=export )/);
    for (const bloco of blocos) {
      const m = /^export (?:type|interface) (\w+)/.exec(bloco.trim());
      const id = m?.[1];
      if (id && vistos.has(id)) continue;
      if (id) vistos.add(id);
      partes.push(bloco.trim());
    }
  }
  const cabecalho =
    "/* Gerado por scripts/gerar-tipos.ts a partir de dados/schema/*.schema.json. Não editar à mão. */\n";
  const config = (await resolveConfig(DESTINO)) ?? {};
  return format(cabecalho + partes.join("\n\n") + "\n", { ...config, parser: "typescript" });
}

const novo = await gerar();
if (process.argv.includes("--verificar")) {
  const atual = readFileSync(DESTINO, "utf8");
  if (atual !== novo) {
    console.error("✗ modelo.gerado.ts desatualizado: corra `npm run gerar:tipos`.");
    process.exit(1);
  }
  console.log("✓ Tipos do modelo atualizados.");
} else {
  writeFileSync(DESTINO, novo);
  console.log(`✓ ${DESTINO}`);
}
