/**
 * Identidade de quem faz o pedido (§7.2, passo 5). REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 * O Worker não confia só na configuração do Cloudflare Access: verifica sempre o JWT que o
 * Access acrescenta (`Cf-Access-Jwt-Assertion`):
 *   - algoritmo RS256 e assinatura com as chaves públicas da equipa (`/cdn-cgi/access/certs`);
 *   - `iss` = a equipa; `aud` contém a aplicação (`ACCESS_AUD`);
 *   - `exp` no futuro e `nbf`/`iat` não no futuro (com 60 s de folga para relógios);
 *   - `email` presente.
 * Qualquer falha devolve `null` (sem identidade). A identidade é obtida só aqui, para que a troca
 * pelo login Google direto (se o limite do Access for ultrapassado, P19) seja local.
 */

export interface EnvIdentidade {
  /** Ex.: `equipa.cloudflareaccess.com` */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) Tag da aplicação do Access. */
  ACCESS_AUD?: string;
}

export interface Identidade {
  /** E-mail em minúsculas, como a Google o confirmou ao Access. */
  email: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export type ObterChaves = (equipa: string) => Promise<Jwk[]>;

const FOLGA_SEGUNDOS = 60;
const DURACAO_CACHE_MS = 60 * 60 * 1000;

let cacheChaves: { equipa: string; chaves: Jwk[]; obtidasEm: number } | undefined;

/** Chaves públicas da equipa do Access, com cache de uma hora no isolado do Worker. */
export const obterChavesAccess: ObterChaves = async (equipa) => {
  const resposta = await fetch(`https://${equipa}/cdn-cgi/access/certs`);
  if (!resposta.ok) throw new Error(`certs ${resposta.status}`);
  const corpo = (await resposta.json()) as { keys?: Jwk[] };
  return corpo.keys ?? [];
};

/** Só para testes. */
export function limparCacheChaves(): void {
  cacheChaves = undefined;
}

function base64UrlParaBytes(texto: string): Uint8Array {
  const base64 = texto
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(texto.length / 4) * 4, "=");
  const binario = atob(base64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

function lerJson(parte: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(parte)));
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function chavesDaEquipa(
  equipa: string,
  obter: ObterChaves,
  agora: number,
  forcar: boolean,
): Promise<Jwk[]> {
  if (
    !forcar &&
    cacheChaves &&
    cacheChaves.equipa === equipa &&
    agora - cacheChaves.obtidasEm < DURACAO_CACHE_MS
  ) {
    return cacheChaves.chaves;
  }
  const chaves = await obter(equipa);
  cacheChaves = { equipa, chaves, obtidasEm: agora };
  return chaves;
}

/**
 * Verifica o JWT do Access e devolve a identidade, ou `null`. Nunca lança: erros de rede ou de
 * configuração também resultam em `null` (fechado por omissão).
 */
export async function identidade(
  pedido: Request,
  env: EnvIdentidade,
  opcoes: { agora?: Date; obterChaves?: ObterChaves } = {},
): Promise<Identidade | null> {
  const equipa = env.ACCESS_TEAM_DOMAIN;
  const audiencia = env.ACCESS_AUD;
  if (!equipa || !audiencia) return null;

  const token = pedido.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [parteCabecalho, parteCarga, parteAssinatura] = partes as [string, string, string];

  const cabecalho = lerJson(parteCabecalho);
  const carga = lerJson(parteCarga);
  if (!cabecalho || !carga) return null;
  if (cabecalho.alg !== "RS256" || typeof cabecalho.kid !== "string") return null;

  const agoraMs = (opcoes.agora ?? new Date()).getTime();
  const obter = opcoes.obterChaves ?? obterChavesAccess;

  let jwk: Jwk | undefined;
  try {
    jwk = (await chavesDaEquipa(equipa, obter, agoraMs, false)).find(
      (k) => k.kid === cabecalho.kid,
    );
    // Chave nova (rotação no Access): volta a buscar uma vez.
    if (!jwk)
      jwk = (await chavesDaEquipa(equipa, obter, agoraMs, true)).find(
        (k) => k.kid === cabecalho.kid,
      );
  } catch {
    return null;
  }
  if (!jwk || jwk.kty !== "RSA") return null;

  let valida: boolean;
  try {
    const chave = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valida = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      chave,
      base64UrlParaBytes(parteAssinatura),
      new TextEncoder().encode(`${parteCabecalho}.${parteCarga}`),
    );
  } catch {
    return null;
  }
  if (!valida) return null;

  const agora = Math.floor(agoraMs / 1000);
  if (carga.iss !== `https://${equipa}`) return null;
  const aud = carga.aud;
  if (!(aud === audiencia || (Array.isArray(aud) && aud.includes(audiencia)))) return null;
  if (typeof carga.exp !== "number" || carga.exp + FOLGA_SEGUNDOS < agora) return null;
  if (typeof carga.nbf === "number" && carga.nbf - FOLGA_SEGUNDOS > agora) return null;
  if (typeof carga.iat === "number" && carga.iat - FOLGA_SEGUNDOS > agora) return null;
  if (typeof carga.email !== "string" || !carga.email.includes("@")) return null;

  return { email: carga.email.trim().toLowerCase() };
}
