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
  async list({
    prefix = "",
    limit = 1000,
  }: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.dados.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .slice(0, limit)
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

/** Chave privada (PEM PKCS#8) para uma GitHub App de teste. */
export async function chaveAppDeTeste(): Promise<string> {
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
  const der = new Uint8Array(
    (await crypto.subtle.exportKey("pkcs8", par.privateKey)) as ArrayBuffer,
  );
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
}

async function sha1Blob(texto: string): Promise<string> {
  const corpo = new TextEncoder().encode(texto);
  const tudo = new Uint8Array([...new TextEncoder().encode(`blob ${corpo.length}\0`), ...corpo]);
  const resumo = await crypto.subtle.digest("SHA-1", tudo);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface GithubFalso {
  buscar: typeof fetch;
  chamadas: string[];
  disparos: { workflow: string; ref: string; inputs: Record<string, string> }[];
}

/**
 * API do GitHub em memória para o repositório `dono/repo`: conteúdos do `main` (`arquivos`) e de
 * commits antigos (`revisoes`), disparo de workflows e lista de commits por caminho.
 */
export function githubFalso(opcoes: {
  arquivos: Record<string, string>;
  revisoes?: Record<string, Record<string, string>>;
  commits?: Record<string, { sha: string; data: string; mensagem: string }[]>;
  falharDisparo?: boolean;
}): GithubFalso {
  const chamadas: string[] = [];
  const disparos: GithubFalso["disparos"] = [];
  const buscar = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url).replace("https://api.github.com", "");
    chamadas.push(`${init?.method ?? "GET"} ${u}`);
    if (u === "/repos/dono/repo/installation") return Response.json({ id: 42 });
    if (u === "/app/installations/42/access_tokens")
      return Response.json({ token: "tk", expires_at: "2099-01-01T00:00:00Z" });
    const disparo = /^\/repos\/dono\/repo\/actions\/workflows\/([^/]+)\/dispatches$/.exec(u);
    if (disparo && init?.method === "POST") {
      if (opcoes.falharDisparo) return new Response("", { status: 422 });
      const corpo = JSON.parse(String(init.body)) as {
        ref: string;
        inputs: Record<string, string>;
      };
      disparos.push({ workflow: decodeURIComponent(disparo[1] ?? ""), ...corpo });
      return new Response(null, { status: 204 });
    }
    const conteudo = /^\/repos\/dono\/repo\/contents\/(.+)\?ref=([0-9a-z]+)$/.exec(u);
    if (conteudo) {
      const caminho = decodeURIComponent(conteudo[1] ?? "");
      const ref = conteudo[2] ?? "main";
      const fonte = ref === "main" ? opcoes.arquivos : (opcoes.revisoes?.[ref] ?? {});
      const texto = fonte[caminho];
      if (texto === undefined) return new Response("", { status: 404 });
      const bytes = new TextEncoder().encode(texto);
      return Response.json({
        type: "file",
        encoding: "base64",
        sha: await sha1Blob(texto),
        content: btoa(String.fromCharCode(...bytes)),
      });
    }
    const comparacao = /^\/repos\/dono\/repo\/compare\/([0-9a-f]{40})\.\.\.main$/.exec(u);
    if (comparacao) {
      const sha = comparacao[1] ?? "";
      return Response.json({ status: sha in (opcoes.revisoes ?? {}) ? "ahead" : "diverged" });
    }
    const commits = /^\/repos\/dono\/repo\/commits\?(.+)$/.exec(u);
    if (commits) {
      const caminho = new URLSearchParams(commits[1]).get("path") ?? "";
      return Response.json(
        (opcoes.commits?.[caminho] ?? []).map((c) => ({
          sha: c.sha,
          commit: { message: c.mensagem, committer: { date: c.data } },
        })),
      );
    }
    return new Response("", { status: 404 });
  };
  return { buscar: buscar as typeof fetch, chamadas, disparos };
}
