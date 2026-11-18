/**
 * Base local para os testes de ponta a ponta (Playwright): migrações, os dados fixos de
 * `site/e2e/dados`, dois contactos com sessão aberta (admin e um contacto da Nespereira) e dois
 * relatos do público.
 * Corre antes do `wrangler dev` (ver `playwright.config.ts`). Nada disto toca na base remota.
 *
 *   npx tsx scripts/semear-e2e.ts
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Entidade, Local } from "@missas/horarios";
import { SESSOES } from "../site/e2e/sessoes.ts";
import { gerarSql, sql } from "./importar-d1.ts";

const RAIZ = new URL("..", import.meta.url).pathname;
export const ESTADO_E2E = join(RAIZ, "site/.wrangler/e2e");
const CONFIG = join(RAIZ, "site/wrangler.jsonc");
const DADOS = join(RAIZ, "site/e2e/dados");

function wrangler(...args: string[]): void {
  execFileSync(
    "npx",
    ["wrangler", "d1", ...args, "--local", "--persist-to", ESTADO_E2E, "--config", CONFIG],
    { cwd: join(RAIZ, "site"), stdio: ["ignore", "ignore", "inherit"] },
  );
}

const ler = <T>(pasta: string) =>
  readdirSync(join(DADOS, pasta))
    .filter((n) => n.endsWith(".yml"))
    .map((n) => parse(readFileSync(join(DADOS, pasta, n), "utf8")) as T);

rmSync(ESTADO_E2E, { recursive: true, force: true });
wrangler("migrations", "apply", "BD");

const agora = new Date();
const quando = agora.toISOString();
const expira = new Date(agora.getTime() + 24 * 60 * 60 * 1000).toISOString();
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const consentimento = sql(JSON.stringify({ em: "2026-11-01", versao: "v1", meio: "papel" }));
const contactos = [
  `INSERT INTO contactos VALUES ('c_aaaaaaaa', 'Ana Admin', 'admin@exemplo.pt', 'equipa', 'admin', 'ativo', ${consentimento}, ${sql(quando)}, ${sql(quando)});`,
  `INSERT INTO contactos VALUES ('c_bbbbbbbb', 'Secretaria', 'nespereira@exemplo.pt', 'secretaria', 'entidade', 'ativo', ${consentimento}, ${sql(quando)}, ${sql(quando)});`,
  "INSERT INTO contacto_entidades VALUES ('c_bbbbbbbb', 'nespereira');",
  `INSERT INTO sessoes VALUES (${sql(hash(SESSOES.admin))}, 'c_aaaaaaaa', ${sql(quando)}, ${sql(expira)});`,
  `INSERT INTO sessoes VALUES (${sql(hash(SESSOES.entidade))}, 'c_bbbbbbbb', ${sql(quando)}, ${sql(expira)});`,
  // Relatos do público (página Relatos e cartão na página da paróquia).
  `INSERT INTO relatos VALUES ('r_00000000e1', 'nespereira', 'A missa de domingo passou para as 10:30.', 'pt-PT', 'aberto', ${sql(quando)});`,
  `INSERT INTO relatos VALUES ('r_00000000e2', 'polvoreira', 'There was no mass on Saturday.', 'en', 'aberto', ${sql(quando)});`,
];
const locais = new Map(ler<Local>("locais").map((l) => [l.id, l]));
const arquivo = join(ESTADO_E2E, "..", "semente-e2e.sql");
writeFileSync(
  arquivo,
  gerarSql(ler<Entidade>("entidades"), locais, quando, false) + contactos.join("\n") + "\n",
);
wrangler("execute", "BD", "--file", arquivo);
console.log("✓ Base local dos e2e pronta.");
