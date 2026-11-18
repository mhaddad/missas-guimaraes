/** Páginas de erro com o layout do site, no idioma do endereço, sem indexação. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("404: página própria, com pesquisa de paróquias e atalhos", async ({ page }) => {
  const resposta = await page.goto("/esta-pagina-nao-existe/");
  expect(resposta?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver as celebrações de hoje" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);

  await page.getByRole("searchbox", { name: "Pesquisar paróquias" }).fill("nespereira");
  await page.getByRole("button", { name: "Pesquisar" }).click();
  await expect(page).toHaveURL(/\/paroquias\/\?q=nespereira$/);
  await expect(page.locator("#lista-paroquias > li:visible")).toHaveCount(1);
});

test("404 em inglês e em espanhol, conforme o endereço", async ({ page }) => {
  expect((await page.goto("/en/nothing-here/"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See all parishes" })).toHaveAttribute(
    "href",
    "/en/paroquias/",
  );
  expect((await page.goto("/es/nada/"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeVisible();
});

test("500: mensagem simples, sem pormenores técnicos", async ({ page }) => {
  expect((await page.goto("/500/"))?.status()).toBe(500);
  await expect(page.getByRole("heading", { level: 1, name: "Algo correu mal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
