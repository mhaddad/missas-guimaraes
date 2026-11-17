/**
 * Painel com a API simulada (as páginas são geradas no servidor com a base local dos e2e):
 * visão geral, lista das paróquias, página de uma paróquia e Acessos. A segurança da API é
 * testada no Worker; aqui confirma-se o que cada perfil vê e abre, e a acessibilidade.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SESSOES } from "./sessoes.ts";

/** Sessão de teste (criada na base local por `scripts/semear-e2e.ts`). */
async function entrarComo(page: Page, perfil: "admin" | "entidade") {
  await page.context().addCookies([
    {
      name: "__Host-sessao",
      value: SESSOES[perfil],
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

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
  await entrarComo(page, perfil);
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
          id: 2,
          data: "2026-11-20T10:00:00Z",
          acao: "alteracao",
          resumo: [
            { local: "nespereira", linhas: ["✏️ Missa: domingos às 10:30 → Domingos às 11:15"] },
          ],
          restaura: null,
          contacto: { ref: "c_bbbbbbbb", funcao: "secretaria" },
        },
        {
          id: 1,
          data: "2026-11-01T10:00:00Z",
          acao: "importacao",
          resumo: [],
          restaura: null,
          contacto: null,
        },
      ]);
    if (url.pathname.includes("/gravacoes/"))
      return responder({
        gravacao: 1,
        entidade: entidades[0],
        locais: [
          { local: { ...local, horarios: [{ tipo: "missa", dias: ["dom"], hora: "10:30" }] } },
        ],
      });
    if (url.pathname === "/api/gravacoes" && pedido.method() === "POST")
      return responder({ ok: true, estado: "GRAVADO", gravacao: 3, alertas: [] });
    if (url.pathname.startsWith("/api/entidades/"))
      return responder({
        entidade: entidades[0],
        versao: 1,
        locais: [{ local, versao: 1 }],
      });
    if (url.pathname === "/api/acessos" && pedido.method() === "GET") return responder(contactos);
    if (url.pathname === "/api/acessos" && pedido.method() === "POST")
      return responder({ erro: "email_em_uso" }, 409);
    return responder({ erro: "rota" }, 404);
  });
  return pedidos;
}

const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test("contacto de uma paróquia vai direto para a sua e só vê essa", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await expect(page).toHaveURL(/\/admin\/paroquia\/nespereira\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Paróquia de Nespereira" }),
  ).toBeVisible();
  const seccoes = page.getByRole("navigation", { name: "Secções do painel" });
  await expect(seccoes.getByRole("link")).toHaveText(["A minha paróquia"]);
  await expect(page.getByRole("button", { name: "Sair (Secretaria)" })).toBeVisible();
  await expect(page.getByText("Domingos às 11:15")).toBeVisible();
  await expect(page.getByText("2.º e 4.º sábados do mês às 17:00")).toBeVisible();
  await expect(page.getByText("Com coro")).toBeVisible();
  await expect(page.getByText("Horário de domingo.")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Outras paróquias, a lista e os acessos: volta à sua.
  for (const caminho of ["/admin/paroquia/polvoreira/", "/admin/paroquias/", "/admin/acessos/"]) {
    await page.goto(caminho);
    await expect(page).toHaveURL(/\/admin\/paroquia\/nespereira\/$/);
  }
});

test("os botões e as opções mostram a mão ao passar o rato", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/paroquia/nespereira/");
  const novo = page.getByRole("button", { name: "Novo horário" }).first();
  await expect(novo).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("button", { name: "Adicionar exceção" }).first()).toHaveCSS(
    "cursor",
    "pointer",
  );
  await novo.click();
  const dialogo = page.getByRole("dialog", { name: "Novo horário" });
  await expect(dialogo.getByText("Sex", { exact: true })).toHaveCSS("cursor", "pointer");
  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await expect(dialogo).toBeHidden();
});

test("visão geral do administrador: indicadores, mais antigas e ligação para a lista", async ({
  page,
}) => {
  await simular(page, "admin");
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  const seccoes = page.getByRole("navigation", { name: "Secções do painel" });
  await expect(seccoes.getByRole("link")).toHaveText(["Visão geral", "Paróquias", "Acessos"]);
  await expect(
    page.getByRole("link", { name: "Ver o site (abre noutro separador)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair (Ana Admin)" })).toBeVisible();
  await expect(page.getByText("Paróquias no site")).toBeVisible();
  const antigas = page.getByRole("region", { name: "Há mais tempo sem atualização" });
  await expect(antigas.getByRole("link")).not.toHaveCount(0);
  await expect(page.getByRole("region", { name: "Últimas atualizações" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("link", { name: /Nunca confirmada/ }).click();
  await expect(page).toHaveURL(/\/admin\/paroquias\/\?estado=nunca$/);
});

test("lista das paróquias: pesquisa, concelho, estado, ordem e abrir uma", async ({ page }) => {
  const pedidos = await simular(page, "admin");
  await page.goto("/admin/paroquias/");
  await expect(page.locator("html[data-pronto]")).toHaveCount(1);
  const visiveis = page.locator("#lista > li:visible");
  await expect(visiveis).toHaveCount(5);
  expect(await axe(page)).toEqual([]);
  await page.getByLabel("Pesquisar paróquias").fill("POLVO");
  await expect(visiveis).toHaveCount(1);
  await expect(page).toHaveURL(/\?q=POLVO$/);
  await expect(page.locator("#contagem")).toHaveText("1 de 5 paróquias");
  await page.getByLabel("Pesquisar paróquias").fill("");
  await page.getByRole("button", { name: "Vizela", exact: true }).click();
  await expect(visiveis).toHaveCount(1);
  await page.getByLabel("Estado").selectOption("confirmada");
  await expect(visiveis).toHaveCount(0);
  await expect(page.getByText("Nenhuma paróquia corresponde aos filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(visiveis).toHaveCount(5);
  await page.getByLabel("Ordenar").selectOption("antigas");
  await expect(page).toHaveURL(/ordem=antigas/);
  await page.getByRole("link", { name: "Paróquia de São Pedro de Polvoreira" }).click();
  await expect(page).toHaveURL(/\/admin\/paroquia\/polvoreira\/$/);
  await expect(page.getByRole("navigation", { name: "Caminho" })).toContainText("Paróquias");
  await expect.poll(() => pedidos.some((p) => p.url === "/api/entidades/polvoreira")).toBe(true);
});

test("paróquia inexistente: página própria com 404", async ({ page }) => {
  await simular(page, "admin");
  const resposta = await page.goto("/admin/paroquia/nao-existe/");
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Paróquia não encontrada" })).toBeVisible();
});

test("endereço antigo /admin/?entidade=<id> leva à página da paróquia", async ({ page }) => {
  await simular(page, "admin");
  await page.goto("/admin/?entidade=polvoreira");
  await expect(page).toHaveURL(/\/admin\/paroquia\/polvoreira\/$/);
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
  await expect(
    page.getByRole("status").filter({ hasText: "Gravado. Já está no site." }),
  ).toBeVisible({
    timeout: 15_000,
  });
  const post = pedidos.find((p) => p.metodo === "POST" && p.url === "/api/gravacoes");
  expect(post?.corpo).toMatchObject({
    tipo: "confirmacao",
    entidade: "nespereira",
    base: { nespereira: 1 },
    resumo: [
      { local: "nespereira", linhas: [expect.stringMatching(/^✅ Horários confirmados em/)] },
    ],
  });
});

const hojeLisboa = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

/** Clica e devolve o corpo do POST /api/gravacoes que o clique envia. */
async function clicarEEnviar(page: Page, botao: ReturnType<Page["getByRole"]>) {
  const [pedido] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/gravacoes")),
    botao.click(),
  ]);
  return pedido.postDataJSON() as ReturnType<typeof ultimoPost>;
}

function ultimoPost(pedidos: { metodo: string; url: string; corpo: unknown }[]) {
  return pedidos.filter((p) => p.metodo === "POST" && p.url === "/api/gravacoes").at(-1)?.corpo as {
    tipo: string;
    locais: Record<
      string,
      { versao: number; dados: { horarios: unknown[]; excecoes: unknown[]; dias_santos?: string } }
    >;
    resumo: { linhas: string[] }[];
    confirmar_alertas?: boolean;
  };
}

test("Novo horário (P2): escolhe dias e hora, vê o resumo e grava a partir de hoje", async ({
  page,
}) => {
  const pedidos = await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Novo horário" }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Novo horário" });
  await dialogo.getByLabel("Hora", { exact: true }).fill("18:30");
  await dialogo.getByText("Sex", { exact: true }).click();
  await expect(dialogo.getByText(/➕ Missa: sextas-feiras às 18:30/)).toBeVisible();
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
  await dialogo.getByRole("button", { name: "Gravar" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gravado. Já está no site." }),
  ).toBeVisible({
    timeout: 15_000,
  });
  const post = ultimoPost(pedidos);
  expect(post.tipo).toBe("alteracao");
  expect(post.locais["nespereira"]?.dados.horarios).toContainEqual({
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
  const horarios = enviado.locais["nespereira"]?.dados.horarios;
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
  expect(post.locais["nespereira"]?.dados.excecoes).toContainEqual({
    data: "2099-03-01",
    acao: "cancelar",
    tipo: "missa",
    hora: "11:15",
  });
  expect(post.locais["nespereira"]?.dados.horarios).toHaveLength(2);
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

test("Nova exceção (P3): muda a hora de uma celebração prevista para essa data", async ({
  page,
}) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Adicionar exceção" }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Nova exceção" });
  await dialogo.getByLabel("Data").fill("2099-03-01");
  await dialogo.getByText("Muda a hora", { exact: true }).click();
  await dialogo.getByLabel("Que celebração?").selectOption({ label: "Missa às 11:15" });
  await dialogo.getByLabel("Nova hora").fill("10:30");
  await dialogo.getByLabel("Nota (opcional)").fill("Festa da paróquia");
  await expect(dialogo.getByText(/10:30/).first()).toBeVisible();
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
  const post = await clicarEEnviar(page, dialogo.getByRole("button", { name: "Gravar" }));
  expect(post.locais["nespereira"]?.dados.excecoes).toContainEqual({
    data: "2099-03-01",
    acao: "alterar",
    tipo: "missa",
    hora_original: "11:15",
    hora: "10:30",
    nota: "Festa da paróquia",
  });
});

test("Apagar exceção (P3): volta a valer o horário habitual", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: /^Apagar: .*23:30/ }).click();
  const dialogo = page.getByRole("dialog", { name: "Apagar exceção" });
  await expect(dialogo.getByText(/Exceção retirada/)).toBeVisible();
  const post = await clicarEEnviar(
    page,
    dialogo.getByRole("button", { name: "Apagar", exact: true }),
  );
  expect(post.locais["nespereira"]?.dados.excecoes).toEqual([]);
});

test("Dias santos (P4): horário próprio cria a missa dos dias santos", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: /^Alterar o horário dos dias santos/ }).click();
  const dialogo = page.getByRole("dialog", { name: "Dias santos de preceito" });
  await dialogo.getByLabel(/Horário próprio/).check();
  await dialogo.getByLabel("Hora da missa").fill("19:00");
  const post = await clicarEEnviar(page, dialogo.getByRole("button", { name: "Gravar" }));
  const local = post.locais["nespereira"]?.dados;
  expect(local?.dias_santos).toBe("horario_proprio");
  expect(local?.horarios).toContainEqual({ tipo: "missa", dias: ["santo"], hora: "19:00" });
});

test("Histórico: administrador restaura uma versão anterior", async ({ page }) => {
  const pedidos = await simular(page, "admin");
  await page.goto("/admin/paroquia/nespereira/");
  await page.getByRole("button", { name: "Ver alterações" }).click();
  await expect(page.getByText("Horários iniciais")).toBeVisible();
  await expect(page.getByText(/versão atual/i)).toBeVisible();
  // Só as versões anteriores à atual podem ser restauradas.
  await expect(page.getByRole("button", { name: "Restaurar esta versão" })).toHaveCount(1);
  await page.getByRole("button", { name: "Restaurar esta versão" }).click();
  const dialogo = page.getByRole("dialog", { name: "Restaurar esta versão?" });
  await expect(dialogo.getByText(/Domingos às 10:30/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gravado. Já está no site." }),
  ).toBeVisible({
    timeout: 15_000,
  });
  const post = pedidos.find((p) => p.metodo === "POST" && p.url === "/api/gravacoes");
  expect(post?.corpo).toMatchObject({
    tipo: "restauro",
    entidade: "nespereira",
    restaura: 1,
    base: { entidade: 1, locais: { nespereira: 1 } },
  });
});

test("Histórico: um contacto vê as alterações mas não restaura", async ({ page }) => {
  await simular(page, "entidade");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Ver alterações" }).click();
  await expect(page.getByText("Horários iniciais")).toBeVisible();
  const historico = page.getByRole("region", { name: "Histórico de alterações" });
  await expect(historico.getByText("Secretaria", { exact: false }).first()).toBeVisible();
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
  await entrarComo(page, "entidade");
  await page.route("**/api/**", (rota) =>
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
    "/auth/entrar?voltar=%2Fadmin%2F",
  );
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations.map((v) => v.id)).toEqual([]);
});
