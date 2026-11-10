import { beforeEach, describe, expect, it, vi } from "vitest";
import { identidade, limparCacheChaves, type ObterChaves } from "./identidade.ts";

const EQUIPA = "equipa-teste.cloudflareaccess.com";
const AUD = "aud-da-aplicacao";
const env = { ACCESS_TEAM_DOMAIN: EQUIPA, ACCESS_AUD: AUD };
const AGORA = new Date("2026-11-10T12:00:00Z");
const segundos = Math.floor(AGORA.getTime() / 1000);

function base64Url(bytes: Uint8Array | string): string {
  const dados = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...dados))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function gerarChave(kid: string) {
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
  const publica = (await crypto.subtle.exportKey("jwk", par.publicKey)) as { n: string; e: string };
  return {
    privada: par.privateKey,
    jwk: { kid, kty: "RSA", n: publica.n, e: publica.e, alg: "RS256" },
  };
}

const principal = await gerarChave("chave-1");
const outra = await gerarChave("chave-2");

async function assinar(
  carga: Record<string, unknown>,
  opcoes: { chave?: CryptoKey; kid?: string; alg?: string } = {},
): Promise<string> {
  const cabecalho = base64Url(
    JSON.stringify({ alg: opcoes.alg ?? "RS256", kid: opcoes.kid ?? "chave-1", typ: "JWT" }),
  );
  const corpo = base64Url(JSON.stringify(carga));
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    opcoes.chave ?? principal.privada,
    new TextEncoder().encode(`${cabecalho}.${corpo}`),
  );
  return `${cabecalho}.${corpo}.${base64Url(new Uint8Array(assinatura))}`;
}

const cargaValida = {
  iss: `https://${EQUIPA}`,
  aud: [AUD],
  email: "Pessoa@Exemplo.PT",
  exp: segundos + 3600,
  iat: segundos - 10,
  nbf: segundos - 10,
};

function pedido(token?: string): Request {
  return new Request("https://exemplo.workers.dev/api/eu", {
    headers: token === undefined ? {} : { "cf-access-jwt-assertion": token },
  });
}

let chaves: ObterChaves;
beforeEach(() => {
  limparCacheChaves();
  chaves = vi.fn(async () => [principal.jwk]);
});

const verificar = (token: string | undefined, e = env) =>
  identidade(pedido(token), e, { agora: AGORA, obterChaves: chaves });

describe("identidade (JWT do Access)", () => {
  it("aceita um JWT válido e devolve o e-mail em minúsculas", async () => {
    expect(await verificar(await assinar(cargaValida))).toEqual({ email: "pessoa@exemplo.pt" });
  });

  it("aceita aud como texto", async () => {
    expect(await verificar(await assinar({ ...cargaValida, aud: AUD }))).not.toBeNull();
  });

  it.each([
    ["sem cabeçalho", undefined],
    ["vazio", ""],
    ["lixo", "abc"],
    ["quatro partes", "a.b.c.d"],
    ["base64 inválido", "%%%.%%%.%%%"],
  ])("recusa: %s", async (_caso, token) => {
    expect(await verificar(token)).toBeNull();
  });

  it("recusa assinatura de outra chave com o mesmo kid", async () => {
    expect(await verificar(await assinar(cargaValida, { chave: outra.privada }))).toBeNull();
  });

  it("recusa carga alterada depois de assinada", async () => {
    const token = await assinar(cargaValida);
    const [c, , s] = token.split(".");
    const adulterada = base64Url(JSON.stringify({ ...cargaValida, email: "admin@exemplo.pt" }));
    expect(await verificar(`${c}.${adulterada}.${s}`)).toBeNull();
  });

  it("recusa alg diferente de RS256 (ex.: none, HS256)", async () => {
    const semAssinatura = `${base64Url(JSON.stringify({ alg: "none", kid: "chave-1" }))}.${base64Url(JSON.stringify(cargaValida))}.`;
    expect(await verificar(semAssinatura)).toBeNull();
    expect(await verificar(await assinar(cargaValida, { alg: "HS256" }))).toBeNull();
  });

  it.each([
    ["outra equipa", { iss: "https://outra.cloudflareaccess.com" }],
    ["outra aplicação", { aud: ["outra"] }],
    ["expirado", { exp: segundos - 120 }],
    ["ainda não válido (nbf)", { nbf: segundos + 600 }],
    ["emitido no futuro (iat)", { iat: segundos + 600 }],
    ["sem e-mail", { email: undefined }],
    ["e-mail inválido", { email: "sem-arroba" }],
    ["sem exp", { exp: undefined }],
  ])("recusa: %s", async (_caso, mudanca) => {
    expect(await verificar(await assinar({ ...cargaValida, ...mudanca }))).toBeNull();
  });

  it("aceita relógios com até 60 s de diferença", async () => {
    expect(
      await verificar(await assinar({ ...cargaValida, exp: segundos - 30, iat: segundos + 30 })),
    ).not.toBeNull();
  });

  it("sem configuração do Access, ninguém é identificado", async () => {
    const token = await assinar(cargaValida);
    expect(await verificar(token, { ACCESS_TEAM_DOMAIN: EQUIPA, ACCESS_AUD: "" })).toBeNull();
    expect(await verificar(token, { ACCESS_AUD: AUD } as typeof env)).toBeNull();
  });

  it("kid desconhecido: volta a buscar as chaves uma vez (rotação)", async () => {
    let chamadas = 0;
    chaves = vi.fn(async () => (++chamadas === 1 ? [principal.jwk] : [principal.jwk, outra.jwk]));
    expect(await verificar(await assinar(cargaValida))).not.toBeNull();
    expect(
      await verificar(await assinar(cargaValida, { chave: outra.privada, kid: "chave-2" })),
    ).not.toBeNull();
    expect(chamadas).toBe(2);
    expect(await verificar(await assinar(cargaValida, { kid: "chave-3" }))).toBeNull();
  });

  it("usa a cache das chaves", async () => {
    await verificar(await assinar(cargaValida));
    await verificar(await assinar(cargaValida));
    expect(chaves).toHaveBeenCalledTimes(1);
  });

  it("falha ao obter as chaves: recusa sem lançar", async () => {
    chaves = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await verificar(await assinar(cargaValida))).toBeNull();
  });

  it("chave que não é RSA: recusa", async () => {
    chaves = vi.fn(async () => [{ ...principal.jwk, kty: "EC" }]);
    expect(await verificar(await assinar(cargaValida))).toBeNull();
  });
});
