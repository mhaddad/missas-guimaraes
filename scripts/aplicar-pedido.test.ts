import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  assinar,
  caminhoEntidade,
  caminhoLocal,
  codificarPedido,
  resumirPedido,
  serializar,
  shaBlob,
  type Pedido,
} from "@missas/dados";
import type { Local } from "@missas/horarios";
import {
  aplicar,
  avisarWorker,
  linhaSegura,
  resumoMarkdown,
  type OpcoesAplicar,
} from "./aplicar-pedido.ts";

const SEGREDO = "segredo-de-teste-com-pelo-menos-32-caracteres";
const AGORA = new Date("2026-11-30T11:45:00Z");
const RAIZ_PROJETO = new URL("..", import.meta.url).pathname;
const pastas: string[] = [];

const ENV_GIT = {
  ...process.env,
  GIT_AUTHOR_NAME: "teste",
  GIT_AUTHOR_EMAIL: "teste@exemplo.invalid",
  GIT_COMMITTER_NAME: "teste",
  GIT_COMMITTER_EMAIL: "teste@exemplo.invalid",
};
Object.assign(process.env, ENV_GIT);

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: ENV_GIT }).trim();
}

function local(id: string, entidade: string): Local {
  return {
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [{ tipo: "missa", dias: ["dom"], hora: "10:00" }],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
  } as Local;
}

/** Remoto bare com dados mínimos e um clone de trabalho (como o checkout do Actions). */
function criarRepositorios(): { remoto: string; clone: string } {
  const pasta = mkdtempSync(join(tmpdir(), "aplicar-pedido-"));
  pastas.push(pasta);
  const remoto = join(pasta, "remoto.git");
  const semente = join(pasta, "semente");
  git(pasta, "init", "--quiet", "--bare", "--initial-branch=main", remoto);
  git(pasta, "init", "--quiet", "--initial-branch=main", semente);
  mkdirSync(join(semente, "dados/entidades"), { recursive: true });
  mkdirSync(join(semente, "dados/locais"));
  writeFileSync(
    join(semente, "dados/calendario.yml"),
    readFileSync(join(RAIZ_PROJETO, "dados/calendario.yml"), "utf8"),
  );
  for (const [ent, locais] of [
    ["exemplo", ["igreja-a"]],
    ["outra", ["igreja-c"]],
  ] as const) {
    writeFileSync(
      join(semente, caminhoEntidade(ent)),
      serializar(
        {
          id: ent,
          tipo: "paroquia",
          nome: `Paróquia ${ent}`,
          diocese: "Braga",
          locais: [...locais],
        },
        "entidade",
      ),
    );
    for (const id of locais)
      writeFileSync(join(semente, caminhoLocal(id)), serializar(local(id, ent), "local"));
  }
  git(semente, "add", ".");
  git(semente, "commit", "--quiet", "-m", "dados iniciais");
  git(semente, "remote", "add", "origin", remoto);
  git(semente, "push", "--quiet", "origin", "main");
  const clone = join(pasta, "clone");
  git(pasta, "clone", "--quiet", remoto, clone);
  return { remoto, clone };
}

afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});

async function pedidoDiasSantos(
  clone: string,
  entidade: string,
  id: string,
  sobre: Partial<Pedido> = {},
): Promise<Pedido> {
  const texto = readFileSync(join(clone, caminhoLocal(id)), "utf8");
  const antes = parse(texto) as Local;
  const depois = { ...antes, dias_santos: "horario_domingo" } as Local;
  return {
    versao: 1,
    id: `p_${"0".repeat(15)}${entidade.length}`,
    tipo: "alteracao",
    emitido_em: "2026-11-30T11:42:07Z",
    contacto: { ref: "c_7f3a", funcao: "secretaria" },
    canal: "painel",
    entidade,
    base: { [caminhoLocal(id)]: await shaBlob(texto) },
    arquivos: { [caminhoLocal(id)]: depois as unknown as Record<string, unknown> },
    resumo: resumirPedido([{ antes, depois }]),
    ...sobre,
  };
}

async function opcoes(
  clone: string,
  pedido: Pedido,
  extra: Partial<OpcoesAplicar> = {},
): Promise<OpcoesAplicar> {
  const texto = codificarPedido(pedido);
  return {
    raiz: clone,
    env: { PEDIDO: texto, ASSINATURA: await assinar(SEGREDO, texto), PEDIDO_HMAC: SEGREDO },
    agora: () => AGORA,
    esperar: async () => {},
    registar: () => {},
    ...extra,
  };
}

let repos: { remoto: string; clone: string };
beforeEach(() => {
  repos = criarRepositorios();
});

describe("aplicar-pedido", () => {
  it("grava um commit no main com os trailers, sem segredos nem dados pessoais", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const d = await aplicar(await opcoes(repos.clone, pedido));
    expect(d).toMatchObject({ estado: "GRAVADO", pedido: pedido.id, alertas: [] });
    expect(git(repos.remoto, "rev-parse", "main")).toBe(d.sha);
    const mensagem = git(repos.remoto, "log", "-1", "--format=%B", "main");
    expect(mensagem).toMatch(/^Horários: Paróquia exemplo \(alteração\)/);
    expect(
      git(repos.remoto, "log", "-1", "--format=%(trailers:key=Pedido,valueonly)", "main"),
    ).toBe(pedido.id);
    expect(
      git(repos.remoto, "log", "-1", "--format=%(trailers:key=Contacto,valueonly)", "main"),
    ).toBe("c_7f3a (secretaria)");
    expect(git(repos.remoto, "show", "--stat", "--format=", "main")).toMatch(
      /dados\/locais\/igreja-a\.yml/,
    );
  });

  it("é idempotente: o mesmo pedido outra vez não cria outro commit", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const primeiro = await aplicar(await opcoes(repos.clone, pedido));
    const segundo = await aplicar(
      await opcoes(repos.clone, pedido, { agora: () => new Date("2026-12-31T00:00:00Z") }),
    );
    expect(segundo).toMatchObject({ estado: "GRAVADO", sha: primeiro.sha, repetido: true });
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("2");
  });

  it("dois pedidos de entidades diferentes ao mesmo tempo: rebase e ambos gravados (C30)", async () => {
    const a = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const b = await pedidoDiasSantos(repos.clone, "outra", "igreja-c");
    const outro = join(repos.clone, "..", "outro");
    git(join(repos.clone, ".."), "clone", "--quiet", repos.remoto, outro);
    const opB = await opcoes(outro, b);
    let empurrado = false;
    const d = await aplicar(
      await opcoes(repos.clone, a, {
        antesDoPush: () => {
          if (empurrado) return;
          empurrado = true;
          // Outro commit chega ao main entre o commit e o push do pedido A.
          writeFileSync(join(outro, "marca.txt"), "x");
          git(outro, "add", "marca.txt");
          git(outro, "commit", "--quiet", "-m", "outro commit");
          git(outro, "push", "--quiet", "origin", "main");
        },
      }),
    );
    expect(d.estado).toBe("GRAVADO");
    expect(git(repos.remoto, "log", "--format=%s", "main").split("\n")).toEqual([
      "Horários: Paróquia exemplo (alteração)",
      "outro commit",
      "dados iniciais",
    ]);
    // E o pedido B, de outra entidade, também entra a seguir.
    git(outro, "reset", "--quiet", "--hard", "origin/main");
    expect((await aplicar(opB)).estado).toBe("GRAVADO");
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("4");
  });

  it("CONFLITO quando o arquivo mudou no main (C28)", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const outro = join(repos.clone, "..", "outro");
    git(join(repos.clone, ".."), "clone", "--quiet", repos.remoto, outro);
    const caminho = join(outro, caminhoLocal("igreja-a"));
    writeFileSync(caminho, readFileSync(caminho, "utf8").replace("hora: '10:00'", "hora: '11:00'"));
    git(outro, "commit", "--quiet", "-am", "edição manual");
    git(outro, "push", "--quiet", "origin", "main");
    const d = await aplicar(await opcoes(repos.clone, pedido));
    expect(d).toMatchObject({ estado: "CONFLITO", motivo: expect.stringMatching(/mudou/) });
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("2");
  });

  it("desiste depois de 5 pushes recusados", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const esperas: number[] = [];
    const d = await aplicar(
      await opcoes(repos.clone, pedido, {
        esperar: async (ms) => void esperas.push(ms),
        antesDoPush: () => {
          // Um hook no remoto que recusa todos os pushes.
          writeFileSync(join(repos.remoto, "hooks/pre-receive"), "#!/bin/sh\nexit 1\n", {
            mode: 0o755,
          });
        },
      }),
    );
    expect(d).toMatchObject({ estado: "ERRO", motivo: "push recusado 5 vezes" });
    expect(esperas).toHaveLength(4);
    expect(esperas[0]).toBeGreaterThanOrEqual(2000);
    expect(esperas[3]).toBeGreaterThanOrEqual(16000);
  });

  it.each([
    [
      "assinatura de outro segredo",
      async (o: OpcoesAplicar) => ({
        ...o.env,
        ASSINATURA: await assinar(`${SEGREDO}x`, o.env.PEDIDO ?? ""),
      }),
      "assinatura inválida",
    ],
    [
      "sem assinatura",
      async (o: OpcoesAplicar) => ({ ...o.env, ASSINATURA: undefined }),
      "assinatura inválida",
    ],
    [
      "sem segredo",
      async (o: OpcoesAplicar) => ({ ...o.env, PEDIDO_HMAC: "" }),
      "PEDIDO_HMAC não configurado",
    ],
    [
      "pedido assinado mas mal formado",
      async () => {
        const texto = btoa(JSON.stringify({ versao: 1 }));
        return { PEDIDO: texto, ASSINATURA: await assinar(SEGREDO, texto), PEDIDO_HMAC: SEGREDO };
      },
      "pedido inválido: id",
    ],
  ])("ERRO sem tocar no repositório: %s", async (_caso, mudarEnv, motivo) => {
    const o = await opcoes(repos.clone, await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a"));
    const d = await aplicar({ ...o, env: await mudarEnv(o) });
    expect(d).toMatchObject({ estado: "ERRO", motivo });
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("1");
  });

  it("ERRO se o pedido expirou", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const d = await aplicar(
      await opcoes(repos.clone, pedido, { agora: () => new Date("2026-11-30T12:00:00Z") }),
    );
    expect(d).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/expirou/) });
  });

  it("ERRO se a cópia de trabalho não estiver limpa", async () => {
    writeFileSync(join(repos.clone, "solto.txt"), "x");
    const d = await aplicar(
      await opcoes(repos.clone, await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a")),
    );
    expect(d).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/não está limpa/) });
  });

  it("ERRO de validação com os problemas no resumo", async () => {
    const pedido = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    const depois = {
      ...pedido.arquivos?.[caminhoLocal("igreja-a")],
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "25:00" }],
    };
    const d = await aplicar(
      await opcoes(repos.clone, {
        ...pedido,
        arquivos: { [caminhoLocal("igreja-a")]: depois },
        resumo: [],
      }),
    );
    expect(d).toMatchObject({ estado: "ERRO", motivo: "os dados não passam a validação" });
    expect(resumoMarkdown(d)).toMatch(/- ✗ `dados\/locais\/igreja-a\.yml`/);
  });

  it("confirmação repetida no mesmo dia: GRAVADO sem novo commit", async () => {
    const texto = readFileSync(join(repos.clone, caminhoLocal("igreja-a")), "utf8");
    const antes = parse(texto) as Local;
    const confirmacao: Pedido = {
      ...(await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a")),
      tipo: "confirmacao",
      base: {},
      resumo: resumirPedido([{ antes, depois: { ...antes, confirmado_em: "2026-11-30" } }]),
    };
    delete confirmacao.arquivos;
    expect((await aplicar(await opcoes(repos.clone, confirmacao))).estado).toBe("GRAVADO");
    const segunda = { ...confirmacao, id: "p_ffffffffffffffff", resumo: [] };
    const d = await aplicar(await opcoes(repos.clone, segunda));
    expect(d).toMatchObject({ estado: "GRAVADO" });
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("2");
  });
});

describe("restauro", () => {
  it("repõe a versão de um commit anterior com um commit novo", async () => {
    const inicial = git(repos.clone, "rev-parse", "HEAD");
    const caminho = caminhoLocal("igreja-a");
    const textoInicial = readFileSync(join(repos.clone, caminho), "utf8");
    const alteracao = await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a");
    expect((await aplicar(await opcoes(repos.clone, alteracao))).estado).toBe("GRAVADO");

    const atual = git(repos.clone, "show", `origin/main:${caminho}`);
    const antes = parse(atual) as Local;
    const depois = parse(textoInicial) as Local;
    const restauro: Pedido = {
      ...alteracao,
      id: "p_eeeeeeeeeeeeeeee",
      tipo: "restauro",
      restaura: inicial,
      base: { [caminho]: await shaBlob(`${atual}\n`) },
      arquivos: { [caminho]: depois as unknown as Record<string, unknown> },
      resumo: resumirPedido([{ antes, depois }]),
    };
    const d = await aplicar(await opcoes(repos.clone, restauro));
    expect(d).toMatchObject({ estado: "GRAVADO" });
    expect(git(repos.remoto, "show", `main:${caminho}`)).toBe(textoInicial.trim());
    expect(
      git(repos.remoto, "log", "-1", "--format=%(trailers:key=Restaura,valueonly)", "main"),
    ).toBe(inicial);
    expect(git(repos.remoto, "rev-list", "--count", "main")).toBe("3");

    // Conteúdo que não é o desse commit: recusado.
    const inventado = {
      ...restauro,
      id: "p_dddddddddddddddd",
      base: { [caminho]: await shaBlob(textoInicial) },
    };
    inventado.arquivos = {
      [caminho]: { ...depois, nome: "Inventado" } as unknown as Record<string, unknown>,
    };
    expect(await aplicar(await opcoes(repos.clone, inventado))).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não coincide/),
    });
  });

  it("recusa um commit que não pertence ao main", async () => {
    const pedido: Pedido = {
      ...(await pedidoDiasSantos(repos.clone, "exemplo", "igreja-a")),
      tipo: "restauro",
      restaura: "c".repeat(40),
    };
    expect(await aplicar(await opcoes(repos.clone, pedido))).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não pertence ao histórico/),
    });
  });
});

it("linhaSegura: uma linha, sem marcação", () => {
  expect(linhaSegura("a\n::add-mask::x\r\n<b>")).toBe("a ::add-mask::x &lt;b>");
});

describe("avisarWorker", () => {
  const env = { AVISO_URL: "https://exemplo.invalid/api/interno/estado", AVISO_HMAC: SEGREDO };

  it("envia o estado assinado (com token do Access, se houver)", async () => {
    let pedidoFeito: Request | undefined;
    const buscar = (async (url: string, init: RequestInit) => {
      pedidoFeito = new Request(url, init);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const ok = await avisarWorker(
      { estado: "GRAVADO", pedido: "p_0123456789abcdef", sha: "a".repeat(40), alertas: ["x"] },
      { ...env, CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "segredo" },
      buscar,
      AGORA,
    );
    expect(ok).toBe(true);
    const feito = pedidoFeito as Request;
    const corpo = await feito.text();
    expect(JSON.parse(corpo)).toEqual({
      pedido: "p_0123456789abcdef",
      estado: "GRAVADO",
      em: AGORA.toISOString(),
      sha: "a".repeat(40),
      alertas: ["x"],
    });
    expect(feito.headers.get("x-assinatura")).toBe(await assinar(SEGREDO, corpo));
    expect(feito.headers.get("cf-access-client-id")).toBe("id");
  });

  it("não avisa sem configuração nem sem id; falhas de rede dão false", async () => {
    const falha = (async () => {
      throw new Error("rede");
    }) as typeof fetch;
    expect(await avisarWorker({ estado: "ERRO", pedido: "p_0123456789abcdef" }, {}, falha)).toBe(
      false,
    );
    expect(await avisarWorker({ estado: "ERRO" }, env, falha)).toBe(false);
    expect(
      await avisarWorker({ estado: "ERRO", pedido: "p_0123456789abcdef", motivo: "x" }, env, falha),
    ).toBe(false);
  });
});
