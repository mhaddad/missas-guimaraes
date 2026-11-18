/**
 * Páginas públicas de ponta a ponta (§14, E2.11), com os dados fixos de `site/e2e/dados/`:
 * relógio simulado, fuso do navegador diferente (C16, C17), filtros, idiomas, lista e página de
 * cada paróquia, dias santos, funcionamento sem JavaScript e acessibilidade (axe, WCAG 2.1 AA).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Domingo, 1 de novembro de 2026, 10:50 em Lisboa (inverno, UTC+0). */
const DOMINGO_1050 = new Date("2026-11-01T10:50:00Z");

async function abrir(page: Page, caminho: string, quando = DOMINGO_1050): Promise<void> {
  await page.clock.setFixedTime(quando);
  await page.goto(caminho);
  await expect(page.locator("html[data-pronto]")).toHaveCount(1);
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
  test("concelho e dia ficam no endereço e passam para os outros idiomas", async ({ page }) => {
    await abrir(page, "/?dia=amanha");
    await expect(page.getByRole("button", { name: "Por igreja" })).toHaveCount(0);
    await page.getByRole("button", { name: "Vizela", exact: true }).click();
    await expect(page).toHaveURL(/concelho=vizela/);
    await expect(page.locator("#lista-hora > li").first()).toBeVisible();
    for (const linha of await page.locator("#lista-hora > li").all()) {
      await expect(linha).toContainText("Vizela");
    }
    await page.locator('a[data-idioma="/en/"]').click();
    await expect(page).toHaveURL(/\/en\/\?dia=amanha&concelho=vizela$/);
    await expect(page.locator("#lista-hora > li").first()).toContainText("Vizela");
  });

  test("próximo domingo: as vespertinas sob a data do sábado, depois o domingo", async ({
    page,
  }) => {
    await abrir(page, "/?dia=domingo");
    const linhas = page.locator("#lista-hora > li");
    await expect(linhas.first()).toHaveText("Sábado, 7 de novembro");
    await expect(linhas.nth(1)).toContainText("Sábado, 7 · vespertina");
    await expect(linhas.nth(2)).toHaveText("Domingo, 8 de novembro");
    await expect(page.getByText(/missas vespertinas/)).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
      ).violations.map((v) => v.id),
    ).toEqual([]);
  });

  test("pesquisa sem acentos", async ({ page }) => {
    await abrir(page, "/?dia=domingo");
    const todas = await page.locator("#lista-hora > li").count();
    await page.getByLabel("Pesquisar").fill("SANTA EULALIA");
    await expect(page.locator("#lista-hora > li").first()).toContainText("Nespereira");
    for (const linha of await page.locator("#lista-hora > li").all()) {
      await expect(linha).toContainText("Nespereira");
    }
    await page.getByRole("button", { name: "Limpar a pesquisa" }).click();
    await expect(page.locator("#lista-hora > li")).toHaveCount(todas);
  });

  test("as ligações antigas /#id levam à página da paróquia", async ({ page }) => {
    await page.goto("/#nespereira");
    await expect(page).toHaveURL(/\/paroquia\/nespereira\/#nespereira$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nespereira");
  });

  test("o detalhe abre por baixo da linha, com a ligação para a página da paróquia", async ({
    page,
  }) => {
    await abrir(page, "/?q=oliveira");
    await page
      .locator("#lista-hora")
      .getByRole("button", { name: "Igreja de Nossa Senhora da Oliveira" })
      .first()
      .click();
    await expect(page.locator("#lista-hora")).toContainText("Domingos às 12:00 e 19:00");
    await expect(
      page.locator("#lista-hora").getByRole("link", { name: "Página da paróquia" }).first(),
    ).toHaveAttribute("href", "/paroquia/nossa-senhora-da-oliveira/");
  });

  test("Como chegar abre sempre o Google Maps, também num iPhone", async ({ browser }) => {
    const contexto = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    const page = await contexto.newPage();
    await abrir(page, "/?q=oliveira");
    await expect(page.getByRole("link", { name: "Como chegar" }).first()).toHaveAttribute(
      "href",
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/,
    );
    await contexto.close();
  });
});

test.describe("lista das paróquias", () => {
  test("filtro por concelho, sem locais não publicados, e ligação para cada página", async ({
    page,
  }) => {
    await page.goto("/paroquias/");
    await expect(page.locator("html[data-pronto]")).toHaveCount(1);
    const itens = page.locator("#lista-paroquias > li");
    await expect(itens).toHaveCount(4);
    await expect(page.locator('a[href="/paroquia/serzedelo/"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Vizela", exact: true }).click();
    await expect(page).toHaveURL(/\/paroquias\/\?concelho=vizela$/);
    await expect(page.locator("#lista-paroquias > li:visible")).toHaveCount(1);
    await expect(page.locator("#contagem-paroquias")).toHaveText("1 paróquia");
    await page.getByRole("button", { name: "Todos" }).click();
    await page.getByRole("link", { name: /Paróquia de Santa Eulália de Nespereira/ }).click();
    await expect(page).toHaveURL(/\/paroquia\/nespereira\/$/);
  });

  test("pesquisa pelo nome ou parte do nome, sem acentos, junto com o concelho", async ({
    page,
  }) => {
    await page.goto("/paroquias/");
    await expect(page.locator("html[data-pronto]")).toHaveCount(1);
    const visiveis = page.locator("#lista-paroquias > li:visible");
    const pesquisa = page.getByLabel("Pesquisar paróquias");
    await pesquisa.fill("eulalia");
    await expect(visiveis).toHaveCount(1);
    await expect(visiveis).toContainText("Paróquia de Santa Eulália de Nespereira");
    await expect(page).toHaveURL(/\/paroquias\/\?q=eulalia$/);
    await expect(page.locator("#contagem-paroquias")).toHaveText("1 paróquia");
    // Parte do nome, em maiúsculas.
    await pesquisa.fill("POLVO");
    await expect(visiveis).toHaveCount(1);
    await expect(visiveis).toContainText("Polvoreira");
    // Com o concelho: nenhuma corresponde.
    await page.getByRole("button", { name: "Vizela", exact: true }).click();
    await expect(visiveis).toHaveCount(0);
    await expect(page.locator("#vazio-paroquias")).toBeVisible();
    await expect(page).toHaveURL(/\?q=POLVO&concelho=vizela$/);
    await page.getByRole("button", { name: "Limpar a pesquisa" }).click();
    await expect(visiveis).toHaveCount(1);
    await expect(page.locator("#vazio-paroquias")).toBeHidden();
  });

  test("a pesquisa do endereço passa para os outros idiomas", async ({ page }) => {
    await page.goto("/paroquias/?q=oliveira");
    await expect(page.locator("html[data-pronto]")).toHaveCount(1);
    await expect(page.getByLabel("Pesquisar paróquias")).toHaveValue("oliveira");
    await expect(page.locator("#lista-paroquias > li:visible")).toHaveCount(1);
    await page.locator('a[data-idioma="/en/paroquias/"]').click();
    await expect(page).toHaveURL(/\/en\/paroquias\/\?q=oliveira$/);
    await expect(page.locator("#lista-paroquias > li:visible")).toHaveCount(1);
  });

  test("o atalho Paróquias do cabeçalho leva à lista", async ({ page }) => {
    await abrir(page, "/");
    if ((page.viewportSize()?.width ?? 1280) < 768)
      await page
        .getByRole("navigation", { name: "Atalhos" })
        .last()
        .getByRole("link", { name: "Paróquias" })
        .click();
    else await page.getByRole("link", { name: "Paróquias" }).first().click();
    await expect(page).toHaveURL(/\/paroquias\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paróquias");
  });
});

test.describe("página de cada paróquia", () => {
  test("nome, fotografia, informações, dados estruturados e ligação de volta", async ({ page }) => {
    await page.goto("/en/paroquia/nespereira/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Paróquia de Santa Eulália de Nespereira",
    );
    await expect(page.getByRole("img", { name: /Photo of the church coming soon/ })).toBeVisible();
    await expect(page.locator("article#nespereira")).toContainText("Weekly times");
    await expect(page.locator("article#nespereira")).toContainText("253 565 949");
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as { "@graph": { "@type": string; event?: unknown[] }[] };
    expect(ld["@graph"][0]?.["@type"]).toBe("Church");
    expect(ld["@graph"][0]?.event?.length).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: /Parishes/ }).first()).toHaveAttribute(
      "href",
      "/en/paroquias/",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/en\/paroquia\/nespereira\/$/,
    );
    // A escolha de idioma fica na mesma paróquia.
    await expect(page.locator('a[hreflang="pt-PT"]')).toHaveAttribute(
      "href",
      "/paroquia/nespereira/",
    );
  });

  test("celebrações de hoje, amanhã e do próximo domingo, só desta paróquia", async ({ page }) => {
    await page.clock.setFixedTime(DOMINGO_1050);
    await page.goto("/paroquia/nossa-senhora-da-oliveira/");
    const lista = page.locator("#lista-dia > li");
    await expect(page.locator("#titulo-dia")).toHaveText("Celebrações de hoje");
    await expect(page.getByRole("button", { name: "Hoje" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(lista).toHaveCount(2);
    await expect(lista.first()).toContainText("12:00");
    await expect(lista.first()).toContainText("A seguir · em 1 h 10 min");
    await page.getByRole("button", { name: "Amanhã" }).click();
    await expect(page).toHaveURL(/\?dia=amanha$/);
    await expect(page.locator("#titulo-dia")).toHaveText("Celebrações de amanhã");
    await expect(lista).toHaveCount(1);
    await expect(lista.first()).toContainText("19:00");
    await page.getByRole("button", { name: "Próx. domingo" }).click();
    await expect(lista).toHaveCount(2);
  });

  test("o sitemap tem a lista e as páginas das paróquias com locais publicados", async ({
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/paroquias/</loc>");
    expect(xml).toContain("/paroquia/nespereira/</loc>");
    expect(xml).toContain("/en/paroquia/nespereira/</loc>");
    expect(xml).not.toContain("/paroquia/serzedelo/");
  });

  test("os endereços antigos /igreja/<id>/ levam à secção da paróquia", async ({ page }) => {
    await page.goto("/igreja/nespereira/");
    await expect(page).toHaveURL(/\/paroquia\/nespereira\/#nespereira$/);
  });

  test("paróquias sem locais publicados, inexistentes e igrejas não publicadas: 404", async ({
    page,
  }) => {
    for (const caminho of [
      "/paroquia/nao-existe/",
      "/paroquia/serzedelo/",
      "/igreja/serzedelo/",
      "/igreja/nao-existe/",
    ]) {
      const resposta = await page.goto(caminho);
      expect(resposta?.status()).toBe(404);
    }
  });

  test("a página principal tem dados estruturados leves (sem celebrações)", async ({ page }) => {
    await page.goto("/");
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as { "@graph": { url: string; event?: unknown }[] };
    expect(ld["@graph"].every((c) => c.event === undefined)).toBe(true);
    expect(ld["@graph"][0]?.url).toMatch(/\/paroquia\/[a-z0-9-]+\/#[a-z0-9-]+$/);
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
  test("a página principal leva à lista; cada paróquia mostra o horário semanal", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#controlos")).toBeHidden();
    await page.getByRole("link", { name: "Ver a lista de paróquias" }).click();
    await expect(page.locator("#lista-paroquias > li")).toHaveCount(4);
    await page.getByRole("link", { name: /Paróquia de Nossa Senhora da Oliveira/ }).click();
    await expect(page).toHaveURL(/\/paroquia\/nossa-senhora-da-oliveira\/$/);
    await expect(page.locator("#nossa-senhora-da-oliveira")).toContainText("Dias úteis às 19:00");
    await expect(page.locator("#celebracoes")).toBeHidden();
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

  test("página principal", async ({ page }) => {
    await abrir(page, "/");
    await verificar(page);
  });

  test("página principal com um detalhe aberto, em inglês", async ({ page }) => {
    await abrir(page, "/en/?q=oliveira");
    await page
      .locator("#lista-hora")
      .getByRole("button", { name: "Igreja de Nossa Senhora da Oliveira" })
      .first()
      .click();
    await expect(page.locator("#lista-hora .detalhe").first()).toBeVisible();
    await verificar(page);
  });

  test("lista das paróquias, em inglês", async ({ page }) => {
    await page.goto("/en/paroquias/?q=oliveira");
    await expect(page.locator("html[data-pronto]")).toHaveCount(1);
    await verificar(page);
  });

  test("página da paróquia, em espanhol", async ({ page }) => {
    await page.clock.setFixedTime(DOMINGO_1050);
    await page.goto("/es/paroquia/nossa-senhora-da-oliveira/");
    await expect(page.locator("#lista-dia > li").first()).toBeVisible();
    await verificar(page);
  });
});
