/**
 * Cria o primeiro administrador do painel no Workers KV (E3.4, E3.10). Os seguintes criam-se no
 * ecrã *Acessos*. O e-mail vem de uma variável de ambiente, nunca do código nem do Git.
 *
 *   npx wrangler login        # uma vez, com a conta Cloudflare
 *   ADMIN_NOME="Nome" ADMIN_EMAIL="pessoa@exemplo.pt" npx tsx scripts/acessos.ts
 *
 * Recusa se o e-mail já tiver contacto. Grava `contacto:<id>`, `email:<email>` e a auditoria.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const nome = process.env.ADMIN_NOME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Defina ADMIN_NOME e ADMIN_EMAIL (ver o comentário no topo do script).");
  process.exit(1);
}

const config = new URL("../worker/wrangler.jsonc", import.meta.url).pathname;

function wrangler(...args: string[]): string {
  return execFileSync(
    "npx",
    ["wrangler", "kv", "key", ...args, "--binding", "KV", "--remote", "--config", config],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
}

function lerIndice(): string {
  try {
    return wrangler("get", `email:${email}`, "--text").trim();
  } catch {
    return ""; // o wrangler termina com erro quando a chave não existe
  }
}
const existente = lerIndice();
if (existente && !/not found/i.test(existente)) {
  console.error(`Este e-mail já tem contacto (${existente}). Use o ecrã Acessos.`);
  process.exit(1);
}

const agora = new Date().toISOString();
const id = `c_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const contacto = {
  id,
  nome,
  email,
  funcao: "equipa",
  perfil: "admin",
  entidades: [],
  estado: "ativo",
  consentimento: { em: agora.slice(0, 10), versao: "administrador", meio: "proprio" },
  criado_em: agora,
  atualizado_em: agora,
};

wrangler("put", `contacto:${id}`, JSON.stringify(contacto));
wrangler("put", `email:${email}`, id);
wrangler(
  "put",
  `auditoria:${agora}:${randomUUID().slice(0, 8)}`,
  JSON.stringify({
    quem: "script",
    acao: "contacto.criar",
    detalhe: { id, perfil: "admin" },
    em: agora,
  }),
  "--ttl",
  String(2 * 365 * 24 * 60 * 60),
);
console.log(`✓ Administrador ${id} criado. Entre em /admin/ com a conta Google desse e-mail.`);
