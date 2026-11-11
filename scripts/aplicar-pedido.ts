/**
 * Aplica um pedido assinado ao `main` (§8.4). Corre só no GitHub Actions (`aplicar-pedido.yml`).
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 * Variáveis de ambiente:
 *   PEDIDO, ASSINATURA      inputs do workflow (base64 e HMAC em hexadecimal)
 *   PEDIDO_HMAC             segredo partilhado com o Worker
 *   AVISO_URL, AVISO_HMAC   opcionais: aviso do estado ao Worker (`POST /api/interno/estado`)
 *   CF_ACCESS_CLIENT_ID/SECRET  opcionais: token de serviço do Access (homologação)
 *   TOKEN_ESCRITA           token da App de escrita; só o `git push` o recebe (por variáveis
 *                           GIT_CONFIG_*, nunca em `.git/config` nem nos argumentos)
 *   VERIFICAR_BUILD=1       corre `npm run build` antes do commit (§8.3, ponto 8), sem segredos
 *                           no ambiente
 *
 * Passos: assinatura → estrutura → prazo (15 min) → idempotência (trailer `Pedido:` já no `main`)
 * → até 5 tentativas de: `main` atual, comparação dos SHA, aplicação, validação, commit e push.
 * Os textos do pedido nunca passam por uma shell: o Git recebe argumentos e a mensagem por stdin.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assinar,
  descodificarPedido,
  lerPedido,
  pedidoDentroDoPrazo,
  prepararPedido,
  verificarAssinatura,
  type Pedido,
  type ProblemaDados,
} from "@missas/dados";

export type Estado = "GRAVADO" | "CONFLITO" | "ERRO" | "PUBLICADO";

export interface Desfecho {
  estado: Estado;
  pedido?: string;
  sha?: string;
  motivo?: string;
  problemas?: ProblemaDados[];
  alertas?: string[];
  /** O pedido já estava no `main` (repetição do mesmo disparo). */
  repetido?: boolean;
}

export interface OpcoesAplicar {
  raiz: string;
  env: Record<string, string | undefined>;
  agora?: () => Date;
  esperar?: (ms: number) => Promise<void>;
  /** Só para testes: corre antes de cada push (para simular outro pedido a chegar primeiro). */
  antesDoPush?: (tentativa: number) => void;
  registar?: (texto: string) => void;
}

const TENTATIVAS = 5;
const RAMO = "main";

function git(raiz: string, args: string[], entrada?: string, token?: string): string {
  return execFileSync("git", args, {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...(entrada !== undefined && { input: entrada }),
    ...(token && {
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${btoa(`x-access-token:${token}`)}`,
      },
    }),
  }).trim();
}

/** Ambiente mínimo para o build: as dependências do site não veem segredos nem o token. */
function ambienteDoBuild(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const chave of ["PATH", "HOME", "TMPDIR", "LANG", "CI"]) {
    const valor = process.env[chave];
    if (valor !== undefined) env[chave] = valor;
  }
  return env;
}

/** Texto numa linha só, para os logs e anotações públicos do Actions. */
export function linhaSegura(texto: string): string {
  return texto.replace(/\s+/g, " ").replace(/</g, "&lt;").trim();
}

/** Mensagem de uma anotação (`::error::…`): uma linha, com `%` escapado como o Actions pede. */
function anotacao(texto: string): string {
  return linhaSegura(texto).replace(/%/g, "%25");
}

function lerDados(raiz: string): Map<string, string> {
  const repo = new Map<string, string>();
  repo.set("dados/calendario.yml", readFileSync(join(raiz, "dados/calendario.yml"), "utf8"));
  for (const pasta of ["dados/entidades", "dados/locais"]) {
    for (const nome of readdirSync(join(raiz, pasta)).sort()) {
      if (nome.endsWith(".yml"))
        repo.set(`${pasta}/${nome}`, readFileSync(join(raiz, pasta, nome), "utf8"));
    }
  }
  return repo;
}

/** Commit do `main` que já aplicou este pedido, se houver. */
function commitDoPedido(raiz: string, id: string): string | undefined {
  const linhas = git(raiz, [
    "log",
    `origin/${RAMO}`,
    "--format=%H %(trailers:key=Pedido,valueonly,separator=%x2C)",
  ]).split("\n");
  for (const linha of linhas) {
    const [sha, valores = ""] = linha.split(" ");
    if (valores.split(",").includes(id)) return sha;
  }
  return undefined;
}

export async function aplicar(opcoes: OpcoesAplicar): Promise<Desfecho> {
  const { raiz, env } = opcoes;
  const agora = opcoes.agora ?? (() => new Date());
  const esperar = opcoes.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const registar = opcoes.registar ?? ((t: string) => console.log(t));

  const texto = env.PEDIDO ?? "";
  const segredo = env.PEDIDO_HMAC ?? "";
  if (!segredo) return { estado: "ERRO", motivo: "PEDIDO_HMAC não configurado" };
  if (!(await verificarAssinatura(segredo, texto, env.ASSINATURA ?? "")))
    return { estado: "ERRO", motivo: "assinatura inválida" };

  const lido = lerPedido(descodificarPedido(texto));
  if (typeof lido === "string") return { estado: "ERRO", motivo: `pedido inválido: ${lido}` };
  const pedido: Pedido = lido;
  const comId = (d: Desfecho): Desfecho => ({ ...d, pedido: pedido.id });

  if (git(raiz, ["status", "--porcelain"]) !== "")
    return comId({ estado: "ERRO", motivo: "a cópia de trabalho não está limpa" });

  git(raiz, ["fetch", "--quiet", "origin", RAMO]);
  const anterior = commitDoPedido(raiz, pedido.id);
  if (anterior) return comId({ estado: "GRAVADO", sha: anterior, repetido: true });
  if (!pedidoDentroDoPrazo(pedido, agora()))
    return comId({ estado: "ERRO", motivo: "o pedido expirou (mais de 15 minutos)" });

  let versaoRestaurada: ((caminho: string) => string | undefined) | undefined;
  if (pedido.restaura) {
    const commit = pedido.restaura;
    try {
      git(raiz, ["merge-base", "--is-ancestor", commit, `origin/${RAMO}`]);
    } catch {
      return comId({
        estado: "ERRO",
        motivo: "restauro: o commit não pertence ao histórico do main",
      });
    }
    versaoRestaurada = (caminho) => {
      try {
        return git(raiz, ["show", `${commit}:${caminho}`]);
      } catch {
        return undefined;
      }
    };
  }

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (tentativa > 1) {
      await esperar(1000 * 2 ** (tentativa - 1) + Math.floor(Math.random() * 1000));
      git(raiz, ["fetch", "--quiet", "origin", RAMO]);
      // Outra execução do mesmo pedido pode ter gravado entretanto.
      const gravado = commitDoPedido(raiz, pedido.id);
      if (gravado) return comId({ estado: "GRAVADO", sha: gravado, repetido: true });
    }
    git(raiz, ["checkout", "--quiet", "-B", RAMO, `origin/${RAMO}`]);
    git(raiz, ["reset", "--quiet", "--hard", `origin/${RAMO}`]);

    const r = await prepararPedido(pedido, lerDados(raiz), {
      agora: agora(),
      ...(versaoRestaurada && { versaoRestaurada }),
    });
    if (r.estado === "CONFLITO") return comId({ estado: "CONFLITO", motivo: r.motivo });
    if (r.estado === "ERRO")
      return comId({
        estado: "ERRO",
        motivo: r.motivo,
        ...(r.problemas && { problemas: r.problemas }),
      });
    // Nada a gravar (ex.: segunda confirmação no mesmo dia): sem commit, por isso sem SHA.
    if (r.estado === "sem_alteracoes")
      return comId({ estado: "GRAVADO", motivo: "sem alterações" });

    for (const a of r.escritos) writeFileSync(join(raiz, a.caminho), a.conteudo);
    if (tentativa === 1 && env.VERIFICAR_BUILD === "1") {
      try {
        execFileSync("npm", ["run", "build"], {
          cwd: raiz,
          stdio: "inherit",
          env: ambienteDoBuild(),
        });
      } catch {
        return comId({ estado: "ERRO", motivo: "o build do site falhou com estes dados" });
      }
    }
    git(raiz, ["add", "--", ...r.escritos.map((a) => a.caminho)]);
    git(raiz, ["commit", "--quiet", "--file=-"], r.mensagem);
    const sha = git(raiz, ["rev-parse", "HEAD"]);

    opcoes.antesDoPush?.(tentativa);
    try {
      git(
        raiz,
        ["push", "--quiet", "origin", `HEAD:refs/heads/${RAMO}`],
        undefined,
        env.TOKEN_ESCRITA,
      );
      return comId({ estado: "GRAVADO", sha, alertas: r.alertas });
    } catch (e) {
      registar(`Tentativa ${tentativa}: push recusado (${(e as Error).message.split("\n")[0]})`);
    }
  }
  return comId({ estado: "ERRO", motivo: `push recusado ${TENTATIVAS} vezes` });
}

/** Aviso assinado ao Worker. Falhar o aviso não desfaz a gravação: só fica registado. */
export async function avisarWorker(
  desfecho: Desfecho,
  env: Record<string, string | undefined>,
  buscar: typeof fetch = fetch,
  agora = new Date(),
): Promise<boolean> {
  if (!env.AVISO_URL || !env.AVISO_HMAC || !desfecho.pedido) return false;
  const corpo = JSON.stringify({
    pedido: desfecho.pedido,
    estado: desfecho.estado,
    em: agora.toISOString(),
    ...(desfecho.sha && { sha: desfecho.sha }),
    ...(desfecho.motivo && { motivo: desfecho.motivo }),
    ...(desfecho.alertas?.length && { alertas: desfecho.alertas }),
  });
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
    "x-assinatura": await assinar(env.AVISO_HMAC, corpo),
  };
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    cabecalhos["cf-access-client-id"] = env.CF_ACCESS_CLIENT_ID;
    cabecalhos["cf-access-client-secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  try {
    const resposta = await buscar(env.AVISO_URL, {
      method: "POST",
      headers: cabecalhos,
      body: corpo,
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

export function resumoMarkdown(d: Desfecho): string {
  const linhas = [
    `### Pedido ${d.pedido ?? "(sem id)"}: ${d.estado}${d.repetido ? " (já aplicado)" : ""}`,
  ];
  if (d.sha) linhas.push(`Commit: \`${d.sha}\``);
  if (d.motivo) linhas.push(`Motivo: ${linhaSegura(d.motivo)}`);
  for (const p of d.problemas ?? [])
    linhas.push(`- ✗ \`${p.caminho}\`: ${linhaSegura(p.mensagem)}`);
  for (const a of d.alertas ?? []) linhas.push(`- ⚠ ${linhaSegura(a)}`);
  return `${linhas.join("\n\n")}\n`;
}

async function principal(): Promise<void> {
  const env = process.env;
  const raiz = new URL("..", import.meta.url).pathname;
  const desfecho = await aplicar({ raiz, env });
  const texto = resumoMarkdown(desfecho);
  console.log(texto);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, texto);
  if (env.AVISO_URL && !(await avisarWorker(desfecho, env)))
    console.log("::warning::Não foi possível avisar o Worker do estado do pedido.");
  if (desfecho.estado === "ERRO") {
    console.log(`::error::${anotacao(desfecho.motivo ?? "erro")}`);
    process.exitCode = 1;
  } else if (desfecho.estado === "CONFLITO") {
    console.log(`::notice::Conflito: ${anotacao(desfecho.motivo ?? "")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await principal();
