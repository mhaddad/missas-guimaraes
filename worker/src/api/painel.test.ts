import { beforeEach, describe, expect, it } from "vitest";
import { limparCacheChaves } from "../identidade.ts";
import { limparCacheToken } from "../github.ts";
import type { Contacto } from "../contactos.ts";
import { criarAccessFalso, KVMemoria } from "../teste-util.ts";
import { tratarApiPainel, type Catalogo, type EnvPainel } from "./painel.ts";

const EQUIPA = "equipa.cloudflareaccess.com";
const AUD = "aud-teste";
const AGORA = new Date("2026-11-10T12:00:00Z");
const ORIGEM = "https://missas.exemplo.workers.dev";
const access = await criarAccessFalso(EQUIPA, AUD);

const localNespereira = {
  id: "nespereira",
  tipo: "igreja",
  entidade: "nespereira",
  concelho: "Guimarães",
  nome: "Igreja de Santa Eulália",
  geo: { lat: 41.4, lon: -8.3 },
  publicar: true,
  dias_santos: null,
  horarios: [{ tipo: "missa", dias: ["dom"], hora: "11:15" }],
  excecoes: [],
  confirmado_em: null,
  revisao: { pendente: false, motivos: [] },
};

const catalogo: Catalogo = {
  entidades: [
    { id: "nespereira", nome: "Paróquia de Nespereira", tipo: "paroquia", locais: ["nespereira"] },
    { id: "polvoreira", nome: "Paróquia de Polvoreira", tipo: "paroquia", locais: ["polvoreira"] },
  ],
  locais: {
    nespereira: localNespereira,
    polvoreira: { ...localNespereira, id: "polvoreira", entidade: "polvoreira" },
  },
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

async function registar(c: Contacto) {
  await kv.put(`contacto:${c.id}`, JSON.stringify(c));
  await kv.put(`email:${c.email}`, c.id);
}

beforeEach(async () => {
  limparCacheChaves();
  limparCacheToken();
  kv = new KVMemoria();
  env = {
    ACCESS_TEAM_DOMAIN: EQUIPA,
    ACCESS_AUD: AUD,
    KV: kv.comoKV(),
    ASSETS: { fetch: async () => Response.json(catalogo) },
  };
  await registar(
    contacto("c_aaaaaaaa", "admin@exemplo.pt", {
      perfil: "admin",
      entidades: [],
      funcao: "equipa",
    }),
  );
  await registar(contacto("c_bbbbbbbb", "nespereira@exemplo.pt"));
  await registar(contacto("c_cccccccc", "suspenso@exemplo.pt", { estado: "suspenso" }));
});

async function pedir(
  caminho: string,
  opcoes: {
    email?: string | null;
    metodo?: string;
    corpo?: unknown;
    origem?: string | null;
    tipo?: string;
  } = {},
) {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.email !== null)
    cabecalhos["cf-access-jwt-assertion"] = await access.token(
      opcoes.email ?? "admin@exemplo.pt",
      AGORA,
    );
  if (opcoes.metodo && opcoes.metodo !== "GET") {
    if (opcoes.origem !== null) cabecalhos.origin = opcoes.origem ?? ORIGEM;
    cabecalhos["content-type"] = opcoes.tipo ?? "application/json";
  }
  const pedido = new Request(`${ORIGEM}${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers: cabecalhos,
    ...(opcoes.corpo !== undefined && { body: JSON.stringify(opcoes.corpo) }),
  });
  const resposta = await tratarApiPainel(pedido, env, {
    agora: AGORA,
    obterChaves: access.obterChaves,
  });
  return {
    estado: resposta.status,
    corpo: (await resposta.json()) as Record<string, unknown> & unknown[],
    resposta,
  };
}

const novoContacto = {
  nome: "Secretaria da Oliveira",
  email: "Oliveira@Exemplo.PT",
  funcao: "secretaria",
  perfil: "entidade",
  entidades: ["polvoreira"],
  estado: "ativo",
  consentimento: { em: "2026-11-09", versao: "v1", meio: "papel" },
};

describe("identidade e acesso (E3.9)", () => {
  it("sem JWT: 401, mesmo que o Access esteja mal configurado", async () => {
    expect((await pedir("/api/eu", { email: null })).estado).toBe(401);
  });

  it("JWT inválido: 401", async () => {
    const r = await tratarApiPainel(
      new Request(`${ORIGEM}/api/eu`, { headers: { "cf-access-jwt-assertion": "a.b.c" } }),
      env,
      { agora: AGORA, obterChaves: access.obterChaves },
    );
    expect(r.status).toBe(401);
  });

  it("e-mail não registado: 403 sem_acesso; suspenso: 403", async () => {
    expect((await pedir("/api/eu", { email: "desconhecido@exemplo.pt" })).corpo).toMatchObject({
      erro: "sem_acesso",
    });
    expect((await pedir("/api/eu", { email: "suspenso@exemplo.pt" })).corpo).toMatchObject({
      erro: "suspenso",
    });
  });

  it("sem KV: 503", async () => {
    delete env.KV;
    expect((await pedir("/api/eu")).estado).toBe(503);
  });

  it("GET /api/eu", async () => {
    const r = await pedir("/api/eu", { email: "NESPEREIRA@exemplo.pt" });
    expect(r.estado).toBe(200);
    expect(r.corpo).toEqual({
      id: "c_bbbbbbbb",
      nome: "Pessoa c_bbbbbbbb",
      email: "nespereira@exemplo.pt",
      funcao: "secretaria",
      perfil: "entidade",
      entidades: [{ id: "nespereira", nome: "Paróquia de Nespereira" }],
    });
    expect(r.resposta.headers.get("cache-control")).toBe("no-store");
  });

  it("rota desconhecida: 404", async () => {
    expect((await pedir("/api/nada")).estado).toBe(404);
  });
});

describe("âmbito por perfil (D25)", () => {
  it("admin vê todas as entidades; entidade só as suas", async () => {
    expect(((await pedir("/api/entidades")).corpo as unknown[]).length).toBe(2);
    const deles = (await pedir("/api/entidades", { email: "nespereira@exemplo.pt" })).corpo as {
      id: string;
    }[];
    expect(deles.map((e) => e.id)).toEqual(["nespereira"]);
  });

  it("contacto de Nespereira não lê Polvoreira (C20)", async () => {
    const r = await pedir("/api/entidades/polvoreira", { email: "nespereira@exemplo.pt" });
    expect(r.estado).toBe(403);
    expect(r.corpo).toMatchObject({ erro: "ambito" });
  });

  it("sem GitHub App: lê do último build, sem SHA", async () => {
    const r = await pedir("/api/entidades/nespereira", { email: "nespereira@exemplo.pt" });
    expect(r.estado).toBe(200);
    expect(r.corpo).toMatchObject({ origem: "site", sha: null, entidade: { id: "nespereira" } });
    expect(
      (r.corpo as unknown as { locais: { local: { id: string } }[] }).locais[0]?.local.id,
    ).toBe("nespereira");
  });

  it("id inválido: 400; entidade inexistente: 404", async () => {
    expect((await pedir("/api/entidades/..%2Fsegredo")).estado).toBe(400);
    expect((await pedir("/api/entidades/nao-existe")).estado).toBe(404);
  });
});

describe("acessos (P8)", () => {
  it("só administradores", async () => {
    expect((await pedir("/api/acessos", { email: "nespereira@exemplo.pt" })).estado).toBe(403);
    expect(
      (
        await pedir("/api/acessos", {
          email: "nespereira@exemplo.pt",
          metodo: "POST",
          corpo: novoContacto,
        })
      ).estado,
    ).toBe(403);
  });

  it("escritas exigem a mesma origem e JSON (CSRF)", async () => {
    expect(
      (
        await pedir("/api/acessos", {
          metodo: "POST",
          corpo: novoContacto,
          origem: "https://mau.exemplo",
        })
      ).estado,
    ).toBe(403);
    expect(
      (await pedir("/api/acessos", { metodo: "POST", corpo: novoContacto, origem: null })).estado,
    ).toBe(403);
    expect(
      (await pedir("/api/acessos", { metodo: "POST", corpo: novoContacto, tipo: "text/plain" }))
        .estado,
    ).toBe(415);
  });

  it("cria um contacto, com índice por e-mail e auditoria sem dados pessoais", async () => {
    const r = await pedir("/api/acessos", { metodo: "POST", corpo: novoContacto });
    expect(r.estado).toBe(201);
    const id = r.corpo.id as string;
    expect(id).toMatch(/^c_[0-9a-f]{8}$/);
    expect(await kv.get("email:oliveira@exemplo.pt")).toBe(id);
    const auditoria = [...kv.dados.entries()].filter(([k]) => k.startsWith("auditoria:"));
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]?.[1]).toContain('"acao":"contacto.criar"');
    expect(auditoria[0]?.[1]).not.toContain("oliveira@exemplo.pt");
    // O novo contacto entra e só vê a sua entidade.
    const deles = (await pedir("/api/entidades", { email: "oliveira@exemplo.pt" })).corpo as {
      id: string;
    }[];
    expect(deles.map((e) => e.id)).toEqual(["polvoreira"]);
  });

  it.each([
    ["sem consentimento", { consentimento: undefined }, "consentimento"],
    [
      "consentimento no futuro",
      { consentimento: { em: "2026-12-01", versao: "v1", meio: "papel" } },
      "consentimento",
    ],
    ["entidade inexistente", { entidades: ["inventada"] }, "entidades"],
    ["perfil entidade sem entidades", { entidades: [] }, "entidades"],
    ["e-mail inválido", { email: "x" }, "email"],
    ["perfil desconhecido", { perfil: "dono" }, "perfil"],
  ])("recusa: %s", async (_caso, mudanca, codigo) => {
    const r = await pedir("/api/acessos", {
      metodo: "POST",
      corpo: { ...novoContacto, ...mudanca },
    });
    expect(r.estado).toBe(400);
    expect(r.corpo).toMatchObject({ erro: codigo });
  });

  it("e-mail já usado por outro contacto: 409", async () => {
    const r = await pedir("/api/acessos", {
      metodo: "POST",
      corpo: { ...novoContacto, email: "nespereira@exemplo.pt" },
    });
    expect(r.estado).toBe(409);
  });

  it("lista, edita e suspende; mudar o e-mail move o índice", async () => {
    const lista = (await pedir("/api/acessos")).corpo as { id: string }[];
    expect(lista.map((c) => c.id).sort()).toEqual(["c_aaaaaaaa", "c_bbbbbbbb", "c_cccccccc"]);
    const r = await pedir("/api/acessos/c_bbbbbbbb", {
      metodo: "PUT",
      corpo: {
        ...novoContacto,
        email: "novo@exemplo.pt",
        estado: "suspenso",
        entidades: ["nespereira"],
      },
    });
    expect(r.estado).toBe(200);
    expect(await kv.get("email:nespereira@exemplo.pt")).toBeNull();
    expect(await kv.get("email:novo@exemplo.pt")).toBe("c_bbbbbbbb");
    expect((await pedir("/api/eu", { email: "novo@exemplo.pt" })).corpo).toMatchObject({
      erro: "suspenso",
    });
    expect([...kv.dados.values()].some((v) => v.includes('"acao":"contacto.suspenso"'))).toBe(true);
  });

  it("ninguém se tira de admin a si próprio; fica sempre um admin", async () => {
    const proprio = await pedir("/api/acessos/c_aaaaaaaa", {
      metodo: "PUT",
      corpo: {
        ...novoContacto,
        email: "admin@exemplo.pt",
        perfil: "entidade",
        entidades: ["nespereira"],
      },
    });
    expect(proprio.corpo).toMatchObject({ erro: "proprio" });
    // Um segundo admin tenta suspender o primeiro, que é o único além dele: permitido; e depois o inverso, não.
    await registar(contacto("c_dddddddd", "admin2@exemplo.pt", { perfil: "admin", entidades: [] }));
    const suspender = await pedir("/api/acessos/c_aaaaaaaa", {
      email: "admin2@exemplo.pt",
      metodo: "PUT",
      corpo: {
        ...novoContacto,
        email: "admin@exemplo.pt",
        perfil: "admin",
        entidades: [],
        estado: "suspenso",
      },
    });
    expect(suspender.estado).toBe(200);
  });

  it("um admin suspenso não entra", async () => {
    await registar(
      contacto("c_eeeeeeee", "velho@exemplo.pt", {
        perfil: "admin",
        estado: "suspenso",
        entidades: [],
      }),
    );
    expect((await pedir("/api/eu", { email: "velho@exemplo.pt" })).estado).toBe(403);
  });

  it("contacto inexistente, id inválido, corpo inválido e método", async () => {
    expect(
      (await pedir("/api/acessos/c_00000000", { metodo: "PUT", corpo: novoContacto })).estado,
    ).toBe(404);
    expect((await pedir("/api/acessos/xyz", { metodo: "PUT", corpo: novoContacto })).estado).toBe(
      400,
    );
    expect((await pedir("/api/acessos/c_bbbbbbbb", { metodo: "DELETE", corpo: {} })).estado).toBe(
      405,
    );
    const r = await tratarApiPainel(
      new Request(`${ORIGEM}/api/acessos`, {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": await access.token("admin@exemplo.pt", AGORA),
          origin: ORIGEM,
          "content-type": "application/json",
        },
        body: "{nao json",
      }),
      env,
      { agora: AGORA, obterChaves: access.obterChaves },
    );
    expect(r.status).toBe(400);
  });
});
