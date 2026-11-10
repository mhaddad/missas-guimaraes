/**
 * `POST /api/relato` (§6.7, E2.9): o público reporta um erro nos horários de um local.
 * Turnstile contra spam, limite por IP e corpo pequeno. O relato fica no Workers KV
 * (`relato:<data>:<id>`), privado: o repositório é público, por isso não vira Issue
 * (decisão de 09/11/2026). Não se guarda o IP nem nenhum dado de quem relata.
 * Um relato nunca altera dados: os administradores confirmam com a entidade.
 */

export interface EnvRelato {
  KV?: KVNamespace;
  TURNSTILE_SECRET?: string;
  LIMITE_RELATOS?: RateLimit;
}

export interface Relato {
  id: string;
  local: string | null;
  mensagem: string;
  idioma: "pt-PT" | "en" | "es";
  criado_em: string;
  estado: "aberto";
}

const TAMANHO_MAXIMO = 4096;
const MENSAGEM_MINIMA = 10;
const MENSAGEM_MAXIMA = 1000;
const DURACAO_SEGUNDOS = 365 * 24 * 60 * 60;
const PADRAO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IDIOMAS = new Set(["pt-PT", "en", "es"]);
const VERIFICAR_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function erro(estado: number, codigo: string): Response {
  return Response.json({ ok: false, erro: codigo }, { status: estado });
}

/** Valida o corpo; devolve o relato (sem id nem data) ou o código de erro. */
export function lerCorpo(
  corpo: unknown,
): { local: string | null; mensagem: string; idioma: Relato["idioma"]; token: string } | string {
  if (!corpo || typeof corpo !== "object") return "corpo";
  const { local, mensagem, idioma, token } = corpo as Record<string, unknown>;
  if (
    local !== null &&
    local !== undefined &&
    (typeof local !== "string" || !PADRAO_ID.test(local) || local.length > 80)
  ) {
    return "local";
  }
  if (typeof mensagem !== "string") return "mensagem";
  const limpa = mensagem.replace(/\s+/g, " ").trim();
  if (limpa.length < MENSAGEM_MINIMA || limpa.length > MENSAGEM_MAXIMA) return "mensagem";
  if (typeof idioma !== "string" || !IDIOMAS.has(idioma)) return "idioma";
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return "verificacao";
  return { local: local ?? null, mensagem: limpa, idioma: idioma as Relato["idioma"], token };
}

async function verificarTurnstile(
  segredo: string,
  token: string,
  ip: string | null,
): Promise<boolean> {
  const dados = new FormData();
  dados.set("secret", segredo);
  dados.set("response", token);
  if (ip) dados.set("remoteip", ip);
  const resposta = await fetch(VERIFICAR_TURNSTILE, { method: "POST", body: dados });
  if (!resposta.ok) return false;
  const resultado = (await resposta.json()) as { success?: boolean };
  return resultado.success === true;
}

export async function tratarRelato(
  pedido: Request,
  env: EnvRelato,
  agora = new Date(),
): Promise<Response> {
  if (pedido.method !== "POST") return erro(405, "metodo");
  if (!env.KV || !env.TURNSTILE_SECRET) return erro(503, "indisponivel");
  if (!(pedido.headers.get("content-type") ?? "").startsWith("application/json"))
    return erro(415, "tipo");

  const ip = pedido.headers.get("cf-connecting-ip");
  if (env.LIMITE_RELATOS) {
    const { success } = await env.LIMITE_RELATOS.limit({ key: `relato:${ip ?? "sem-ip"}` });
    if (!success) return erro(429, "limite");
  }

  const texto = await pedido.text();
  if (texto.length > TAMANHO_MAXIMO) return erro(413, "tamanho");
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return erro(400, "corpo");
  }
  const lido = lerCorpo(corpo);
  if (typeof lido === "string") return erro(400, lido);

  if (!(await verificarTurnstile(env.TURNSTILE_SECRET, lido.token, ip)))
    return erro(403, "verificacao");

  const relato: Relato = {
    id: `r_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
    local: lido.local,
    mensagem: lido.mensagem,
    idioma: lido.idioma,
    criado_em: agora.toISOString(),
    estado: "aberto",
  };
  await env.KV.put(`relato:${relato.criado_em}:${relato.id}`, JSON.stringify(relato), {
    expirationTtl: DURACAO_SEGUNDOS,
  });
  return Response.json({ ok: true, id: relato.id }, { status: 201 });
}
