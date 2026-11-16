/**
 * Cria o primeiro administrador do painel no D1 (ADR-005). Os seguintes criam-se no ecrã
 * *Acessos*. O e-mail vem de uma variável de ambiente, nunca do código nem do Git.
 *
 *   npx wrangler login        # uma vez, com a conta Cloudflare
 *   ADMIN_NOME="Nome" ADMIN_EMAIL="pessoa@gmail.com" npx tsx scripts/acessos.ts --remote
 *
 * Recusa se o e-mail já tiver contacto (o e-mail é único na tabela).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sql } from "./importar-d1.ts";

const remoto = process.argv.includes("--remote");
const local = process.argv.includes("--local");
const nome = process.env.ADMIN_NOME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || remoto === local) {
  console.error("Defina ADMIN_NOME e ADMIN_EMAIL e indique --remote ou --local.");
  process.exit(1);
}

const agora = new Date().toISOString();
const id = `c_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const consentimento = JSON.stringify({
  em: agora.slice(0, 10),
  versao: "administrador",
  meio: "proprio",
});
const comando = [
  `INSERT INTO contactos (id, nome, email, funcao, perfil, estado, consentimento, criado_em, atualizado_em) VALUES (${sql(id)}, ${sql(nome)}, ${sql(email)}, 'equipa', 'admin', 'ativo', ${sql(consentimento)}, ${sql(agora)}, ${sql(agora)});`,
  `INSERT INTO auditoria (contacto_id, acao, detalhe, criado_em) VALUES ('script', 'contacto.criar', ${sql(JSON.stringify({ id, perfil: "admin" }))}, ${sql(agora)});`,
].join(" ");

const raiz = new URL("..", import.meta.url).pathname;
execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "BD",
    remoto ? "--remote" : "--local",
    "--config",
    join(raiz, "site/wrangler.jsonc"),
    "--command",
    comando,
  ],
  { stdio: ["ignore", "inherit", "inherit"], cwd: join(raiz, "site") },
);
console.log(`✓ Administrador ${id} criado. Entre em /admin/ com a conta Google desse e-mail.`);
