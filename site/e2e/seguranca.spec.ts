/**
 * Cabeçalhos de segurança e CSP: as páginas públicas e do painel funcionam sem nenhuma violação
 * da política (scripts, estilos, imagens) e não podem ser metidas num iframe.
 */
import { expect, test, type Page } from "@playwright/test";
import { SESSOES } from "./sessoes.ts";

/** Regista as violações da CSP na página (código em texto: o tsconfig dos e2e não tem DOM). */
async function vigiarCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript({
    content: `window.violacoes = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.violacoes.push(e.violatedDirective + " " + e.blockedURI));`,
  });
  return async () => (await page.evaluate("window.violacoes")) as string[];
}

test("as páginas públicas trazem os cabeçalhos e correm sem violar a CSP", async ({ page }) => {
  const violacoes = await vigiarCsp(page);
  for (const caminho of ["/", "/paroquias/", "/paroquia/nespereira/", "/en/"]) {
    const resposta = await page.goto(caminho);
    const cabecalhos = resposta?.headers() ?? {};
    expect(cabecalhos["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(cabecalhos["x-frame-options"]).toBe("DENY");
    expect(cabecalhos["x-content-type-options"]).toBe("nosniff");
    expect(cabecalhos["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    await page.waitForLoadState("networkidle");
    expect(await violacoes()).toEqual([]);
  }
});

test("o painel corre sem violar a CSP, também ao escolher uma imagem de capa", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "__Host-sessao",
      value: SESSOES.admin,
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
    },
  ]);
  const violacoes = await vigiarCsp(page);
  const resposta = await page.goto("/admin/");
  expect(resposta?.headers()["x-frame-options"]).toBe("DENY");
  await page.goto("/admin/paroquia/nespereira/");
  const capa = page.getByRole("region", { name: "Imagem de capa" });
  await capa.getByRole("button", { name: "Escolher imagem" }).click();
  await expect(page.getByRole("dialog", { name: "Escolher a imagem de capa" })).toBeVisible();
  expect(await violacoes()).toEqual([]);
});

test("as API e as imagens também trazem nosniff", async ({ request }) => {
  const r = await request.get("/api/saude");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect(r.headers()["content-security-policy"]).toBeTruthy();
});
