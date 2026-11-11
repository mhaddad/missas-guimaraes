import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pedidosPublicados } from "./avisar-publicacao.ts";

const pasta = mkdtempSync(join(tmpdir(), "avisar-publicacao-"));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "teste",
  GIT_AUTHOR_EMAIL: "teste@exemplo.invalid",
  GIT_COMMITTER_NAME: "teste",
  GIT_COMMITTER_EMAIL: "teste@exemplo.invalid",
};
const BOT = {
  GIT_COMMITTER_NAME: "missas-guimaraes-bot[bot]",
  GIT_COMMITTER_EMAIL: "123+missas-guimaraes-bot[bot]@users.noreply.github.com",
};
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: pasta, encoding: "utf8", env }).trim();
const gitBot = (...args: string[]) =>
  execFileSync("git", args, { cwd: pasta, encoding: "utf8", env: { ...env, ...BOT } }).trim();

git("init", "--quiet", "--initial-branch=main");
const commit = (mensagem: string, comoBot = true) => {
  (comoBot ? gitBot : git)("commit", "--quiet", "--allow-empty", "-m", mensagem);
  return git("rev-parse", "HEAD");
};
const anterior = commit("deploy anterior\n\nPedido: p_000000000000aaaa");
const a = commit(
  "Horários: A (alteração)\n\nIgreja A\n\nPedido: p_000000000000bbbb\nContacto: c_7f3a (pároco)",
);
commit("Edição manual por PR", false);
// Um PR que copia o trailer de um pedido que falhou não o marca como publicado.
commit("Copia\n\nPedido: p_000000000000dddd", false);
const c = commit("Horários: C (confirmação)\n\nPedido: p_000000000000cccc\nCanal: painel");

describe("pedidosPublicados", () => {
  it("lê os trailers Pedido dos commits desde o deploy anterior, por ordem", () => {
    expect(pedidosPublicados(pasta, anterior)).toEqual([
      { pedido: "p_000000000000bbbb", sha: a },
      { pedido: "p_000000000000cccc", sha: c },
    ]);
  });

  it("sem deploy anterior válido, não avisa ninguém", () => {
    expect(pedidosPublicados(pasta, "")).toEqual([]);
    expect(pedidosPublicados(pasta, "não-é-sha")).toEqual([]);
    expect(pedidosPublicados(pasta, "f".repeat(40))).toEqual([]);
  });
});
