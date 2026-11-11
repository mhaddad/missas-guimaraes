/**
 * Envia um pedido assinado ao `aplicar-pedido.yml` sem passar pelo painel (§13, E4.10).
 *
 *   read -s PEDIDO_HMAC && export PEDIDO_HMAC
 *   npx tsx scripts/enviar-pedido.ts confirmacao <entidade> --contacto c_xxxx --funcao paroco
 *   npx tsx scripts/enviar-pedido.ts alteracao <entidade> dados/locais/<id>.yml … --contacto … --funcao …
 *   npx tsx scripts/enviar-pedido.ts novo-local <entidade> dados/locais/<novo>.yml dados/entidades/<entidade>.yml …
 *   npx tsx scripts/enviar-pedido.ts restauro <entidade> <commit> --contacto … --funcao …
 *
 * Em `alteracao` e `novo-local`, os arquivos indicados são lidos da cópia de trabalho (editados à
 * mão) e comparados com o `origin/main`. Em `restauro`, repõe os arquivos da entidade como
 * estavam no commit indicado. Antes de disparar, simula a aplicação sobre o `origin/main`;
 * `--simular` fica por aí. O disparo usa o `gh` (com a sessão de quem corre o script).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import {
  assinar,
  caminhoEntidade,
  caminhoLocal,
  codificarPedido,
  lerPedido,
  novoIdPedido,
  prepararPedido,
  resumirPedido,
  shaBlob,
  type Pedido,
  type ParLocal,
} from "@missas/dados";
import { momentoEmLisboa, type Entidade, type Local } from "@missas/horarios";

const RAIZ = new URL("..", import.meta.url).pathname;
const REF = "origin/main";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function falhar(mensagem: string): never {
  console.error(`✗ ${mensagem}`);
  process.exit(1);
}

/** Todos os arquivos de `dados/` numa revisão. */
function dadosEm(ref: string): Map<string, string> {
  const repo = new Map<string, string>();
  for (const caminho of git("ls-tree", "-r", "--name-only", ref, "--", "dados").split("\n")) {
    if (/^dados\/(calendario\.yml|entidades\/[^/]+\.yml|locais\/[^/]+\.yml)$/.test(caminho))
      repo.set(caminho, git("show", `${ref}:${caminho}`));
  }
  return repo;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    contacto: { type: "string" },
    funcao: { type: "string", default: "equipa" },
    canal: { type: "string", default: "painel" },
    simular: { type: "boolean", default: false },
  },
});

const [tipo, entidade, ...resto] = positionals;
if (!tipo || !entidade)
  falhar("uso: enviar-pedido.ts <tipo> <entidade> [arquivos… | commit] --contacto c_xxxx");
const segredo = process.env.PEDIDO_HMAC;
if (!segredo) falhar("defina PEDIDO_HMAC (read -s PEDIDO_HMAC && export PEDIDO_HMAC)");
if (!values.contacto) falhar("indique --contacto (id opaco do contacto, ex.: c_7f3a)");

git("fetch", "--quiet", "origin", "main");
const atual = dadosEm(REF);
const base: Record<string, string | null> = {};
const arquivos: Record<string, Record<string, unknown>> = {};
const pares: ParLocal[] = [];
const lerAtual = <T>(caminho: string): T | null => {
  const texto = atual.get(caminho);
  return texto === undefined ? null : (parse(texto) as T);
};

async function acrescentar(caminho: string, conteudo: Record<string, unknown>): Promise<void> {
  const texto = atual.get(caminho);
  base[caminho] = texto === undefined ? null : await shaBlob(texto);
  arquivos[caminho] = conteudo;
  if (caminho.startsWith("dados/locais/"))
    pares.push({ antes: lerAtual<Local>(caminho), depois: conteudo as unknown as Local });
}

const agora = new Date();
let restaura: string | undefined;
if (tipo === "confirmacao") {
  const ent =
    lerAtual<Entidade>(caminhoEntidade(entidade)) ?? falhar(`a entidade ${entidade} não existe`);
  const hoje = momentoEmLisboa(agora).data;
  for (const id of ent.locais) {
    const antes = lerAtual<Local>(caminhoLocal(id));
    if (antes) pares.push({ antes, depois: { ...antes, confirmado_em: hoje } });
  }
} else if (tipo === "alteracao" || tipo === "novo-local") {
  if (resto.length === 0) falhar("indique os arquivos editados");
  for (const caminho of resto) {
    await acrescentar(
      caminho,
      parse(readFileSync(join(RAIZ, caminho), "utf8")) as Record<string, unknown>,
    );
  }
} else if (tipo === "restauro") {
  const [commit] = resto;
  if (!commit) falhar("indique o commit a restaurar");
  const sha = git("rev-parse", "--verify", `${commit}^{commit}`).trim();
  const antigo = dadosEm(sha);
  const pEntidade = caminhoEntidade(entidade);
  const entAntiga = antigo.get(pEntidade) ?? falhar(`a entidade não existia em ${sha}`);
  const caminhos = [pEntidade, ...(parse(entAntiga) as Entidade).locais.map(caminhoLocal)];
  for (const caminho of caminhos) {
    const texto = antigo.get(caminho);
    if (texto !== undefined && texto !== atual.get(caminho))
      await acrescentar(caminho, parse(texto) as Record<string, unknown>);
  }
  if (Object.keys(arquivos).length === 0)
    falhar("nada a restaurar: os arquivos já estão como nesse commit");
  restaura = sha;
} else {
  falhar(`tipo desconhecido: ${tipo}`);
}

const pedido = lerPedido({
  versao: 1,
  id: novoIdPedido(),
  tipo,
  emitido_em: agora.toISOString().replace(/\.\d+Z$/, "Z"),
  contacto: { ref: values.contacto, funcao: values.funcao },
  canal: values.canal,
  entidade,
  base,
  ...(tipo !== "confirmacao" && { arquivos }),
  resumo: resumirPedido(pares),
  ...(restaura && { restaura }),
} satisfies Record<string, unknown>);
if (typeof pedido === "string") falhar(`pedido inválido: ${pedido}`);

const simulacao = await prepararPedido(pedido as Pedido, atual, { agora });
if (simulacao.estado !== "pronto") {
  console.error(JSON.stringify(simulacao, null, 2));
  falhar(`a simulação sobre ${REF} deu ${simulacao.estado}`);
}
console.log(simulacao.mensagem);
for (const a of simulacao.alertas) console.log(`⚠ ${a}`);
for (const a of simulacao.avisos) console.log(`⚠ ${a.caminho}: ${a.mensagem}`);

if (values.simular) {
  console.log("\n(simulação: nada foi enviado)");
} else {
  const texto = codificarPedido(pedido as Pedido);
  execFileSync(
    "gh",
    [
      "workflow",
      "run",
      "aplicar-pedido.yml",
      "--ref",
      "main",
      "-f",
      `pedido=${texto}`,
      "-f",
      `assinatura=${await assinar(segredo, texto)}`,
    ],
    { cwd: RAIZ, stdio: "inherit" },
  );
  console.log(
    `\n✓ Pedido ${(pedido as Pedido).id} enviado. Acompanhe com: gh run list --workflow aplicar-pedido.yml`,
  );
}
