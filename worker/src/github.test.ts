import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chaveDoPem,
  ErroGithub,
  jwtDaApp,
  lerArquivo,
  limparCacheToken,
  type Buscar,
} from "./github.ts";

function pem(der: Uint8Array, rotulo: string): string {
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${rotulo}-----\n${b64}\n-----END ${rotulo}-----\n`;
}

const par = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const derPkcs8 = new Uint8Array(
  (await crypto.subtle.exportKey("pkcs8", par.privateKey)) as ArrayBuffer,
);
// Numa chave RSA de 2048 bits, o PKCS#8 é um cabeçalho de 26 bytes seguido do PKCS#1.
const pemPkcs1 = pem(derPkcs8.slice(26), "RSA PRIVATE KEY");
const pemPkcs8 = pem(derPkcs8, "PRIVATE KEY");

async function verificarAssinatura(jwt: string): Promise<boolean> {
  const [c, p, s] = jwt.split(".") as [string, string, string];
  const assinatura = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (x) =>
    x.charCodeAt(0),
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    par.publicKey,
    assinatura,
    new TextEncoder().encode(`${c}.${p}`),
  );
}

const AGORA = new Date("2026-11-10T12:00:00Z");
const env = {
  GITHUB_PAINEL_APP_ID: "123",
  GITHUB_PAINEL_APP_PRIVATE_KEY: pemPkcs1,
  GITHUB_REPOSITORIO: "dono/repo",
};

beforeEach(() => limparCacheToken());

describe("chave da GitHub App", () => {
  it("PKCS#1 (como o GitHub a entrega) assina um JWT válido", async () => {
    const jwt = await jwtDaApp("123", pemPkcs1, AGORA);
    expect(await verificarAssinatura(jwt)).toBe(true);
    const carga = JSON.parse(
      atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, number | string>;
    expect(carga).toEqual({ iat: 1794312000 - 60, exp: 1794312000 + 540, iss: "123" });
  });

  it("o embrulho PKCS#1 → PKCS#8 dá exatamente o PKCS#8 original", () => {
    expect(chaveDoPem(pemPkcs1)).toEqual(derPkcs8);
  });

  it("aceita PKCS#8 e PEM colado numa só linha", async () => {
    await expect(jwtDaApp("1", pemPkcs8, AGORA)).resolves.toMatch(/^ey/);
    const numaLinha = pemPkcs1.replace(/\n/g, " ");
    expect(chaveDoPem(numaLinha)).toEqual(chaveDoPem(pemPkcs1));
  });
});

describe("leitura do repositório", () => {
  function githubFalso(arquivos: Record<string, string>) {
    const chamadas: string[] = [];
    const buscar = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      chamadas.push(`${init?.method ?? "GET"} ${u.replace("https://api.github.com", "")}`);
      if (u.endsWith("/repos/dono/repo/installation")) return Response.json({ id: 42 });
      if (u.endsWith("/app/installations/42/access_tokens"))
        return Response.json({ token: "tk", expires_at: "2026-11-10T13:00:00Z" });
      const m = /\/contents\/(.+)\?ref=main$/.exec(u);
      const caminho = m ? decodeURIComponent(m[1] ?? "") : "";
      if (caminho in arquivos) {
        const content = btoa(
          String.fromCharCode(...new TextEncoder().encode(arquivos[caminho] ?? "")),
        );
        return Response.json({ type: "file", encoding: "base64", sha: `sha-${caminho}`, content });
      }
      return new Response("", { status: 404 });
    }) as unknown as Buscar;
    return { buscar, chamadas };
  }

  it("obtém o token de instalação uma vez e lê arquivos (UTF-8) do main", async () => {
    const { buscar, chamadas } = githubFalso({ "dados/locais/a.yml": "nome: São Dâmaso\n" });
    expect(await lerArquivo(env, "dados/locais/a.yml", { buscar, agora: AGORA })).toEqual({
      caminho: "dados/locais/a.yml",
      sha: "sha-dados/locais/a.yml",
      conteudo: "nome: São Dâmaso\n",
    });
    expect(await lerArquivo(env, "dados/locais/b.yml", { buscar, agora: AGORA })).toBeNull();
    expect(chamadas).toEqual([
      "GET /repos/dono/repo/installation",
      "POST /app/installations/42/access_tokens",
      "GET /repos/dono/repo/contents/dados/locais/a.yml?ref=main",
      "GET /repos/dono/repo/contents/dados/locais/b.yml?ref=main",
    ]);
  });

  it("sem configuração: ErroGithub 503; falhas do GitHub: 502", async () => {
    await expect(lerArquivo({}, "x")).rejects.toMatchObject({ estado: 503 });
    const falha = vi.fn(async () => new Response("", { status: 500 })) as unknown as Buscar;
    await expect(lerArquivo(env, "x", { buscar: falha, agora: AGORA })).rejects.toBeInstanceOf(
      ErroGithub,
    );
  });
});
