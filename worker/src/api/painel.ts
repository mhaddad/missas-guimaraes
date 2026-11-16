/**
 * API do painel (§9.4, ADR-005). REVISÃO DE SEGURANÇA OBRIGATÓRIA: sessão, âmbito por perfil,
 * gravação e escrita de contactos.
 *
 *   GET  /api/eu
 *   GET  /api/entidades                      as que a pessoa pode ver
 *   GET  /api/entidades/:id                  estado atual, com a versão de cada registo
 *   GET  /api/entidades/:id/historico        gravações (data, quem, resumo)
 *   GET  /api/entidades/:id/gravacoes/:g     estado da entidade depois dessa gravação
 *   POST /api/gravacoes                      confirmação, alteração, novo local ou restauro
 *   GET/POST /api/acessos · PUT /api/acessos/:id   só administradores
 *
 * Em todos os pedidos: sessão válida (cookie) e contacto ativo; âmbito (`podeVer`). Nas
 * escritas: mesma origem e `application/json` (contra CSRF), corpo limitado. Sem cache.
 */
import { lerCalendario, lerPedidoGravacao, prepararGravacao, PADRAO_ID } from "@missas/dados";
import type { Calendario, Entidade, Local } from "@missas/horarios";
import CALENDARIO_YAML from "../../../dados/calendario.yml?raw";
import {
  ConflitoDeVersao,
  estadoNaGravacao,
  gravar,
  historicoDaEntidade,
  lerEstado,
  lerTudo,
} from "../bd.ts";
import {
  auditar,
  gravarContacto,
  listarContactos,
  novoId,
  obterContacto,
  podeEntrar,
  podeVer,
  validarDadosContacto,
  type Contacto,
} from "../contactos.ts";
import { lerSessao } from "../sessao.ts";

export interface EnvPainel {
  BD?: D1Database;
  /** Limite de gravações por contacto (Workers Rate Limiting). */
  LIMITE_PAINEL?: RateLimit;
}

export interface Dependencias {
  agora?: Date;
}

const TAMANHO_MAXIMO = 8192;
const TAMANHO_MAXIMO_GRAVACAO = 60_000;
const PADRAO_ID_CONTACTO = /^c_[0-9a-f]{8}$/;
const ROTULOS_FUNCAO: Record<string, string> = {
  paroco: "pároco",
  secretaria: "secretaria",
  colaborador: "colaborador",
  equipa: "equipa",
};

let calendario: Calendario | undefined;
const regrasDosDiasSantos = () => (calendario ??= lerCalendario(CALENDARIO_YAML));

function json(corpo: unknown, estado = 200): Response {
  return Response.json(corpo, { status: estado, headers: { "cache-control": "no-store" } });
}
const erro = (estado: number, codigo: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, erro: codigo, ...extra }, estado);

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

async function lerCorpo(pedido: Request, maximo = TAMANHO_MAXIMO): Promise<unknown> {
  const texto = await pedido.text();
  if (texto.length > maximo) throw new RangeError("tamanho");
  return JSON.parse(texto);
}

const resumoEntidade = (e: Entidade) => ({
  id: e.id,
  nome: e.nome,
  tipo: e.tipo,
  locais: e.locais,
});

/** Histórico: o nome de quem gravou só para `admin` ou para a própria pessoa. */
async function historico(bd: D1Database, eu: Contacto, entidade: string) {
  const gravacoes = await historicoDaEntidade(bd, entidade);
  const contactos = new Map<string, Contacto | null>();
  for (const g of gravacoes) {
    const ref = g.contacto_id;
    if (ref && !contactos.has(ref)) contactos.set(ref, await obterContacto(bd, ref));
  }
  return gravacoes.map((g) => {
    const c = g.contacto_id ? contactos.get(g.contacto_id) : null;
    const verNome = c && (eu.perfil === "admin" || c.id === eu.id);
    return {
      id: g.id,
      data: g.criado_em,
      acao: g.acao,
      resumo: g.resumo,
      alertas: g.alertas,
      restaura: g.restaura,
      canal: g.canal,
      contacto: g.contacto_id
        ? {
            ref: g.contacto_id,
            funcao: c ? (ROTULOS_FUNCAO[c.funcao] ?? c.funcao) : null,
            ...(verNome && { nome: c.nome }),
          }
        : null,
    };
  });
}

async function gravacao(
  bd: D1Database,
  eu: Contacto,
  corpo: unknown,
  env: EnvPainel,
  agora: Date,
): Promise<Response> {
  const lido = lerPedidoGravacao(corpo);
  if (typeof lido === "string") return erro(400, "pedido", { motivo: lido });
  if (!podeVer(eu, lido.entidade)) return erro(403, "ambito");
  if (lido.tipo === "restauro" && eu.perfil !== "admin") return erro(403, "perfil");
  if (env.LIMITE_PAINEL && !(await env.LIMITE_PAINEL.limit({ key: eu.id })).success)
    return erro(429, "limite");

  let alvo: { entidade: Entidade; locais: Map<string, Local> } | null = null;
  if (lido.tipo === "restauro") {
    alvo = await estadoNaGravacao(bd, lido.entidade, lido.restaura);
    if (!alvo) return erro(404, "gravacao");
  }
  const outros = [
    ...(lido.tipo === "alteracao" ? Object.keys(lido.locais) : []),
    ...(lido.tipo === "confirmacao" ? Object.keys(lido.base) : []),
    ...(lido.tipo === "novo-local" &&
    typeof lido.local.id === "string" &&
    PADRAO_ID.test(lido.local.id)
      ? [lido.local.id]
      : []),
    ...(alvo ? alvo.entidade.locais : []),
  ];
  const estado = await lerEstado(bd, lido.entidade, outros);
  if (!estado) return erro(404, "entidade");

  const resultado = prepararGravacao(lido, estado, {
    agora,
    contacto: { ref: eu.id, canal: "painel" },
    calendario: regrasDosDiasSantos(),
    ...(alvo && { alvo }),
  });
  if (resultado.estado === "CONFLITO") return erro(409, "conflito", { motivo: resultado.motivo });
  if (resultado.estado === "ERRO")
    return erro(422, "invalido", {
      motivo: resultado.motivo,
      ...(resultado.problemas && { problemas: resultado.problemas }),
    });
  if (resultado.estado === "sem_alteracoes") return json({ ok: true, estado: "sem_alteracoes" });
  // Alertas de anomalia (§8.3, 6-A): só com a confirmação reforçada do painel.
  if (
    resultado.alertas.length > 0 &&
    (corpo as { confirmar_alertas?: unknown }).confirmar_alertas !== true
  )
    return erro(428, "confirmar_alertas", { alertas: resultado.alertas });

  try {
    const id = await gravar(
      bd,
      {
        entidadeId: lido.entidade,
        acao: lido.tipo,
        contactoId: eu.id,
        canal: "painel",
        resumo: resultado.resumo,
        alertas: resultado.alertas,
        ...(lido.tipo === "restauro" && { restaura: lido.restaura }),
        ...(resultado.entidade && {
          entidade: { dados: resultado.entidade, versaoAnterior: estado.entidade.versao },
        }),
        locais: [...resultado.locais.values()].map((dados) => ({
          dados,
          versaoAnterior: estado.locais.get(dados.id)?.versao ?? null,
        })),
      },
      agora,
    );
    return json({ ok: true, estado: "GRAVADO", gravacao: id, alertas: resultado.alertas });
  } catch (e) {
    if (e instanceof ConflitoDeVersao) return erro(409, "conflito", { motivo: e.message });
    throw e;
  }
}

async function acessos(
  pedido: Request,
  bd: D1Database,
  eu: Contacto,
  caminho: string,
  agora: Date,
): Promise<Response> {
  if (eu.perfil !== "admin") return erro(403, "perfil");
  const metodo = pedido.method;
  const hoje = agora.toISOString().slice(0, 10);
  const existentes = new Set((await lerTudo(bd)).entidades.map((e) => e.id));

  if (caminho === "/api/acessos" && metodo === "GET")
    return json((await listarContactos(bd)).map(publico));

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
    if ((await gravarContacto(bd, contacto, null)) === "email_em_uso")
      return erro(409, "email_em_uso");
    await auditar(
      bd,
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
    const anterior = await obterContacto(bd, id);
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
    if (id === eu.id && (novo.perfil !== "admin" || !podeEntrar(novo))) return erro(400, "proprio");
    // Tem de ficar sempre pelo menos um administrador ativo.
    if (
      anterior.perfil === "admin" &&
      podeEntrar(anterior) &&
      !(novo.perfil === "admin" && podeEntrar(novo))
    ) {
      const admins = (await listarContactos(bd)).filter(
        (c) => c.perfil === "admin" && podeEntrar(c) && c.id !== id,
      );
      if (admins.length === 0) return erro(400, "ultimo_admin");
    }
    if ((await gravarContacto(bd, novo, anterior)) === "email_em_uso")
      return erro(409, "email_em_uso");
    await auditar(
      bd,
      eu.id,
      novo.estado !== anterior.estado ? `contacto.${novo.estado}` : "contacto.editar",
      { id, perfil: novo.perfil, entidades: novo.entidades },
      agora,
    );
    return json(publico(novo));
  }
  return erro(405, "metodo");
}

export async function tratarApiPainel(
  pedido: Request,
  env: EnvPainel,
  deps: Dependencias = {},
): Promise<Response> {
  const url = new URL(pedido.url);
  const metodo = pedido.method;
  if (metodo !== "GET" && metodo !== "HEAD") {
    if (pedido.headers.get("origin") !== url.origin) return erro(403, "origem");
    if (!(pedido.headers.get("content-type") ?? "").startsWith("application/json"))
      return erro(415, "tipo");
  }
  if (!env.BD) return erro(503, "indisponivel");
  const bd = env.BD;
  const agora = deps.agora ?? new Date();
  const eu = await lerSessao(bd, pedido, agora);
  if (!eu) return erro(401, "sem_sessao");
  const caminho = url.pathname.replace(/\/+$/, "");

  if (metodo === "GET" && (caminho === "/api/eu" || caminho === "/api/entidades")) {
    const { entidades } = await lerTudo(bd);
    const visiveis = entidades
      .filter((e) => podeVer(eu, e.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    if (caminho === "/api/entidades") return json(visiveis.map(resumoEntidade));
    const nomes = new Map(entidades.map((e) => [e.id, e.nome]));
    return json({
      id: eu.id,
      nome: eu.nome,
      email: eu.email,
      funcao: eu.funcao,
      perfil: eu.perfil,
      entidades: eu.entidades.map((id) => ({ id, nome: nomes.get(id) ?? id })),
    });
  }

  const mEntidade = /^\/api\/entidades\/([^/]+)(?:\/(historico)|\/gravacoes\/(\d{1,12}))?$/.exec(
    caminho,
  );
  if (mEntidade && metodo === "GET") {
    const id = mEntidade[1] ?? "";
    // Sem descodificação: qualquer "%" falha o padrão.
    if (!PADRAO_ID.test(id)) return erro(400, "id");
    if (!podeVer(eu, id)) return erro(403, "ambito");
    if (mEntidade[2]) return json(await historico(bd, eu, id));
    if (mEntidade[3]) {
      const g = Number(mEntidade[3]);
      const estado = await estadoNaGravacao(bd, id, g);
      if (!estado) return erro(404, "gravacao");
      return json({
        gravacao: g,
        entidade: estado.entidade,
        locais: [...estado.locais.values()].map((local) => ({ local })),
      });
    }
    const estado = await lerEstado(bd, id);
    if (!estado) return erro(404, "entidade");
    return json({
      entidade: estado.entidade.dados,
      versao: estado.entidade.versao,
      locais: estado.entidade.dados.locais
        .map((l) => estado.locais.get(l))
        .filter((r) => r !== undefined)
        .map((r) => ({ local: r.dados, versao: r.versao })),
    });
  }

  if (caminho === "/api/gravacoes" && metodo === "POST") {
    let corpo: unknown;
    try {
      corpo = await lerCorpo(pedido, TAMANHO_MAXIMO_GRAVACAO);
    } catch (e) {
      return e instanceof RangeError ? erro(413, "tamanho") : erro(400, "corpo");
    }
    return gravacao(bd, eu, corpo, env, agora);
  }

  if (caminho === "/api/acessos" || caminho.startsWith("/api/acessos/"))
    return acessos(pedido, bd, eu, caminho, agora);

  return erro(404, "rota");
}
