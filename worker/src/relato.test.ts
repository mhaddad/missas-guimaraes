import { afterEach, describe, expect, it, vi } from "vitest";
import MIGRACAO from "../migracoes/0001_inicial.sql?raw";
import { lerCorpo, tratarRelato, type EnvRelato } from "./relato.ts";
import { D1Memoria } from "./teste-d1.ts";

function ambiente(extra: Partial<EnvRelato> = {}) {
  const mem = new D1Memoria([MIGRACAO]);
  const guardados = () => mem.base.prepare("SELECT * FROM relatos").all();
  return { env: { BD: mem.comoD1(), TURNSTILE_SECRET: "segredo", ...extra }, guardados };
}

const valido = {
  local: "nespereira",
  mensagem: "A missa de domingo passou para as 10:30.",
  idioma: "pt-PT",
  token: "tk",
};

function pedido(
  corpo: unknown,
  opcoes: { metodo?: string; tipo?: string; ip?: string } = {},
): Request {
  return new Request("https://exemplo.workers.dev/api/relato", {
    method: opcoes.metodo ?? "POST",
    headers: {
      "content-type": opcoes.tipo ?? "application/json",
      "cf-connecting-ip": opcoes.ip ?? "203.0.113.9",
    },
    ...(opcoes.metodo === "GET"
      ? {}
      : { body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }),
  });
}

function turnstile(sucesso: boolean) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: sucesso }));
}

afterEach(() => vi.restoreAllMocks());

describe("POST /api/relato", () => {
  it("guarda o relato no D1, sem IP", async () => {
    const verificacao = turnstile(true);
    const { env, guardados } = ambiente();
    const resposta = await tratarRelato(
      pedido({ ...valido, mensagem: "  A missa de domingo\n passou para as 10:30.  " }),
      env,
      new Date("2026-11-09T10:00:00Z"),
    );
    expect(resposta.status).toBe(201);
    const { id } = (await resposta.json()) as { id: string };
    expect(id).toMatch(/^r_[0-9a-f]{10}$/);
    expect(guardados()).toEqual([
      {
        id,
        local_id: "nespereira",
        mensagem: "A missa de domingo passou para as 10:30.",
        idioma: "pt-PT",
        estado: "aberto",
        criado_em: "2026-11-09T10:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(guardados())).not.toContain("203.0.113.9");
    const corpoVerificacao = verificacao.mock.calls[0]?.[1]?.body as FormData;
    expect(corpoVerificacao.get("secret")).toBe("segredo");
    expect(corpoVerificacao.get("response")).toBe("tk");
    expect(corpoVerificacao.get("remoteip")).toBe("203.0.113.9");
  });

  it("recusa quando o Turnstile falha, e não guarda nada", async () => {
    turnstile(false);
    const { env, guardados } = ambiente();
    expect((await tratarRelato(pedido(valido), env)).status).toBe(403);
    expect(guardados()).toEqual([]);
  });

  it("recusa a partir do limite por IP", async () => {
    turnstile(true);
    const limite = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const { env, guardados } = ambiente({ LIMITE_RELATOS: limite as unknown as RateLimit });
    const resposta = await tratarRelato(pedido(valido), env);
    expect(resposta.status).toBe(429);
    expect(limite.limit).toHaveBeenCalledWith({ key: "relato:203.0.113.9" });
    expect(guardados()).toEqual([]);
  });

  it("método, tipo, tamanho, JSON e configuração", async () => {
    const { env } = ambiente();
    expect((await tratarRelato(pedido(null, { metodo: "GET" }), env)).status).toBe(405);
    expect((await tratarRelato(pedido(valido, { tipo: "text/plain" }), env)).status).toBe(415);
    expect(
      (await tratarRelato(pedido({ ...valido, mensagem: "x".repeat(5000) }), env)).status,
    ).toBe(413);
    expect((await tratarRelato(pedido("{nao e json"), env)).status).toBe(400);
    expect((await tratarRelato(pedido({ ...valido, idioma: "fr" }), env)).status).toBe(400);
    expect((await tratarRelato(pedido(valido), { BD: env.BD })).status).toBe(503);
  });

  it("validação do corpo", () => {
    expect(lerCorpo(null)).toBe("corpo");
    expect(lerCorpo({ ...valido, local: "Não É Id" })).toBe("local");
    expect(lerCorpo({ ...valido, mensagem: "curta" })).toBe("mensagem");
    expect(lerCorpo({ ...valido, mensagem: 3 })).toBe("mensagem");
    expect(lerCorpo({ ...valido, token: "" })).toBe("verificacao");
    expect(lerCorpo({ ...valido, local: null })).toMatchObject({ local: null });
    expect(lerCorpo({ ...valido, local: undefined })).toMatchObject({ local: null });
  });
});
