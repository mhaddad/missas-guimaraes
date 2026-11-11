/**
 * Depois de um deploy bem sucedido (§8.5): lê os *trailers* `Pedido:` dos commits publicados desde
 * o deploy anterior e avisa o Worker de que esses pedidos estão `PUBLICADO`.
 *
 * Variáveis: ANTERIOR (commit do último deploy bem sucedido; vazio no primeiro), AVISO_URL,
 * AVISO_HMAC e, na homologação, CF_ACCESS_CLIENT_ID/SECRET. Uma falha num aviso não falha o
 * deploy: fica um aviso no log.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PADRAO_ID_PEDIDO } from "@missas/dados";
import { avisarWorker } from "./aplicar-pedido.ts";

const PADRAO_SHA = /^[0-9a-f]{40}$/;
/** Só os commits gravados pela App de escrita contam (um trailer copiado num PR não). */
export const COMMITTER_BOT = /^\d+\+missas-guimaraes-bot\[bot\]@users\.noreply\.github\.com$/;

/** Pedidos dos commits do bot em `anterior..HEAD`, do mais antigo para o mais recente. */
export function pedidosPublicados(
  raiz: string,
  anterior: string,
  committer: RegExp = COMMITTER_BOT,
): { pedido: string; sha: string }[] {
  if (!PADRAO_SHA.test(anterior)) return [];
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("merge-base", "--is-ancestor", anterior, "HEAD");
  } catch {
    return [];
  }
  const saida = git(
    "log",
    "--reverse",
    "--format=%H %ce %(trailers:key=Pedido,valueonly,separator=%x2C)",
    `${anterior}..HEAD`,
  );
  return saida.split("\n").flatMap((linha) => {
    const [sha = "", email = "", valores = ""] = linha.trim().split(" ");
    if (!committer.test(email)) return [];
    return valores
      .split(",")
      .filter((p) => PADRAO_ID_PEDIDO.test(p))
      .map((pedido) => ({ pedido, sha }));
  });
}

async function principal(): Promise<void> {
  const env = process.env;
  const raiz = new URL("..", import.meta.url).pathname;
  const pedidos = pedidosPublicados(raiz, env.ANTERIOR ?? "");
  for (const { pedido, sha } of pedidos) {
    const ok = await avisarWorker({ estado: "PUBLICADO", pedido, sha }, env);
    console.log(
      `${ok ? "✓" : "::warning::Não foi possível avisar:"} ${pedido} (${sha.slice(0, 7)})`,
    );
  }
  console.log(`${pedidos.length} pedido(s) publicado(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await principal();
