import { beforeEach, describe, expect, it } from "vitest";
import {
  assinar,
  caminhoEntidade,
  caminhoLocal,
  descodificarPedido,
  resumirPedido,
  serializar,
  shaBlob,
  verificarAssinatura,
  type Pedido,
} from "@missas/dados";
import type { Local } from "@missas/horarios";
import CALENDARIO from "../../dados/calendario.yml?raw";
import { tratarApiPainel, type Catalogo, type EnvPainel } from "./api/painel.ts";
import type { Contacto } from "./contactos.ts";
import { limparCacheToken } from "./github.ts";
import { limparCacheChaves } from "./identidade.ts";
import {
  lerMensagem,
  LIMITE_POR_HORA,
  tratarEstadoInterno,
  type RegistoPedido,
} from "./pedidos.ts";
import {
  chaveAppDeTeste,
  criarAccessFalso,
  githubFalso,
  KVMemoria,
  type GithubFalso,
} from "./teste-util.ts";

const EQUIPA = "equipa.cloudflareaccess.com";
const AUD = "aud-teste";
const AGORA = new Date("2026-11-30T11:42:07Z");
const ORIGEM = "https://missas.exemplo.workers.dev";
const PEDIDO_HMAC = "segredo-dos-pedidos-com-mais-de-32-caracteres";
const AVISO_HMAC = "segredo-dos-avisos-com-mais-de-32-caracteres!";
const access = await criarAccessFalso(EQUIPA, AUD);
const CHAVE = await chaveAppDeTeste();

function local(id: string, entidade: string): Local {
  return {
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [
      { tipo: "missa", dias: ["dom"], hora: "10:00" },
      { tipo: "missa", dias: ["sab"], hora: "19:00" },
    ],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
  } as Local;
}

const entidade = (id: string, locais: string[]) =>
  serializar(
    { id, tipo: "paroquia", nome: `Paróquia ${id}`, diocese: "Braga", locais },
    "entidade",
  );

const ARQUIVOS: Record<string, string> = {
  "dados/calendario.yml": CALENDARIO,
  [caminhoEntidade("nespereira")]: entidade("nespereira", ["nespereira"]),
  [caminhoEntidade("polvoreira")]: entidade("polvoreira", ["polvoreira"]),
  [caminhoLocal("nespereira")]: serializar(local("nespereira", "nespereira"), "local"),
  [caminhoLocal("polvoreira")]: serializar(local("polvoreira", "polvoreira"), "local"),
};

const catalogo: Catalogo = {
  entidades: [
    { id: "nespereira", nome: "Paróquia nespereira", tipo: "paroquia", locais: ["nespereira"] },
    { id: "polvoreira", nome: "Paróquia polvoreira", tipo: "paroquia", locais: ["polvoreira"] },
  ],
  locais: {},
};

function contacto(id: string, email: string, extra: Partial<Contacto> = {}): Contacto {
  return {
    id,
    nome: `Pessoa ${id}`,
    email,
    funcao: "secretaria",
    perfil: "entidade",
    entidades: ["nespereira"],
    estado: "ativo",
    consentimento: { em: "2026-11-01", versao: "v1", meio: "papel" },
    criado_em: "2026-11-01T00:00:00.000Z",
    atualizado_em: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

let kv: KVMemoria;
let env: EnvPainel;
let github: GithubFalso;

function configurarGithub(opcoes: Partial<Parameters<typeof githubFalso>[0]> = {}) {
  github = githubFalso({ arquivos: ARQUIVOS, ...opcoes });
}

beforeEach(async () => {
  limparCacheChaves();
  limparCacheToken();
  kv = new KVMemoria();
  configurarGithub();
  env = {
    ACCESS_TEAM_DOMAIN: EQUIPA,
    ACCESS_AUD: AUD,
    KV: kv.comoKV(),
    ASSETS: { fetch: async () => Response.json(catalogo) },
    GITHUB_PAINEL_APP_ID: "1",
    GITHUB_PAINEL_APP_PRIVATE_KEY: CHAVE,
    GITHUB_REPOSITORIO: "dono/repo",
    PEDIDO_HMAC,
    AVISO_HMAC,
  };
  for (const c of [
    contacto("c_aaaaaaaa", "admin@exemplo.pt", {
      perfil: "admin",
      entidades: [],
      funcao: "equipa",
    }),
    contacto("c_bbbbbbbb", "nespereira@exemplo.pt"),
  ]) {
    await kv.put(`contacto:${c.id}`, JSON.stringify(c));
    await kv.put(`email:${c.email}`, c.id);
  }
});

async function pedir(
  caminho: string,
  opcoes: { email?: string; metodo?: string; corpo?: unknown; texto?: string } = {},
) {
  const cabecalhos: Record<string, string> = {
    "cf-access-jwt-assertion": await access.token(opcoes.email ?? "nespereira@exemplo.pt", AGORA),
  };
  if (opcoes.metodo === "POST") {
    cabecalhos.origin = ORIGEM;
    cabecalhos["content-type"] = "application/json";
  }
  const resposta = await tratarApiPainel(
    new Request(`${ORIGEM}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: cabecalhos,
      ...(opcoes.texto !== undefined
        ? { body: opcoes.texto }
        : opcoes.corpo !== undefined && { body: JSON.stringify(opcoes.corpo) }),
    }),
    env,
    { agora: AGORA, obterChaves: access.obterChaves, buscar: github.buscar },
  );
  return { estado: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

/** Corpo de uma alteração do local `id`, como o painel o enviaria. */
async function alteracao(
  id: string,
  mudar: (l: Local) => Local = (l) => ({ ...l, dias_santos: "horario_domingo" }),
) {
  const caminho = caminhoLocal(id);
  const antes = local(id, id);
  const depois = mudar(structuredClone(antes));
  return {
    tipo: "alteracao",
    entidade: id,
    base: { [caminho]: await shaBlob(ARQUIVOS[caminho] ?? "") },
    arquivos: { [caminho]: depois },
    resumo: resumirPedido([{ antes, depois }]),
  };
}

const enviar = async (corpo: unknown, email?: string) =>
  pedir("/api/pedidos", { metodo: "POST", corpo, ...(email && { email }) });

describe("POST /api/pedidos", () => {
  it("valida, assina e dispara o workflow; regista o pedido como A_GRAVAR", async () => {
    const r = await enviar(await alteracao("nespereira"));
    expect(r).toMatchObject({ estado: 202, corpo: { ok: true, estado: "A_GRAVAR", alertas: [] } });
    expect(github.disparos).toHaveLength(1);
    const { workflow, ref, inputs } = github.disparos[0] ?? {
      inputs: {} as Record<string, string>,
    };
    expect([workflow, ref]).toEqual(["aplicar-pedido.yml", "main"]);
    expect(
      await verificarAssinatura(PEDIDO_HMAC, inputs.pedido ?? "", inputs.assinatura ?? ""),
    ).toBe(true);
    const pedido = descodificarPedido(inputs.pedido ?? "") as Pedido;
    expect(pedido).toMatchObject({
      id: r.corpo.id,
      emitido_em: "2026-11-30T11:42:07Z",
      contacto: { ref: "c_bbbbbbbb", funcao: "secretaria" },
      canal: "painel",
      entidade: "nespereira",
    });
    // Sem dados pessoais no que vai para o GitHub (os inputs aparecem no log público).
    expect(atob(inputs.pedido ?? "")).not.toMatch(/@|Pessoa/);
    const registo = await kv.get(`pedido:${String(r.corpo.id)}`, "json");
    expect(registo).toMatchObject({
      estado: "A_GRAVAR",
      contacto: "c_bbbbbbbb",
      entidade: "nespereira",
    });
  });

  it("os campos do servidor nunca vêm do corpo", async () => {
    const corpo = {
      ...(await alteracao("nespereira")),
      contacto: { ref: "c_aaaaaaaa", funcao: "paroco" },
      canal: "email",
      id: "p_ffffffffffffffff",
    };
    const r = await enviar(corpo);
    expect(r.estado).toBe(202);
    const pedido = descodificarPedido(github.disparos[0]?.inputs.pedido ?? "") as Pedido;
    expect(pedido.contacto.ref).toBe("c_bbbbbbbb");
    expect(pedido.canal).toBe("painel");
    expect(pedido.id).not.toBe("p_ffffffffffffffff");
  });

  it("recusa entidades fora do âmbito (403) sem tocar no GitHub", async () => {
    expect(await enviar(await alteracao("polvoreira"))).toMatchObject({
      estado: 403,
      corpo: { erro: "ambito" },
    });
    expect(github.chamadas).toEqual([]);
  });

  it("um admin pode alterar qualquer entidade", async () => {
    expect((await enviar(await alteracao("polvoreira"), "admin@exemplo.pt")).estado).toBe(202);
  });

  it("restauro: só admin, e com o conteúdo do commit", async () => {
    const antigo = "a".repeat(40);
    const caminho = caminhoLocal("nespereira");
    const versaoAntiga = {
      ...local("nespereira", "nespereira"),
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "09:00" }],
    } as Local;
    configurarGithub({ revisoes: { [antigo]: { [caminho]: serializar(versaoAntiga, "local") } } });
    const corpo = {
      tipo: "restauro",
      entidade: "nespereira",
      restaura: antigo,
      base: { [caminho]: await shaBlob(ARQUIVOS[caminho] ?? "") },
      arquivos: { [caminho]: versaoAntiga },
      resumo: resumirPedido([{ antes: local("nespereira", "nespereira"), depois: versaoAntiga }]),
      confirmar_alertas: true,
    };
    expect(await enviar(corpo)).toMatchObject({ estado: 403, corpo: { erro: "perfil" } });
    expect((await enviar(corpo, "admin@exemplo.pt")).estado).toBe(202);
    const foraDoMain = { ...corpo, restaura: "e".repeat(40) };
    expect(await enviar(foraDoMain, "admin@exemplo.pt")).toMatchObject({
      estado: 422,
      corpo: { motivo: expect.stringMatching(/não pertence ao main/) },
    });
    const inventado = { ...corpo, arquivos: { [caminho]: { ...versaoAntiga, nome: "Inventado" } } };
    expect(await enviar(inventado, "admin@exemplo.pt")).toMatchObject({
      estado: 422,
      corpo: { erro: "invalido" },
    });
  });

  it("CONFLITO (409) quando o arquivo mudou no main desde que foi carregado", async () => {
    const corpo = await alteracao("nespereira");
    corpo.base = { [caminhoLocal("nespereira")]: "b".repeat(40) };
    expect(await enviar(corpo)).toMatchObject({ estado: 409, corpo: { erro: "conflito" } });
    expect(github.disparos).toEqual([]);
  });

  it("dados inválidos: 422 com os problemas", async () => {
    const corpo = await alteracao("nespereira", (l) => ({
      ...l,
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "25:00" }],
    }));
    const r = await enviar({ ...corpo, resumo: [] });
    expect(r).toMatchObject({ estado: 422, corpo: { erro: "invalido" } });
  });

  it("alertas de anomalia pedem confirmação reforçada (428)", async () => {
    const corpo = await alteracao("nespereira", (l) => ({ ...l, horarios: [] }));
    const r = await enviar(corpo);
    expect(r).toMatchObject({
      estado: 428,
      corpo: { erro: "confirmar_alertas", alertas: ["Igreja nespereira fica sem nenhum horário."] },
    });
    expect(github.disparos).toEqual([]);
    expect((await enviar({ ...corpo, confirmar_alertas: true })).estado).toBe(202);
  });

  it("sem alterações: 200 e nada é disparado", async () => {
    const r = await enviar(await alteracao("nespereira", (l) => l));
    expect(r).toMatchObject({ estado: 200, corpo: { estado: "sem_alteracoes" } });
    expect(github.disparos).toEqual([]);
  });

  it.each([
    ["tipo desconhecido", { tipo: "apagar", entidade: "nespereira" }, 400, "pedido"],
    [
      "caminho fora de dados/",
      {
        tipo: "alteracao",
        entidade: "nespereira",
        base: { ".github/workflows/x.yml": null },
        arquivos: {},
      },
      400,
      "pedido",
    ],
    ["não objeto", [1, 2], 400, "corpo"],
    [
      "base com arquivos de outra entidade",
      {
        tipo: "confirmacao",
        entidade: "nespereira",
        base: { "dados/locais/polvoreira.yml": "a".repeat(40) },
      },
      400,
      "pedido",
    ],
  ])("recusa: %s", async (_caso, corpo, estado, codigo) => {
    expect(await enviar(corpo)).toMatchObject({ estado, corpo: { erro: codigo } });
  });

  it("recusa corpos grandes (413) e JSON inválido (400)", async () => {
    expect(
      (await pedir("/api/pedidos", { metodo: "POST", texto: `"${"x".repeat(41_000)}"` })).estado,
    ).toBe(413);
    expect((await pedir("/api/pedidos", { metodo: "POST", texto: "{" })).estado).toBe(400);
  });

  it("sem PEDIDO_HMAC: 503", async () => {
    delete env.PEDIDO_HMAC;
    expect(await enviar(await alteracao("nespereira"))).toMatchObject({
      estado: 503,
      corpo: { erro: "gravacao_indisponivel" },
    });
  });

  it("entidade que não existe no main: 404", async () => {
    configurarGithub({ arquivos: { "dados/calendario.yml": CALENDARIO } });
    expect(await enviar(await alteracao("nespereira"))).toMatchObject({
      estado: 404,
      corpo: { erro: "entidade" },
    });
  });

  it("falha do GitHub ao disparar: 502, sem registo", async () => {
    configurarGithub({ falharDisparo: true });
    expect(await enviar(await alteracao("nespereira"))).toMatchObject({
      estado: 502,
      corpo: { erro: "github" },
    });
    expect([...kv.dados.keys()].some((k) => k.startsWith("pedido:"))).toBe(false);
  });

  it("falha do GitHub ao ler: 502", async () => {
    delete env.GITHUB_PAINEL_APP_ID;
    expect(await enviar(await alteracao("nespereira"))).toMatchObject({
      estado: 502,
      corpo: { erro: "github" },
    });
  });

  it(`limite de ${LIMITE_POR_HORA} pedidos por hora e por contacto (429)`, async () => {
    const corpo = await alteracao("nespereira", (l) => l);
    for (let i = 0; i < LIMITE_POR_HORA; i++) expect((await enviar(corpo)).estado).toBe(200);
    expect(await enviar(corpo)).toMatchObject({ estado: 429, corpo: { erro: "limite" } });
    expect((await enviar(corpo, "admin@exemplo.pt")).estado).toBe(200);
  });
});

describe("GET /api/pedidos", () => {
  async function registar(id: string, contacto: string, criado_em: string) {
    const r: RegistoPedido = {
      id,
      tipo: "alteracao",
      entidade: "nespereira",
      contacto,
      estado: "GRAVADO",
      criado_em,
      atualizado_em: criado_em,
      resumo: [],
      alertas: [],
    };
    await kv.put(`pedido:${id}`, JSON.stringify(r));
    const inverso = String(9_999_999_999_999 - Date.parse(criado_em)).padStart(13, "0");
    await kv.put(`recentes:${inverso}:${id}`, id);
    await kv.put(`recentes-de:${contacto}:${inverso}:${id}`, id);
  }

  beforeEach(async () => {
    await registar("p_000000000001", "c_bbbbbbbb", "2026-11-29T10:00:00.000Z");
    await registar("p_000000000002", "c_aaaaaaaa", "2026-11-30T10:00:00.000Z");
    await registar("p_000000000003", "c_bbbbbbbb", "2026-11-30T11:00:00.000Z");
  });

  it("um contacto vê só os seus, o admin vê todos, mais recentes primeiro", async () => {
    const meus = (await pedir("/api/pedidos")).corpo as unknown as RegistoPedido[];
    expect(meus.map((p) => p.id)).toEqual(["p_000000000003", "p_000000000001"]);
    const todos = (await pedir("/api/pedidos", { email: "admin@exemplo.pt" }))
      .corpo as unknown as RegistoPedido[];
    expect(todos.map((p) => p.id)).toEqual(["p_000000000003", "p_000000000002", "p_000000000001"]);
  });

  it("um pedido de outra pessoa dá 404; id inválido dá 400", async () => {
    expect((await pedir("/api/pedidos/p_000000000001")).estado).toBe(200);
    expect((await pedir("/api/pedidos/p_000000000002")).estado).toBe(404);
    expect((await pedir("/api/pedidos/p_000000000002", { email: "admin@exemplo.pt" })).estado).toBe(
      200,
    );
    expect((await pedir("/api/pedidos/x")).estado).toBe(400);
  });
});

describe("POST /api/interno/estado", () => {
  const ID = "p_0123456789abcdef";

  beforeEach(async () => {
    const r: RegistoPedido = {
      id: ID,
      tipo: "alteracao",
      entidade: "nespereira",
      contacto: "c_bbbbbbbb",
      estado: "A_GRAVAR",
      criado_em: AGORA.toISOString(),
      atualizado_em: AGORA.toISOString(),
      resumo: [],
      alertas: [],
    };
    await kv.put(`pedido:${ID}`, JSON.stringify(r));
  });

  async function avisar(
    aviso: Record<string, unknown>,
    opcoes: { segredo?: string; texto?: string; metodo?: string } = {},
  ) {
    const texto = opcoes.texto ?? JSON.stringify({ pedido: ID, em: AGORA.toISOString(), ...aviso });
    const resposta = await tratarEstadoInterno(
      new Request(`${ORIGEM}/api/interno/estado`, {
        method: opcoes.metodo ?? "POST",
        headers: { "x-assinatura": await assinar(opcoes.segredo ?? AVISO_HMAC, texto) },
        ...((opcoes.metodo ?? "POST") === "POST" && { body: texto }),
      }),
      env,
      AGORA,
    );
    return { estado: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
  }
  const registo = async () => (await kv.get(`pedido:${ID}`, "json")) as RegistoPedido;

  it("atualiza o estado, o commit e os alertas", async () => {
    expect((await avisar({ estado: "GRAVADO", sha: "c".repeat(40), alertas: ["x"] })).estado).toBe(
      200,
    );
    expect(await registo()).toMatchObject({
      estado: "GRAVADO",
      sha: "c".repeat(40),
      alertas: ["x"],
    });
    expect((await avisar({ estado: "PUBLICADO", sha: "c".repeat(40) })).estado).toBe(200);
    expect((await registo()).estado).toBe("PUBLICADO");
  });

  it("PUBLICADO só com o commit que gravou o pedido, e nunca depois de ERRO ou CONFLITO", async () => {
    await avisar({ estado: "GRAVADO", sha: "c".repeat(40) });
    expect((await avisar({ estado: "PUBLICADO", sha: "d".repeat(40) })).corpo).toMatchObject({
      ignorado: true,
    });
    expect((await registo()).estado).toBe("GRAVADO");
    await kv.put(`pedido:${ID}`, JSON.stringify({ ...(await registo()), estado: "ERRO" }));
    expect((await avisar({ estado: "PUBLICADO", sha: "c".repeat(40) })).corpo).toMatchObject({
      ignorado: true,
    });
    expect((await registo()).estado).toBe("ERRO");
  });

  it("um desfecho não muda para outro (repetições sem efeito)", async () => {
    await avisar({ estado: "GRAVADO", sha: "c".repeat(40) });
    expect((await avisar({ estado: "CONFLITO", motivo: "x" })).corpo).toMatchObject({
      ignorado: true,
    });
    expect((await registo()).estado).toBe("GRAVADO");
  });

  it("os estados só avançam: um GRAVADO atrasado não desfaz o PUBLICADO", async () => {
    await avisar({ estado: "PUBLICADO" });
    expect((await avisar({ estado: "GRAVADO" })).corpo).toMatchObject({ ignorado: true });
    expect((await registo()).estado).toBe("PUBLICADO");
  });

  it("CONFLITO e ERRO guardam o motivo", async () => {
    await avisar({ estado: "CONFLITO", motivo: "mudou" });
    expect(await registo()).toMatchObject({ estado: "CONFLITO", motivo: "mudou" });
  });

  it("pedidos sem registo (linha de comandos) são ignorados", async () => {
    expect((await avisar({ estado: "GRAVADO", pedido: "p_ffffffffffffffff" })).corpo).toMatchObject(
      { ignorado: true },
    );
  });

  it("recusa assinatura de outro segredo (401) sem mexer no registo", async () => {
    expect((await avisar({ estado: "GRAVADO" }, { segredo: PEDIDO_HMAC })).estado).toBe(401);
    expect((await registo()).estado).toBe("A_GRAVAR");
  });

  it.each([
    ["instante antigo", { estado: "GRAVADO", em: "2026-11-30T11:30:00Z" }, "em"],
    ["instante inválido", { estado: "GRAVADO", em: "ontem" }, "em"],
    ["estado desconhecido", { estado: "A_GRAVAR" }, "estado"],
    ["id inválido", { estado: "GRAVADO", pedido: "x" }, "pedido"],
    ["sha inválido", { estado: "GRAVADO", sha: "x" }, "sha"],
    ["motivo grande", { estado: "ERRO", motivo: "x".repeat(1001) }, "motivo"],
    ["alertas inválidos", { estado: "GRAVADO", alertas: [1] }, "alertas"],
  ])("recusa: %s", async (_caso, aviso, codigo) => {
    expect(await avisar(aviso)).toMatchObject({ estado: 400, corpo: { erro: codigo } });
  });

  it("recusa JSON inválido, corpos grandes, outros métodos e falta de configuração", async () => {
    expect((await avisar({}, { texto: "{" })).estado).toBe(400);
    expect((await avisar({}, { texto: "[]" })).estado).toBe(400);
    expect((await avisar({}, { texto: "x".repeat(9000) })).estado).toBe(413);
    expect((await avisar({}, { metodo: "GET" })).estado).toBe(405);
    delete env.AVISO_HMAC;
    expect((await avisar({ estado: "GRAVADO" })).estado).toBe(503);
  });
});

describe("GET /api/entidades/:id/historico", () => {
  const mensagem = (titulo: string, contacto: string) =>
    `${titulo}\n\nIgreja nespereira\n  ➕ Missa: domingos às 10:30\n\nPedido: p_0123456789abcdef\nContacto: ${contacto}\nCanal: painel`;

  beforeEach(() => {
    configurarGithub({
      commits: {
        [caminhoEntidade("nespereira")]: [
          { sha: "1".repeat(40), data: "2026-11-01T10:00:00Z", mensagem: "Importação inicial" },
        ],
        [caminhoLocal("nespereira")]: [
          {
            sha: "3".repeat(40),
            data: "2026-11-20T10:00:00Z",
            mensagem: mensagem(
              "Horários: Paróquia nespereira (alteração)",
              "c_bbbbbbbb (secretaria)",
            ),
          },
          {
            sha: "2".repeat(40),
            data: "2026-11-10T10:00:00Z",
            mensagem: mensagem("Horários: Paróquia nespereira (alteração)", "c_aaaaaaaa (equipa)"),
          },
          { sha: "1".repeat(40), data: "2026-11-01T10:00:00Z", mensagem: "Importação inicial" },
        ],
      },
    });
  });

  it("junta os commits dos arquivos da entidade, sem repetir, do mais recente ao mais antigo", async () => {
    const r = await pedir("/api/entidades/nespereira/historico");
    const versoes = r.corpo as unknown as {
      sha: string;
      titulo: string;
      contacto: { ref: string; nome?: string } | null;
    }[];
    expect(versoes.map((v) => v.sha[0])).toEqual(["3", "2", "1"]);
    // Um contacto vê o próprio nome, não o dos outros.
    expect(versoes[0]?.contacto).toEqual({
      ref: "c_bbbbbbbb",
      funcao: "secretaria",
      nome: "Pessoa c_bbbbbbbb",
    });
    expect(versoes[1]?.contacto).toEqual({ ref: "c_aaaaaaaa", funcao: "equipa" });
    expect(versoes[2]?.contacto).toBeNull();
  });

  it("um admin vê os nomes", async () => {
    const versoes = (
      await pedir("/api/entidades/nespereira/historico", { email: "admin@exemplo.pt" })
    ).corpo as unknown as { contacto: { nome?: string } | null }[];
    expect(versoes[1]?.contacto?.nome).toBe("Pessoa c_aaaaaaaa");
  });

  it("âmbito, id inválido e falhas do GitHub", async () => {
    expect((await pedir("/api/entidades/polvoreira/historico")).estado).toBe(403);
    expect((await pedir("/api/entidades/Polvo%2e/historico")).estado).toBe(400);
    configurarGithub({ arquivos: {} });
    expect((await pedir("/api/entidades/nespereira/historico")).estado).toBe(404);
    delete env.GITHUB_PAINEL_APP_ID;
    expect((await pedir("/api/entidades/nespereira/historico")).estado).toBe(502);
  });
});

describe("lerMensagem", () => {
  it("separa título, linhas e trailers", () => {
    expect(
      lerMensagem(
        "Horários: X (restauro)\n\nIgreja A\n  ✏️ uma\n\nPedido: p_0123456789abcdef\nContacto: c_7f3a (pároco)\nCanal: painel\nRestaura: " +
          "a".repeat(40),
      ),
    ).toEqual({
      titulo: "Horários: X (restauro)",
      linhas: ["Igreja A", "  ✏️ uma"],
      pedido: "p_0123456789abcdef",
      contacto: { ref: "c_7f3a", funcao: "pároco" },
      canal: "painel",
      restaura: "a".repeat(40),
    });
  });

  it("commits sem trailers (edição manual por PR)", () => {
    expect(lerMensagem("Corrige a morada\n\nDetalhes do PR")).toEqual({
      titulo: "Corrige a morada",
      linhas: ["Detalhes do PR"],
      pedido: null,
      contacto: null,
      canal: null,
      restaura: null,
    });
  });
});

describe("GET /api/entidades/:id/versao/:sha", () => {
  const ANTIGO = "a".repeat(40);
  const localAntigo = { ...local("nespereira", "nespereira"), nome: "Nome antigo" } as Local;

  beforeEach(() => {
    configurarGithub({
      revisoes: {
        [ANTIGO]: {
          [caminhoEntidade("nespereira")]: entidade("nespereira", ["nespereira"]),
          [caminhoLocal("nespereira")]: serializar(localAntigo, "local"),
        },
      },
    });
  });

  it("devolve a entidade e os locais nesse commit", async () => {
    const r = await pedir(`/api/entidades/nespereira/versao/${ANTIGO}`);
    expect(r.estado).toBe(200);
    expect(r.corpo).toMatchObject({
      sha: ANTIGO,
      entidade: { id: "nespereira", locais: ["nespereira"] },
      locais: [{ local: { id: "nespereira", nome: "Nome antigo" } }],
    });
  });

  it("recusa commits fora do main, sha inválido, outras entidades e versões fora do esquema", async () => {
    expect((await pedir(`/api/entidades/nespereira/versao/${"b".repeat(40)}`)).estado).toBe(404);
    expect((await pedir("/api/entidades/nespereira/versao/main")).estado).toBe(400);
    expect((await pedir(`/api/entidades/polvoreira/versao/${ANTIGO}`)).estado).toBe(403);
    expect((await pedir(`/api/entidades/Nesp/versao/${ANTIGO}`)).estado).toBe(400);
    configurarGithub({
      revisoes: { [ANTIGO]: { [caminhoEntidade("nespereira")]: "id: nespereira\n" } },
    });
    expect((await pedir(`/api/entidades/nespereira/versao/${ANTIGO}`)).estado).toBe(422);
    configurarGithub({ revisoes: { [ANTIGO]: {} } });
    expect((await pedir(`/api/entidades/nespereira/versao/${ANTIGO}`)).estado).toBe(404);
    delete env.GITHUB_PAINEL_APP_ID;
    expect((await pedir(`/api/entidades/nespereira/versao/${ANTIGO}`)).estado).toBe(502);
  });
});
