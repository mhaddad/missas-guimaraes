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
    if (url.pathname.endsWith("/historico"))
      return responder([
        {
          sha: "b".repeat(40),
          data: "2026-11-20T10:00:00Z",
          titulo: "Horários: Paróquia de Nespereira (alteração)",
          linhas: ["Igreja de Santa Eulália", "  ✏️ Missa: domingos às 10:30 → Domingos às 11:15"],
          contacto: { ref: "c_bbbbbbbb", funcao: "secretaria" },
          canal: "painel",
        },
        {
          sha: "a".repeat(40),
          data: "2026-11-01T10:00:00Z",
          titulo: "Importação inicial",
          linhas: [],
          contacto: null,
          canal: null,
        },
      ]);
    if (url.pathname.includes("/versao/"))
      return responder({
        sha: "a".repeat(40),
        entidade: entidades[0],
        locais: [
          { local: { ...local, horarios: [{ tipo: "missa", dias: ["dom"], hora: "10:30" }] } },
        ],
      });
    if (url.pathname === "/api/pedidos" && pedido.method() === "POST")
      return responder(
        { ok: true, id: "p_0123456789abcdef", estado: "A_GRAVAR", alertas: [] },
        202,
      );
    if (url.pathname === "/api/pedidos/p_0123456789abcdef")
      return responder({ id: "p_0123456789abcdef", estado: "PUBLICADO" });
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

test("Horários: contacto de uma entidade vê a sua", async ({ page }) => {
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

test("Está tudo certo (P1): mostra os horários, envia a confirmação e acompanha o estado", async ({
  page,
}) => {
  const pedidos = await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Está tudo certo" }).click();
  const dialogo = page.getByRole("dialog", { name: "Está tudo certo?" });
  await expect(dialogo.getByText("Igreja de Santa Eulália")).toBeVisible();
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
  await dialogo.getByRole("button", { name: "Confirmo que estes horários estão corretos" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicado no site." })).toBeVisible({
    timeout: 15_000,
  });
  const post = pedidos.find((p) => p.metodo === "POST" && p.url === "/api/pedidos");
  expect(post?.corpo).toMatchObject({
    tipo: "confirmacao",
    entidade: "nespereira",
    base: { "dados/locais/nespereira.yml": "s1" },
    resumo: [
      { local: "nespereira", linhas: [expect.stringMatching(/^✅ Horários confirmados em/)] },
    ],
  });
});

const hojeLisboa = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

/** Clica e devolve o corpo do POST /api/pedidos que o clique envia. */
async function clicarEEnviar(page: Page, botao: ReturnType<Page["getByRole"]>) {
  const [pedido] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/pedidos")),
    botao.click(),
  ]);
  return pedido.postDataJSON() as ReturnType<typeof ultimoPost>;
}

function ultimoPost(pedidos: { metodo: string; url: string; corpo: unknown }[]) {
  return pedidos.filter((p) => p.metodo === "POST" && p.url === "/api/pedidos").at(-1)?.corpo as {
    tipo: string;
    arquivos: Record<string, { horarios: unknown[]; excecoes: unknown[] }>;
    resumo: { linhas: string[] }[];
    confirmar_alertas?: boolean;
  };
}

test("Novo horário (P2): escolhe dias e hora, vê o resumo e grava a partir de hoje", async ({
  page,
}) => {
  const pedidos = await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "+ Novo horário" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo horário" });
  await dialogo.getByLabel("Hora", { exact: true }).fill("18:30");
  await dialogo.getByText("Sex", { exact: true }).click();
  await expect(dialogo.getByText(/➕ Missa: sextas-feiras às 18:30/)).toBeVisible();
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
  await dialogo.getByRole("button", { name: "Gravar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicado no site." })).toBeVisible({
    timeout: 15_000,
  });
  const post = ultimoPost(pedidos);
  expect(post.tipo).toBe("alteracao");
  expect(post.arquivos["dados/locais/nespereira.yml"]?.horarios).toContainEqual({
    tipo: "missa",
    dias: ["sex"],
    hora: "18:30",
    validade: { de: hojeLisboa() },
  });
});

test("Editar horário (P2): a regra antiga termina e a nova começa na data escolhida", async ({
  page,
}) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Editar: Dom às 11:15" }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar horário" });
  await expect(dialogo.getByLabel("Hora", { exact: true })).toHaveValue("11:15");
  await dialogo.getByLabel("Hora", { exact: true }).fill("10:30");
  await dialogo.getByLabel("A partir de", { exact: true }).fill("2099-01-04");
  await expect(dialogo.getByText(/➕.*10:30/)).toBeVisible();
  const enviado = await clicarEEnviar(page, dialogo.getByRole("button", { name: "Gravar" }));
  const horarios = enviado.arquivos["dados/locais/nespereira.yml"]?.horarios;
  expect(horarios).toContainEqual({
    tipo: "missa",
    dias: ["dom"],
    hora: "11:15",
    nota: "Com coro",
    validade: { ate: "2099-01-03" },
  });
  expect(horarios).toContainEqual({
    tipo: "missa",
    dias: ["dom"],
    hora: "10:30",
    nota: "Com coro",
    validade: { de: "2099-01-04" },
  });
});

test("Apagar horário (P2): cancelar só numa data cria uma exceção", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Apagar: Dom às 11:15" }).click();
  const dialogo = page.getByRole("dialog", { name: "Apagar horário" });
  await dialogo.getByLabel("Data a cancelar").fill("2099-03-01");
  await expect(dialogo.getByText(/sem missa às 11:15/)).toBeVisible();
  const post = await clicarEEnviar(
    page,
    dialogo.getByRole("button", { name: "Apagar", exact: true }),
  );
  expect(post.arquivos["dados/locais/nespereira.yml"]?.excecoes).toContainEqual({
    data: "2099-03-01",
    acao: "cancelar",
    tipo: "missa",
    hora: "11:15",
  });
  expect(post.arquivos["dados/locais/nespereira.yml"]?.horarios).toHaveLength(2);
});

test("Alertas de anomalia: só grava depois de 'Tenho a certeza'", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Editar: Dom às 11:15" }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar horário" });
  await dialogo.getByLabel("Hora", { exact: true }).fill("23:30");
  await expect(dialogo.getByText(/hora fora do habitual \(23:30\)/)).toBeVisible();
  const gravar = dialogo.getByRole("button", { name: "Gravar" });
  await expect(gravar).toBeDisabled();
  await dialogo.getByLabel("Tenho a certeza").check();
  expect((await clicarEEnviar(page, gravar)).confirmar_alertas).toBe(true);
});

test("Histórico: administrador restaura uma versão anterior", async ({ page }) => {
  const pedidos = await simular(page, "admin");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Ver alterações" }).click();
  await expect(page.getByText("Importação inicial")).toBeVisible();
  await expect(page.getByText(/versão atual/)).toBeVisible();
  // Só as versões anteriores à atual podem ser restauradas.
  await expect(page.getByRole("button", { name: "Restaurar esta versão" })).toHaveCount(1);
  await page.getByRole("button", { name: "Restaurar esta versão" }).click();
  const dialogo = page.getByRole("dialog", { name: "Restaurar esta versão?" });
  await expect(dialogo.getByText(/Domingos às 10:30/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicado no site." })).toBeVisible({
    timeout: 15_000,
  });
  const post = pedidos.find((p) => p.metodo === "POST" && p.url === "/api/pedidos");
  expect(post?.corpo).toMatchObject({
    tipo: "restauro",
    entidade: "nespereira",
    restaura: "a".repeat(40),
    base: { "dados/locais/nespereira.yml": "s1" },
    arquivos: { "dados/locais/nespereira.yml": { horarios: [{ hora: "10:30" }] } },
  });
});

test("Histórico: um contacto vê as alterações mas não restaura", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Ver alterações" }).click();
  await expect(page.getByText("Importação inicial")).toBeVisible();
  await expect(page.getByText("Secretaria", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurar esta versão" })).toHaveCount(0);
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
