/**
 * Leitura do repositório pelo Worker com a GitHub App `missas-guimaraes-painel` (§9.5): só lê
 * conteúdos e (no E4) dispara workflows. A chave privada é um segredo do Worker.
 *
 * A chave vem do GitHub em PKCS#1 ("BEGIN RSA PRIVATE KEY"); o WebCrypto só importa PKCS#8,
 * por isso é embrulhada aqui (sem passo manual de conversão).
 */

export interface EnvGithub {
  GITHUB_PAINEL_APP_ID?: string;
  GITHUB_PAINEL_APP_PRIVATE_KEY?: string;
  /** `dono/repositorio` */
  GITHUB_REPOSITORIO?: string;
}

export type Buscar = typeof fetch;

const API = "https://api.github.com";
const CABECALHOS = {
  accept: "application/vnd.github+json",
  "user-agent": "missas-guimaraes-worker",
  "x-github-api-version": "2022-11-28",
};

function base64ParaBytes(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

function base64Url(bytes: Uint8Array | string): string {
  const dados = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binario = "";
  for (const b of dados) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Comprimento DER. */
function comprimento(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let x = n; x > 0; x >>= 8) bytes.unshift(x & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

/** PKCS#8 (PrivateKeyInfo) a partir de uma chave RSA PKCS#1. */
export function pkcs1ParaPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algoritmo = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  const octetos = [0x04, ...comprimento(pkcs1.length)];
  const versao = [0x02, 0x01, 0x00];
  const interior = versao.length + algoritmo.length + octetos.length + pkcs1.length;
  return Uint8Array.from([
    0x30,
    ...comprimento(interior),
    ...versao,
    ...algoritmo,
    ...octetos,
    ...pkcs1,
  ]);
}

/** Aceita PEM PKCS#1 ou PKCS#8, com quebras de linha ou espaços (colado no painel da Cloudflare). */
export function chaveDoPem(pem: string): Uint8Array {
  const pkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  const corpo = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  const der = base64ParaBytes(corpo);
  return pkcs1 ? pkcs1ParaPkcs8(der) : der;
}

/** JWT da App (RS256, 9 minutos), para pedir o token de instalação. */
export async function jwtDaApp(appId: string, pem: string, agora = new Date()): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    chaveDoPem(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const s = Math.floor(agora.getTime() / 1000);
  const cabecalho = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const carga = base64Url(JSON.stringify({ iat: s - 60, exp: s + 540, iss: appId }));
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(`${cabecalho}.${carga}`),
  );
  return `${cabecalho}.${carga}.${base64Url(new Uint8Array(assinatura))}`;
}

export class ErroGithub extends Error {
  constructor(
    mensagem: string,
    readonly estado: number,
  ) {
    super(mensagem);
    this.name = "ErroGithub";
  }
}

let cacheToken: { repositorio: string; token: string; expira: number } | undefined;

/** Só para testes. */
export function limparCacheToken(): void {
  cacheToken = undefined;
}

async function tokenDeInstalacao(env: EnvGithub, buscar: Buscar, agora: Date): Promise<string> {
  const {
    GITHUB_PAINEL_APP_ID: appId,
    GITHUB_PAINEL_APP_PRIVATE_KEY: pem,
    GITHUB_REPOSITORIO: repo,
  } = env;
  if (!appId || !pem || !repo) throw new ErroGithub("GitHub App não configurada", 503);
  if (
    cacheToken &&
    cacheToken.repositorio === repo &&
    cacheToken.expira - 5 * 60_000 > agora.getTime()
  ) {
    return cacheToken.token;
  }
  const jwt = await jwtDaApp(appId, pem, agora);
  const auth = { ...CABECALHOS, authorization: `Bearer ${jwt}` };
  const instalacao = await buscar(`${API}/repos/${repo}/installation`, { headers: auth });
  if (!instalacao.ok) throw new ErroGithub(`instalação: ${instalacao.status}`, 502);
  const { id } = (await instalacao.json()) as { id: number };
  const resposta = await buscar(`${API}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: auth,
  });
  if (!resposta.ok) throw new ErroGithub(`token: ${resposta.status}`, 502);
  const { token, expires_at } = (await resposta.json()) as { token: string; expires_at: string };
  cacheToken = { repositorio: repo, token, expira: Date.parse(expires_at) };
  return token;
}

export interface Arquivo {
  caminho: string;
  sha: string;
  conteudo: string;
}

/** Lê um arquivo do `main`; `null` se não existir. */
export async function lerArquivo(
  env: EnvGithub,
  caminho: string,
  opcoes: { buscar?: Buscar; agora?: Date } = {},
): Promise<Arquivo | null> {
  const buscar = opcoes.buscar ?? fetch;
  const token = await tokenDeInstalacao(env, buscar, opcoes.agora ?? new Date());
  const url = `${API}/repos/${env.GITHUB_REPOSITORIO}/contents/${caminho.split("/").map(encodeURIComponent).join("/")}?ref=main`;
  const resposta = await buscar(url, {
    headers: { ...CABECALHOS, authorization: `Bearer ${token}` },
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new ErroGithub(`conteúdo: ${resposta.status}`, 502);
  const corpo = (await resposta.json()) as {
    sha: string;
    content: string;
    encoding: string;
    type: string;
  };
  if (corpo.type !== "file" || corpo.encoding !== "base64")
    throw new ErroGithub("não é um arquivo", 502);
  const conteudo = new TextDecoder().decode(base64ParaBytes(corpo.content.replace(/\s+/g, "")));
  return { caminho, sha: corpo.sha, conteudo };
}
