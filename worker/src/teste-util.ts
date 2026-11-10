/** Utilitários só para testes do Worker: KV em memória e JWT do Access assinado localmente. */
import type { ObterChaves } from "./identidade.ts";

export class KVMemoria {
  dados = new Map<string, string>();
  async get(chave: string, tipo?: "json" | "text") {
    const v = this.dados.get(chave);
    if (v === undefined) return null;
    return tipo === "json" ? JSON.parse(v) : v;
  }
  async put(chave: string, valor: string) {
    this.dados.set(chave, valor);
  }
  async delete(chave: string) {
    this.dados.delete(chave);
  }
  async list({ prefix = "" }: { prefix?: string; cursor?: string } = {}) {
    const keys = [...this.dados.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));
    return { keys, list_complete: true, cursor: "" };
  }
  comoKV(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}

function base64Url(bytes: Uint8Array | string): string {
  const dados = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...dados))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function criarAccessFalso(equipa: string, aud: string) {
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
  const obterChaves: ObterChaves = async () => [
    { kid: "k1", kty: "RSA", n: publica.n, e: publica.e },
  ];
  async function token(email: string, agora: Date): Promise<string> {
    const s = Math.floor(agora.getTime() / 1000);
    const cabecalho = base64Url(JSON.stringify({ alg: "RS256", kid: "k1" }));
    const carga = base64Url(
      JSON.stringify({ iss: `https://${equipa}`, aud: [aud], email, exp: s + 3600, iat: s }),
    );
    const assinatura = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      par.privateKey,
      new TextEncoder().encode(`${cabecalho}.${carga}`),
    );
    return `${cabecalho}.${carga}.${base64Url(new Uint8Array(assinatura))}`;
  }
  return { obterChaves, token };
}
