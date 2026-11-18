import { describe, expect, it } from "vitest";
import { comCabecalhosDeSeguranca, POLITICA_CONTEUDO } from "./seguranca.ts";

const URL_HTTPS = new URL("https://missas.exemplo.workers.dev/");

describe("comCabecalhosDeSeguranca", () => {
  it("acrescenta CSP, proteção contra iframes, nosniff, referrer, permissões e HSTS", async () => {
    const r = comCabecalhosDeSeguranca(
      new Response("<p>olá</p>", { status: 201, headers: { "content-type": "text/html" } }),
      URL_HTTPS,
    );
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("<p>olá</p>");
    expect(r.headers.get("content-type")).toBe("text/html");
    expect(r.headers.get("content-security-policy")).toBe(POLITICA_CONTEUDO);
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("permissions-policy")).toContain("camera=()");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains");
  });

  it("a CSP não deixa correr scripts embutidos nem de outros sítios (só o Turnstile)", () => {
    const script = /script-src ([^;]+)/.exec(POLITICA_CONTEUDO)?.[1] ?? "";
    expect(script.split(" ")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
    expect(POLITICA_CONTEUDO).toContain("frame-ancestors 'none'");
    expect(POLITICA_CONTEUDO).toContain("object-src 'none'");
    expect(POLITICA_CONTEUDO).not.toContain("unsafe-eval");
  });

  it("mantém os cabeçalhos que a resposta já traz e não põe HSTS em http", () => {
    const r = comCabecalhosDeSeguranca(
      new Response(null, {
        status: 302,
        headers: { location: "/admin/", "content-security-policy": "default-src 'none'; sandbox" },
      }),
      new URL("http://localhost:4322/"),
    );
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/admin/");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(r.headers.get("strict-transport-security")).toBeNull();
  });
});
