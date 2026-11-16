/**
 * Login com a conta Google, feito pelo Worker (ADR-005; substitui o Cloudflare Access).
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 *   GET  /auth/entrar?voltar=/admin/…   guarda state, verificador PKCE e nonce; vai ao Google
 *   GET  /auth/retorno?code&state        troca o código, verifica o ID token e abre a sessão
 *   POST /auth/sair                      termina a sessão
 *
 * O ID token é verificado aqui: RS256 com as chaves públicas do Google, `iss`, `aud` (o nosso
 * client id), `exp`/`iat` com 60 s de folga, `nonce` e `email_verified`. Só entra quem estiver
 * registado e ativo no ecrã *Acessos*; os outros vão para "sem acesso", sem sessão.
 */
import { obterPorEmail, podeEntrar } from "./contactos.ts";
import {
  aleatorio,
  base64Url,
  cookieSessao,
  criarSessao,
  DURACAO_SESSAO_MS,
  lerCookie,
  sha256Hex,
  terminarSessao,
} from "./sessao.ts";

export interface EnvGoogle {
  BD?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Limite de pedidos a /auth/entrar e /auth/retorno, por IP. */
  LIMITE_ENTRADAS?: RateLimit;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

export type ObterChaves = () => Promise<Jwk[]>;
export type Buscar = typeof fetch;

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CERTIFICADOS = "https://www.googleapis.com/oauth2/v3/certs";
const EMISSORES = ["https://accounts.google.com", "accounts.google.com"];
const FOLGA_S = 60;
const DURACAO_ENTRADA_MS = 10 * 60 * 1000;
const DURACAO_CACHE_MS = 60 * 60 * 1000;
/** Prende o login ao navegador que o começou (contra login CSRF e injeção do código). */
const COOKIE_ENTRADA = "__Host-entrada";

let cacheChaves: { chaves: Jwk[]; obtidasEm: number } | undefined;

/** Só para testes. */
export function limparCacheChaves(): void {
  cacheChaves = undefined;
}

export const obterChavesGoogle: ObterChaves = async () => {
  const resposta = await fetch(CERTIFICADOS);
  if (!resposta.ok) throw new Error(`certs ${resposta.status}`);
  return ((await resposta.json()) as { keys?: Jwk[] }).keys ?? [];
};

function base64UrlParaBytes(texto: string): Uint8Array {
  const b64 = texto
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(texto.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function lerParte(parte: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(parte)));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function chave(kid: string, obter: ObterChaves, agora: number): Promise<Jwk | undefined> {
  const procurar = (lista: Jwk[]) => lista.find((k) => k.kid === kid);
  if (cacheChaves && agora - cacheChaves.obtidasEm < DURACAO_CACHE_MS) {
    const k = procurar(cacheChaves.chaves);
    if (k) return k;
  }
  // Primeira vez, cache expirada ou chave nova (rotação): volta a buscar uma vez.
  cacheChaves = { chaves: await obter(), obtidasEm: agora };
  return procurar(cacheChaves.chaves);
}

/**
 * Verifica o ID token do Google e devolve o e-mail (minúsculas), ou `null`. Nunca lança.
 */
export async function verificarIdToken(
  token: string,
  opcoes: { clientId: string; nonce: string; agora?: Date; obterChaves?: ObterChaves },
): Promise<string | null> {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [c, p, a] = partes as [string, string, string];
  const cabecalho = lerParte(c);
  const carga = lerParte(p);
  if (!cabecalho || !carga) return null;
  if (cabecalho.alg !== "RS256" || typeof cabecalho.kid !== "string") return null;
  const agoraMs = (opcoes.agora ?? new Date()).getTime();
  try {
    const jwk = await chave(cabecalho.kid, opcoes.obterChaves ?? obterChavesGoogle, agoraMs);
    if (!jwk || jwk.kty !== "RSA") return null;
    const chavePublica = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valida = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      chavePublica,
      base64UrlParaBytes(a),
      new TextEncoder().encode(`${c}.${p}`),
    );
    if (!valida) return null;
  } catch {
    return null;
  }
  const agora = Math.floor(agoraMs / 1000);
  if (!EMISSORES.includes(String(carga.iss))) return null;
  // Só para nós: `aud` tem de ser exatamente o nosso client id.
  if (carga.aud !== opcoes.clientId) return null;
  if (typeof carga.exp !== "number" || carga.exp + FOLGA_S < agora) return null;
  if (typeof carga.iat === "number" && carga.iat - FOLGA_S > agora) return null;
  if (carga.nonce !== opcoes.nonce) return null;
  if (carga.email_verified !== true) return null;
  if (typeof carga.email !== "string" || !carga.email.includes("@")) return null;
  return carga.email.trim().toLowerCase();
}

/** Só caminhos do painel, sem `..`, `//` nem `\` (nunca redireciona para fora do site). */
export function voltarSeguro(valor: string | null): string {
  return valor &&
    /^\/admin\/[A-Za-z0-9/_?=&.-]*$/.test(valor) &&
    !/(^|\/)\.\.(\/|$)|\/\/|\\/.test(valor)
    ? valor
    : "/admin/";
}

function redirecionar(local: string, cookies: string[] = []): Response {
  const cabecalhos = new Headers({ location: local, "cache-control": "no-store" });
  for (const c of cookies) cabecalhos.append("set-cookie", c);
  return new Response(null, { status: 302, headers: cabecalhos });
}

const cookieEntrada = (valor: string, maxIdadeS: number) =>
  `${COOKIE_ENTRADA}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxIdadeS}`;

export interface DependenciasGoogle {
  agora?: Date;
  buscar?: Buscar;
  obterChaves?: ObterChaves;
}

export async function tratarAuth(
  pedido: Request,
  env: EnvGoogle,
  deps: DependenciasGoogle = {},
): Promise<Response> {
  const url = new URL(pedido.url);
  const bd = env.BD;
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!bd || !clientId || !env.GOOGLE_CLIENT_SECRET)
    return new Response("Login indisponível.", { status: 503 });
  const agora = deps.agora ?? new Date();
  const retorno = `${url.origin}/auth/retorno`;

  if (
    env.LIMITE_ENTRADAS &&
    (url.pathname === "/auth/entrar" || url.pathname === "/auth/retorno")
  ) {
    const ip = pedido.headers.get("cf-connecting-ip") ?? "sem-ip";
    if (!(await env.LIMITE_ENTRADAS.limit({ key: `auth:${ip}` })).success)
      return new Response("Demasiadas tentativas. Aguarde um minuto.", { status: 429 });
  }

  if (url.pathname === "/auth/entrar" && pedido.method === "GET") {
    const estado = aleatorio();
    const verificador = aleatorio(48);
    const nonce = aleatorio();
    const navegador = aleatorio();
    const desafio = base64Url(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))),
    );
    await bd.batch([
      // Entradas abandonadas não se acumulam.
      bd.prepare("DELETE FROM entradas WHERE expira_em < ?").bind(agora.toISOString()),
      bd
        .prepare(
          "INSERT INTO entradas (estado, navegador, verificador, nonce, voltar, expira_em) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          estado,
          await sha256Hex(navegador),
          verificador,
          nonce,
          voltarSeguro(url.searchParams.get("voltar")),
          new Date(agora.getTime() + DURACAO_ENTRADA_MS).toISOString(),
        ),
    ]);
    const destino = new URL(AUTORIZAR);
    for (const [k, v] of Object.entries({
      client_id: clientId,
      redirect_uri: retorno,
      response_type: "code",
      scope: "openid email",
      state: estado,
      nonce,
      code_challenge: desafio,
      code_challenge_method: "S256",
      prompt: "select_account",
    }))
      destino.searchParams.set(k, v);
    return redirecionar(destino.toString(), [cookieEntrada(navegador, DURACAO_ENTRADA_MS / 1000)]);
  }

  if (url.pathname === "/auth/retorno" && pedido.method === "GET") {
    const estado = url.searchParams.get("state") ?? "";
    const codigo = url.searchParams.get("code") ?? "";
    const navegador = lerCookie(pedido.headers.get("cookie"), COOKIE_ENTRADA);
    const limpar = cookieEntrada("", 0);
    const falhou = () => redirecionar("/admin/entrar/?erro=1", [limpar]);
    if (!/^[A-Za-z0-9_-]{43}$/.test(estado) || !codigo || !navegador) return falhou();
    // Uso único e só no navegador que começou o login: a entrada é apagada ao ser lida.
    const entrada = await bd
      .prepare(
        "DELETE FROM entradas WHERE estado = ? AND navegador = ? RETURNING verificador, nonce, voltar, expira_em",
      )
      .bind(estado, await sha256Hex(navegador))
      .first<{ verificador: string; nonce: string; voltar: string; expira_em: string }>();
    if (!entrada || entrada.expira_em <= agora.toISOString()) return falhou();

    const buscar = deps.buscar ?? fetch;
    let idToken: string | undefined;
    try {
      const resposta = await buscar(TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: codigo,
          client_id: clientId,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: retorno,
          grant_type: "authorization_code",
          code_verifier: entrada.verificador,
        }),
      });
      if (resposta.ok) idToken = ((await resposta.json()) as { id_token?: string }).id_token;
    } catch {
      idToken = undefined;
    }
    const email =
      idToken &&
      (await verificarIdToken(idToken, {
        clientId,
        nonce: entrada.nonce,
        agora,
        ...(deps.obterChaves && { obterChaves: deps.obterChaves }),
      }));
    if (!email) return falhou();

    const contacto = await obterPorEmail(bd, email);
    if (!contacto || !podeEntrar(contacto)) return redirecionar("/admin/sem-acesso/", [limpar]);
    const token = await criarSessao(bd, contacto.id, agora);
    return redirecionar(entrada.voltar, [cookieSessao(token, DURACAO_SESSAO_MS / 1000), limpar]);
  }

  if (url.pathname === "/auth/sair" && pedido.method === "POST") {
    if (pedido.headers.get("origin") !== url.origin) return new Response(null, { status: 403 });
    await terminarSessao(bd, pedido);
    return redirecionar("/admin/entrar/?saiu=1", [cookieSessao("", 0)]);
  }

  return new Response(null, { status: 404 });
}
