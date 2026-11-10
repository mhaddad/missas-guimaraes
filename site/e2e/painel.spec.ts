/**
 * Painel (E3) com a API simulada: o ecrã Horários e o ecrã Acessos. A segurança (JWT, âmbito)
 * é testada no Worker; aqui confirma-se o que cada perfil vê e a acessibilidade.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const local = {
  id: "nespereira",
  tipo: "igreja",
  entidade: "nespereira",
  concelho: "Guimarães",
  nome: "Igreja de Santa Eulália",
  localidade: "Nespereira",
  geo: { lat: 41.4, lon: -8.3 },
  publicar: true,
  dias_santos: "horario_domingo",
  horarios: [
    { tipo: "missa", dias: ["dom"], hora: "11:15", nota: "Com coro" },
    { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [2, 4] },
  ],
  excecoes: [{ data: "2099-12-24", acao: "adicionar", hora: "23:30", nota: "Vigília" }],
  confirmado_em: null,
  revisao: { pendente: false, motivos: [] },
};

const entidades = [
  { id: "nespereira", nome: "Paróquia de Nespereira", tipo: "paroquia", locais: ["nespereira"] },
  { id: "polvoreira", nome: "Paróquia de Polvoreira", tipo: "paroquia", locais: ["polvoreira"] },
];

async function simular(page: Page, perfil: "admin" | "entidade", contactos: unknown[] = []) {
  const pedidos: { metodo: string; url: string; corpo: unknown }[] = [];
  await page.route("**/api/**", async (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    pedidos.push({ metodo: pedido.method(), url: url.pathname, corpo: pedido.postDataJSON() });
    const responder = (corpo: unknown, status = 200) =>
      rota.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
    if (url.pathname === "/api/eu")
      return responder({
        id: "c_aaaaaaaa",
        nome: perfil === "admin" ? "Ana Admin" : "Secretaria",
        email: "x@exemplo.pt",
        funcao: "equipa",
        perfil,
        entidades: perfil === "admin" ? [] : [{ id: "nespereira", nome: "Paróquia de Nespereira" }],
      });
    if (url.pathname === "/api/entidades")
      return responder(perfil === "admin" ? entidades : entidades.slice(0, 1));
    if (url.pathname.startsWith("/api/entidades/"))
      return responder({
        origem: "main",
        entidade: entidades[0],
        sha: "s",
        locais: [{ local, sha: "s1" }],
      });
    if (url.pathname === "/api/acessos" && pedido.method() === "GET") return responder(contactos);
    if (url.pathname === "/api/acessos" && pedido.method() === "POST")
      return responder({ erro: "email_em_uso" }, 409);
    return responder({ erro: "rota" }, 404);
  });
  return pedidos;
}

test("Horários: contacto de uma entidade vê a sua, só de leitura", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Paróquia de Nespereira" })).toBeVisible();
  await expect(page.locator("#nome-pessoa")).toHaveText("Secretaria");
  await expect(page.getByRole("link", { name: "Acessos" })).toBeHidden();
  await expect(page.locator("#escolha-entidade")).toBeHidden();
  await expect(page.getByText("Domingos às 11:15")).toBeVisible();
  await expect(page.getByText("2.º e 4.º sábados do mês às 17:00")).toBeVisible();
  await expect(page.getByText("Com coro")).toBeVisible();
  await expect(page.getByText("Horário de domingo.")).toBeVisible();
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
});

test("Horários: administrador escolhe entre todas as entidades", async ({ page }) => {
  const pedidos = await simular(page, "admin");
  await page.goto("/admin/");
  await expect(page.getByRole("link", { name: "Acessos" })).toBeVisible();
  await expect(page.getByLabel("Procurar")).toBeVisible();
  await page.getByLabel("Entidade").selectOption("polvoreira");
  await expect(page).toHaveURL(/entidade=polvoreira/);
  expect(pedidos.some((p) => p.url === "/api/entidades/polvoreira")).toBe(true);
});

test("Acessos: lista, formulário e erro do servidor", async ({ page }) => {
  const pedidos = await simular(page, "admin", [
    {
      id: "c_bbbbbbbb",
      nome: "Secretaria da Oliveira",
      email: "oliveira@exemplo.pt",
      funcao: "secretaria",
      perfil: "entidade",
      entidades: ["nespereira"],
      estado: "ativo",
      consentimento: { em: "2026-11-09", versao: "v1", meio: "papel" },
    },
  ]);
  await page.goto("/admin/acessos/");
  await expect(page.getByText("Secretaria da Oliveira")).toBeVisible();
  await page.getByRole("button", { name: "Novo contacto" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Pároco de Polvoreira");
  await dialogo.getByLabel("E-mail (conta Google)").fill("oliveira@exemplo.pt");
  await dialogo.getByLabel("Procurar entidade").fill("polvo");
  await dialogo.getByLabel("Paróquia de Polvoreira").check();
  await dialogo.getByRole("button", { name: "Gravar" }).click();
  await expect(dialogo.getByRole("status")).toHaveText("Este e-mail já pertence a outro contacto.");
  const post = pedidos.find((p) => p.metodo === "POST");
  expect(post?.corpo).toMatchObject({
    nome: "Pároco de Polvoreira",
    perfil: "entidade",
    entidades: ["polvoreira"],
    consentimento: { versao: "v1", meio: "papel" },
  });
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
});

test("sem acesso: a API responde 403 e o painel leva à página própria", async ({ page }) => {
  await page.route("**/api/eu", (rota) =>
    rota.fulfill({ status: 403, contentType: "application/json", body: '{"erro":"sem_acesso"}' }),
  );
  await page.goto("/admin/");
  await expect(page).toHaveURL(/\/admin\/sem-acesso\/$/);
  await expect(
    page.getByRole("heading", { name: "Este e-mail não tem acesso ao painel" }),
  ).toBeVisible();
});

test("entrada", async ({ page }) => {
  await page.goto("/admin/entrar/");
  await expect(page.getByRole("link", { name: "Continuar com a conta Google" })).toHaveAttribute(
    "href",
    "/admin/",
  );
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
});
