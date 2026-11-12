/**
 * "Reportar erro" (§6.7, E2.9) com o Turnstile e a API simulados: o pedido leva a igreja, a
 * mensagem, o idioma e o token, e nada mais.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TURNSTILE_FALSO = `window.turnstile = {
  render(alvo, opcoes) { alvo.textContent = "verificação simulada"; setTimeout(() => opcoes.callback("token-falso"), 10); return "w1"; },
  reset() {},
};`;

async function preparar(page: Page, estado = 201): Promise<{ corpos: unknown[] }> {
  const corpos: unknown[] = [];
  await page.route("https://challenges.cloudflare.com/**", (rota) =>
    rota.fulfill({ contentType: "text/javascript", body: TURNSTILE_FALSO }),
  );
  await page.route("**/relato", async (rota) => {
    corpos.push(rota.request().postDataJSON());
    await rota.fulfill({
      status: estado,
      contentType: "application/json",
      body: JSON.stringify({ ok: estado === 201 }),
    });
  });
  return { corpos };
}

test("a partir do detalhe de uma igreja", async ({ page }) => {
  const { corpos } = await preparar(page);
  await page.goto("/#nespereira");
  await page.locator("#nespereira").getByRole("button", { name: "Reportar erro" }).click();
  const dialogo = page.getByRole("dialog", { name: "Reportar um erro ou alteração" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel("Igreja")).toHaveValue("nespereira");
  await expect(dialogo).toContainText("verificação simulada");

  await dialogo.getByLabel("O que está errado?").fill("curta");
  await dialogo.getByRole("button", { name: "Enviar" }).click();
  await expect(dialogo.getByRole("status")).toHaveText("Escreva pelo menos 10 caracteres.");

  await dialogo.getByLabel("O que está errado?").fill("A missa de domingo passou para as 10:30.");
  await dialogo.getByRole("button", { name: "Enviar" }).click();
  await expect(dialogo.getByRole("status")).toContainText("Obrigado.");
  expect(corpos).toEqual([
    {
      local: "nespereira",
      mensagem: "A missa de domingo passou para as 10:30.",
      idioma: "pt-PT",
      token: "token-falso",
    },
  ]);

  const resultado = await new AxeBuilder({ page })
    .include("#relato")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);

  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
});

test("um erro do servidor mostra o código", async ({ page }) => {
  await preparar(page, 503);
  await page.goto("/#nespereira");
  await page.locator("#nespereira").getByRole("button", { name: "Reportar erro" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("verificação simulada");
  await dialogo.getByLabel("O que está errado?").fill("Tem um horário errado.");
  await dialogo.getByRole("button", { name: "Enviar" }).click();
  await expect(dialogo.getByRole("status")).toHaveText(
    "Não foi possível enviar. Tente novamente mais tarde. (503)",
  );
});

test("pelo rodapé, sem igreja, em inglês, e com o limite atingido", async ({ page }) => {
  const { corpos } = await preparar(page, 429);
  await page.goto("/en/");
  await page.getByRole("button", { name: "Report an error or change" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByLabel("Church")).toHaveValue("");
  await expect(dialogo).toContainText("verificação simulada");
  await dialogo.getByLabel("What is wrong?").fill("The address of the church is wrong.");
  await dialogo.getByRole("button", { name: "Send" }).click();
  await expect(dialogo.getByRole("status")).toHaveText(
    "Too many reports in a row. Please try again in a minute.",
  );
  expect(corpos).toEqual([
    {
      local: null,
      mensagem: "The address of the church is wrong.",
      idioma: "en",
      token: "token-falso",
    },
  ]);
});
