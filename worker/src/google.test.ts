import { beforeEach, describe, expect, it } from "vitest";
import { limparCacheChaves, tratarAuth, verificarIdToken, type EnvGoogle } from "./google.ts";
import { COOKIE_SESSAO, lerCookie, lerSessao } from "./sessao.ts";
import { comSessao, contacto, criarGoogleFalso, novaBase } from "./teste-util.ts";

const CLIENT = "cliente-teste.apps.googleusercontent.com";
const AGORA = new Date("2026-11-16T12:00:00Z");
const ORIGEM = "https://missas.exemplo.workers.dev";
const google = await criarGoogleFalso(CLIENT);
const outro = await criarGoogleFalso(CLIENT);

beforeEach(() => limparCacheChaves());

const verificar = (token: string, nonce = "n1") =>
  verificarIdToken(token, {
    clientId: CLIENT,
    nonce,
    agora: AGORA,
    obterChaves: google.obterChaves,
  });

describe("verificarIdToken", () => {
  it("aceita um token válido e devolve o e-mail em minúsculas", async () => {
    const t = await google.idToken(google.cargaValida("Pessoa@Gmail.com", "n1", AGORA));
    expect(await verificar(t)).toBe("pessoa@gmail.com");
  });

  it.each([
    ["outro emissor", { iss: "https://evil.example" }],
    ["outra aplicação", { aud: "outro-cliente" }],
    ["expirado", { exp: Math.floor(AGORA.getTime() / 1000) - 120 }],
    ["emitido no futuro", { iat: Math.floor(AGORA.getTime() / 1000) + 600 }],
    ["nonce diferente", { nonce: "outro" }],
    ["e-mail não verificado", { email_verified: false }],
    ["sem e-mail", { email: undefined }],
  ])("recusa: %s", async (_caso, mudanca) => {
    const t = await google.idToken({
      ...google.cargaValida("a@gmail.com", "n1", AGORA),
      ...mudanca,
    });
    expect(await verificar(t)).toBeNull();
  });

  it("recusa assinatura de outra chave, carga adulterada, alg diferente e lixo", async () => {
    const carga = google.cargaValida("a@gmail.com", "n1", AGORA);
    expect(await verificar(await outro.idToken(carga))).toBeNull();
    const [c, , s] = (await google.idToken(carga)).split(".");
    const adulterada = btoa(JSON.stringify({ ...carga, email: "admin@gmail.com" }));
    expect(await verificar(`${c}.${adulterada}.${s}`)).toBeNull();
    expect(await verificar(await google.idToken(carga, { alg: "HS256" }))).toBeNull();
    expect(await verificar("a.b")).toBeNull();
    expect(await verificar("%%%.%%%.%%%")).toBeNull();
  });
});

describe("fluxo de entrada", () => {
  async function ambiente() {
    const mem = novaBase();
    const env: EnvGoogle = {
      BD: mem.comoD1(),
      GOOGLE_CLIENT_ID: CLIENT,
      GOOGLE_CLIENT_SECRET: "s",
    };
    return { mem, env };
  }

  async function entrar(env: EnvGoogle, voltar = "/admin/acessos/") {
    const r = await tratarAuth(
      new Request(`${ORIGEM}/auth/entrar?voltar=${encodeURIComponent(voltar)}`),
      env,
      { agora: AGORA },
    );
    const destino = new URL(r.headers.get("location") ?? "");
    return { r, destino };
  }

  /** Simula o regresso do Google com um token emitido para `email`. */
  async function regressar(env: EnvGoogle, estado: string, email: string, nonce: string) {
    const token = await google.idToken(google.cargaValida(email, nonce, AGORA));
    const pedidos: Request[] = [];
    const buscar = (async (url: string, init: RequestInit) => {
      pedidos.push(new Request(url, init));
      return Response.json({ id_token: token });
    }) as typeof fetch;
    const r = await tratarAuth(
      new Request(`${ORIGEM}/auth/retorno?state=${estado}&code=codigo-1`),
      env,
      { agora: AGORA, buscar, obterChaves: google.obterChaves },
    );
    return { r, pedidos };
  }

  it("entrar vai ao Google com PKCE, state e nonce; o regresso abre a sessão", async () => {
    const { mem, env } = await ambiente();
    await comSessao(env.BD as D1Database, contacto("c_aaaaaaaa", "pessoa@gmail.com"), AGORA);
    const { r, destino } = await entrar(env);
    expect(r.status).toBe(302);
    expect(destino.origin + destino.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(destino.searchParams.get("redirect_uri")).toBe(`${ORIGEM}/auth/retorno`);
    expect(destino.searchParams.get("scope")).toBe("openid email");
    expect(destino.searchParams.get("code_challenge_method")).toBe("S256");
    const estado = destino.searchParams.get("state") ?? "";
    const nonce = destino.searchParams.get("nonce") ?? "";

    const { r: volta, pedidos } = await regressar(env, estado, "Pessoa@gmail.com", nonce);
    expect(volta.status).toBe(302);
    expect(volta.headers.get("location")).toBe("/admin/acessos/");
    const cookie = volta.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(
      /^__Host-sessao=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax/,
    );
    // O segredo e o verificador PKCE vão só ao Google, no corpo.
    const corpo = new URLSearchParams(await pedidos[0]?.text());
    expect(corpo.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(corpo.get("client_secret")).toBe("s");

    const valor = lerCookie(cookie, COOKIE_SESSAO);
    const pedido = new Request(`${ORIGEM}/api/eu`, {
      headers: { cookie: `${COOKIE_SESSAO}=${valor}` },
    });
    expect((await lerSessao(env.BD as D1Database, pedido, AGORA))?.id).toBe("c_aaaaaaaa");
    // No D1 fica só o hash.
    const guardado = mem.base.prepare("SELECT id FROM sessoes").all() as { id: string }[];
    expect(guardado.some((s) => s.id === valor)).toBe(false);
  });

  it("o state só serve uma vez", async () => {
    const { env } = await ambiente();
    await comSessao(env.BD as D1Database, contacto("c_aaaaaaaa", "pessoa@gmail.com"), AGORA);
    const { destino } = await entrar(env);
    const estado = destino.searchParams.get("state") ?? "";
    const nonce = destino.searchParams.get("nonce") ?? "";
    await regressar(env, estado, "pessoa@gmail.com", nonce);
    const { r } = await regressar(env, estado, "pessoa@gmail.com", nonce);
    expect(r.headers.get("location")).toBe("/admin/entrar/?erro=1");
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("e-mail sem registo ou suspenso vai para 'sem acesso', sem sessão", async () => {
    const { env } = await ambiente();
    await comSessao(
      env.BD as D1Database,
      contacto("c_bbbbbbbb", "suspenso@gmail.com", { estado: "suspenso" }),
      AGORA,
    );
    for (const email of ["desconhecido@gmail.com", "suspenso@gmail.com"]) {
      const { destino } = await entrar(env);
      const { r } = await regressar(
        env,
        destino.searchParams.get("state") ?? "",
        email,
        destino.searchParams.get("nonce") ?? "",
      );
      expect(r.headers.get("location")).toBe("/admin/sem-acesso/");
      expect(r.headers.get("set-cookie")).toBeNull();
    }
  });

  it("regresso só para caminhos do painel", async () => {
    const { env } = await ambiente();
    await comSessao(env.BD as D1Database, contacto("c_aaaaaaaa", "pessoa@gmail.com"), AGORA);
    for (const voltar of ["https://evil.example/", "//evil.example/admin/", "/outro/"]) {
      const { destino } = await entrar(env, voltar);
      const { r } = await regressar(
        env,
        destino.searchParams.get("state") ?? "",
        "pessoa@gmail.com",
        destino.searchParams.get("nonce") ?? "",
      );
      expect(r.headers.get("location")).toBe("/admin/");
    }
  });

  it("sair apaga a sessão e o cookie; exige a mesma origem", async () => {
    const { env } = await ambiente();
    const cookie = await comSessao(
      env.BD as D1Database,
      contacto("c_aaaaaaaa", "pessoa@gmail.com"),
      AGORA,
    );
    const sair = (origem: string) =>
      tratarAuth(
        new Request(`${ORIGEM}/auth/sair`, { method: "POST", headers: { cookie, origin: origem } }),
        env,
        { agora: AGORA },
      );
    expect((await sair("https://evil.example")).status).toBe(403);
    const r = await sair(ORIGEM);
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(
      await lerSessao(env.BD as D1Database, new Request(ORIGEM, { headers: { cookie } }), AGORA),
    ).toBeNull();
  });

  it("sem configuração: 503; estado mal formado: volta à entrada", async () => {
    const { env } = await ambiente();
    expect(
      (await tratarAuth(new Request(`${ORIGEM}/auth/entrar`), { BD: env.BD as D1Database })).status,
    ).toBe(503);
    const r = await tratarAuth(new Request(`${ORIGEM}/auth/retorno?state=x&code=y`), env, {
      agora: AGORA,
    });
    expect(r.headers.get("location")).toBe("/admin/entrar/?erro=1");
  });
});
