/**
 * API do painel (§9.4): `/api/eu`, `/api/entidades`, `/api/entidades/:id`, `/api/acessos`.
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA: identidade, âmbito por perfil e escrita de contactos.
 *
 * Em todos os pedidos: JWT do Access verificado (`identidade`), contacto ativo no KV e âmbito
 * (`podeVer`). Nas escritas: mesma origem e `application/json` (contra CSRF), corpo pequeno e
 * perfil `admin`. Respostas nunca guardadas em cache.
 */
import { lerEntidade, lerLocal } from "@missas/dados";
import {
  auditar,
  gravarContacto,
  listarContactos,
  novoId,
  obterContacto,
  obterPorEmail,
  podeEntrar,
  podeVer,
  validarDadosContacto,
  type Contacto,
} from "../contactos.ts";
import { ErroGithub, lerArquivo, type Buscar, type EnvGithub } from "../github.ts";
import { identidade, type EnvIdentidade, type ObterChaves } from "../identidade.ts";

export interface EnvPainel extends EnvIdentidade, EnvGithub {
  ASSETS: { fetch(pedido: Request): Promise<Response> };
  KV?: KVNamespace;
}

export interface Dependencias {
  agora?: Date;
  obterChaves?: ObterChaves;
  buscar?: Buscar;
}

/** Catálogo publicado no build do site (`/dados/catalogo.json`). */
export interface Catalogo {
  entidades: { id: string; nome: string; tipo: string; locais: string[] }[];
  locais: Record<string, unknown>;
}

const TAMANHO_MAXIMO = 8192;
const PADRAO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PADRAO_ID_CONTACTO = /^c_[0-9a-f]{8}$/;

function json(corpo: unknown, estado = 200): Response {
  return Response.json(corpo, { status: estado, headers: { "cache-control": "no-store" } });
}

const erro = (estado: number, codigo: string) => json({ ok: false, erro: codigo }, estado);

async function catalogo(env: EnvPainel, origem: string): Promise<Catalogo> {
  const resposta = await env.ASSETS.fetch(new Request(`${origem}/dados/catalogo.json`));
  if (!resposta.ok) throw new Error(`catálogo ${resposta.status}`);
  return resposta.json();
}

function publico(c: Contacto) {
  return {
    id: c.id,
    nome: c.nome,
    email: c.email,
    funcao: c.funcao,
    perfil: c.perfil,
    entidades: c.entidades,
    estado: c.estado,
    consentimento: c.consentimento,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
  };
}

async function lerCorpo(pedido: Request): Promise<unknown> {
  const texto = await pedido.text();
  if (texto.length > TAMANHO_MAXIMO) throw new RangeError("tamanho");
  return JSON.parse(texto);
}

/** Estado atual de uma entidade e dos seus locais, lido do `main` (ou do último build). */
async function entidadeAtual(env: EnvPainel, id: string, cat: Catalogo, deps: Dependencias) {
  const doCatalogo = cat.entidades.find((e) => e.id === id);
  if (!doCatalogo) return null;
  try {
    const opcoes = {
      ...(deps.buscar && { buscar: deps.buscar }),
      ...(deps.agora && { agora: deps.agora }),
    };
    const arquivoEntidade = await lerArquivo(env, `dados/entidades/${id}.yml`, opcoes);
    if (!arquivoEntidade) return null;
    const entidade = lerEntidade(arquivoEntidade.conteudo);
    const locais = await Promise.all(
      entidade.locais.map(async (localId) => {
        const arquivo = await lerArquivo(env, `dados/locais/${localId}.yml`, opcoes);
        return arquivo ? { local: lerLocal(arquivo.conteudo), sha: arquivo.sha } : null;
      }),
    );
    return { origem: "main", entidade, sha: arquivoEntidade.sha, locais: locais.filter(Boolean) };
  } catch (e) {
    // Sem GitHub App configurada: dados do último build (só leitura, sem SHA).
    if (!(e instanceof ErroGithub && e.estado === 503)) throw e;
    return {
      origem: "site",
      entidade: doCatalogo,
      sha: null,
      locais: doCatalogo.locais
        .map((l) => ({ local: cat.locais[l], sha: null }))
        .filter((l) => l.local),
    };
  }
}

export async function tratarApiPainel(
  pedido: Request,
  env: EnvPainel,
  deps: Dependencias = {},
): Promise<Response> {
  const url = new URL(pedido.url);
  const metodo = pedido.method;
  const escrita = metodo !== "GET" && metodo !== "HEAD";

  if (escrita) {
    if (pedido.headers.get("origin") !== url.origin) return erro(403, "origem");
    if (!(pedido.headers.get("content-type") ?? "").startsWith("application/json"))
      return erro(415, "tipo");
  }

  const quem = await identidade(pedido, env, {
    ...(deps.agora && { agora: deps.agora }),
    ...(deps.obterChaves && { obterChaves: deps.obterChaves }),
  });
  if (!quem) return erro(401, "sem_identidade");
  if (!env.KV) return erro(503, "indisponivel");
  const kv = env.KV;

  const eu = await obterPorEmail(kv, quem.email);
  if (!eu) return erro(403, "sem_acesso");
  if (!podeEntrar(eu)) return erro(403, "suspenso");

  const agora = deps.agora ?? new Date();
  const hoje = agora.toISOString().slice(0, 10);
  const caminho = url.pathname.replace(/\/+$/, "");
  const cat = await catalogo(env, url.origin);
  const nomeDe = (id: string) => cat.entidades.find((e) => e.id === id)?.nome ?? id;

  // GET /api/eu
  if (caminho === "/api/eu" && metodo === "GET") {
    return json({
      id: eu.id,
      nome: eu.nome,
      email: eu.email,
      funcao: eu.funcao,
      perfil: eu.perfil,
      entidades: eu.entidades.map((id) => ({ id, nome: nomeDe(id) })),
    });
  }

  // GET /api/entidades — as que a pessoa pode ver
  if (caminho === "/api/entidades" && metodo === "GET") {
    const visiveis = cat.entidades.filter((e) => podeVer(eu, e.id));
    return json(visiveis.map(({ id, nome, tipo, locais }) => ({ id, nome, tipo, locais })));
  }

  // GET /api/entidades/:id
  const mEntidade = /^\/api\/entidades\/([^/]+)$/.exec(caminho);
  if (mEntidade && metodo === "GET") {
    const id = decodeURIComponent(mEntidade[1] ?? "");
    if (!PADRAO_ID.test(id)) return erro(400, "id");
    if (!podeVer(eu, id)) return erro(403, "ambito");
    try {
      const atual = await entidadeAtual(env, id, cat, deps);
      return atual ? json(atual) : erro(404, "entidade");
    } catch {
      return erro(502, "github");
    }
  }

  // /api/acessos — só administradores (P8)
  if (caminho === "/api/acessos" || caminho.startsWith("/api/acessos/")) {
    if (eu.perfil !== "admin") return erro(403, "perfil");
    const existentes = new Set(cat.entidades.map((e) => e.id));

    if (caminho === "/api/acessos" && metodo === "GET") {
      return json((await listarContactos(kv)).map(publico));
    }

    if (caminho === "/api/acessos" && metodo === "POST") {
      let corpo: unknown;
      try {
        corpo = await lerCorpo(pedido);
      } catch {
        return erro(400, "corpo");
      }
      const dados = validarDadosContacto(corpo, existentes, hoje);
      if (typeof dados === "string") return erro(400, dados);
      const contacto: Contacto = {
        id: novoId(),
        ...dados,
        criado_em: agora.toISOString(),
        atualizado_em: agora.toISOString(),
      };
      if ((await gravarContacto(kv, contacto, null)) === "email_em_uso")
        return erro(409, "email_em_uso");
      await auditar(
        kv,
        eu.id,
        "contacto.criar",
        { id: contacto.id, perfil: contacto.perfil, entidades: contacto.entidades },
        agora,
      );
      return json(publico(contacto), 201);
    }

    const mContacto = /^\/api\/acessos\/([^/]+)$/.exec(caminho);
    if (mContacto && metodo === "PUT") {
      const id = mContacto[1] ?? "";
      if (!PADRAO_ID_CONTACTO.test(id)) return erro(400, "id");
      const anterior = await obterContacto(kv, id);
      if (!anterior) return erro(404, "contacto");
      let corpo: unknown;
      try {
        corpo = await lerCorpo(pedido);
      } catch {
        return erro(400, "corpo");
      }
      const dados = validarDadosContacto(corpo, existentes, hoje);
      if (typeof dados === "string") return erro(400, dados);
      const novo: Contacto = { ...anterior, ...dados, atualizado_em: agora.toISOString() };
      // Ninguém se tira a si próprio de administrador nem se suspende (evita ficar sem acesso).
      if (id === eu.id && (novo.perfil !== "admin" || !podeEntrar(novo)))
        return erro(400, "proprio");
      // Tem de ficar sempre pelo menos um administrador ativo.
      if (
        anterior.perfil === "admin" &&
        podeEntrar(anterior) &&
        !(novo.perfil === "admin" && podeEntrar(novo))
      ) {
        const admins = (await listarContactos(kv)).filter(
          (c) => c.perfil === "admin" && podeEntrar(c) && c.id !== id,
        );
        if (admins.length === 0) return erro(400, "ultimo_admin");
      }
      if ((await gravarContacto(kv, novo, anterior)) === "email_em_uso")
        return erro(409, "email_em_uso");
      await auditar(
        kv,
        eu.id,
        novo.estado !== anterior.estado ? `contacto.${novo.estado}` : "contacto.editar",
        { id, perfil: novo.perfil, entidades: novo.entidades },
        agora,
      );
      return json(publico(novo));
    }
    return erro(405, "metodo");
  }

  return erro(404, "rota");
}
