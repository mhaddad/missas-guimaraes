/**
 * Página pública de ponta a ponta (§14, E2.11), com os dados fixos de `site/e2e/dados/`:
 * relógio simulado, fuso do navegador diferente (C16, C17), filtros, idiomas, ligação a um
 * local, dias santos, funcionamento sem JavaScript e acessibilidade (axe, WCAG 2.1 AA).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Domingo, 1 de novembro de 2026, 10:50 em Lisboa (inverno, UTC+0). */
const DOMINGO_1050 = new Date("2026-11-01T10:50:00Z");

async function abrir(page: Page, caminho: string, quando = DOMINGO_1050): Promise<void> {
  await page.clock.setFixedTime(quando);
  await page.goto(caminho);
  await expect(page.locator("#controlos")).toBeVisible();
}

test.describe("próximas celebrações (C16, C17)", () => {
  test("C16: domingo às 10:50, a seguir vem a das 12:00 e depois a das 19:00", async ({ page }) => {
    await abrir(page, "/?q=oliveira");
    const aSeguir = page.locator("#a-seguir");
    await expect(aSeguir).toContainText("12:00");
    await expect(aSeguir).toContainText("Igreja de Nossa Senhora da Oliveira");
    await expect(aSeguir).toContainText("em 1 h 10 min");
    await expect(page.locator("#lista-hora > li")).toHaveCount(2);
    await expect(page.locator("#lista-hora > li").nth(1)).toContainText("19:00");
  });

  test.describe("com o navegador noutro fuso", () => {
    test.use({ timezoneId: "America/Sao_Paulo" });
    test("C17: as horas continuam a ser as de Lisboa", async ({ page }) => {
      await abrir(page, "/?q=oliveira");
      await expect(page.locator("#a-seguir")).toContainText("12:00");
      await expect(page.locator("#a-seguir")).toContainText("em 1 h 10 min");
      await expect(page.locator("#lista-hora > li").nth(1)).toContainText("19:00");
    });
  });

  test("as que já passaram ficam recolhidas", async ({ page }) => {
    await abrir(page, "/", new Date("2026-11-01T12:30:00Z"));
    await expect(page.locator("#anteriores")).toBeVisible();
    await expect(page.locator("#anteriores-texto")).toContainText("anteriores hoje");
    await expect(page.locator("#lista-hora")).not.toContainText("11:15");
  });
});

test.describe("filtros e endereço", () => {
  test("concelho, pesquisa e vista ficam no endereço e passam para os outros idiomas", async ({
    page,
  }) => {
    await abrir(page, "/?dia=domingo");
    await page.getByRole("button", { name: "Vizela", exact: true }).click();
    await expect(page).toHaveURL(/concelho=vizela/);
    for (const linha of await page.locator("#lista-hora > li").all()) {
      await expect(linha).toContainText("Vizela");
    }
    await page.getByRole("button", { name: "Por igreja" }).click();
    await expect(page.locator("article.igreja:visible")).toHaveCount(1);
    await expect(page.locator("#contagem-igrejas")).toHaveText("1 igreja");
    await page.locator('a[data-idioma="/en/"]').click();
    await expect(page).toHaveURL(/\/en\/\?dia=domingo&concelho=vizela&vista=igreja/);
    await expect(page.locator("#contagem-igrejas")).toHaveText("1 church");
  });

  test("pesquisa sem acentos", async ({ page }) => {
    await abrir(page, "/?vista=igreja");
    await page.getByLabel("Pesquisar").fill("SANTA EULALIA");
    await expect(page.locator("article.igreja:visible")).toHaveCount(1);
    await expect(page.locator("article.igreja:visible")).toContainText("Nespereira");
    await page.getByRole("button", { name: "Limpar a pesquisa" }).click();
    await expect(page.locator("article.igreja:visible")).toHaveCount(4);
  });

  test("locais não publicados não aparecem", async ({ page }) => {
    await abrir(page, "/?vista=igreja");
    await expect(page.locator("#serzedelo")).toHaveCount(0);
  });

  test("tocar num cartão não mexe nos filtros", async ({ page }) => {
    await abrir(page, "/?vista=igreja");
    await page.locator("#nespereira summary").click();
    await expect(page).toHaveURL(/\/\?vista=igreja$/);
    await expect(page.locator("#nespereira details")).toHaveAttribute("open", "");
  });

  test("a ligação /#id abre o local", async ({ page }) => {
    await abrir(page, "/#nespereira");
    await expect(page.locator("#nespereira details")).toHaveAttribute("open", "");
    await expect(page.locator("#nespereira")).toContainText("Horário semanal");
    await expect(page.locator("#nespereira")).toBeInViewport();
  });

  test("o detalhe abre por baixo da linha na vista por hora", async ({ page }) => {
    await abrir(page, "/?q=oliveira");
    await page
      .locator("#lista-hora")
      .getByRole("button", { name: "Igreja de Nossa Senhora da Oliveira" })
      .first()
      .click();
    await expect(page.locator("#lista-hora")).toContainText("Domingos às 12:00 e 19:00");
  });
});

test.describe("dias santos (§6.4)", () => {
  test("faixa e bloco sem informação", async ({ page }) => {
    await abrir(page, "/?dia=2026-12-08", new Date("2026-12-01T10:00:00Z"));
    await expect(page.locator("#faixa-dia-santo")).toContainText(
      "8 de dezembro — Imaculada Conceição",
    );
    await expect(page.locator("#sem-informacao")).toBeVisible();
  });
});

test.describe("sem JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("mostra todos os locais com o horário semanal", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#controlos")).toBeHidden();
    await expect(page.locator("article.igreja")).toHaveCount(4);
    await expect(page.locator("article.igreja details[open]")).toHaveCount(4);
    await expect(page.locator("#nossa-senhora-da-oliveira")).toContainText("Dias úteis às 19:00");
  });
});

test.describe("acessibilidade (WCAG 2.1 AA)", () => {
  const verificar = async (page: Page) => {
    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      resultado.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
  };

  test("vista por hora", async ({ page }) => {
    await abrir(page, "/");
    await verificar(page);
  });

  test("vista por igreja com um detalhe aberto, em inglês", async ({ page }) => {
    await abrir(page, "/en/#nossa-senhora-da-oliveira");
    await verificar(page);
  });

  test("espanhol, com todos os detalhes abertos", async ({ page }) => {
    await abrir(page, "/es/?vista=igreja");
    for (const d of await page.locator("article.igreja details").all()) {
      await d.evaluate((el) => ((el as unknown as { open: boolean }).open = true));
    }
    await verificar(page);
  });
});
