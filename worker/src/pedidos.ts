/**
 * Pedidos de gravação no Worker (§8.6, §9.4). REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 *   POST /api/pedidos            valida, verifica os SHA no `main`, assina e dispara o workflow
 *   GET  /api/pedidos(/:id)      estado dos pedidos (dono ou `admin`)
 *   POST /api/interno/estado     estados vindos do GitHub Actions (HMAC `AVISO_HMAC`, sem Access)
 *   GET  /api/entidades/:id/historico   commits que tocaram nos arquivos da entidade (§8.8)
 *   GET  /api/entidades/:id/versao/:sha  a entidade e os seus locais num commit do `main`
 *
 * O Worker assina só o que o próprio contacto pode fazer: a entidade tem de estar no seu âmbito
 * e os restauros são só de `admin`. Os campos do servidor (id, instante, contacto, canal) nunca
 * vêm do corpo. O GitHub Actions repete todas as verificações antes de gravar.
 *
 *   pedido:<id>                       registo do pedido (90 dias)
 *   recentes:<inverso>:<id>           índice de todos, do mais recente para o mais antigo
 *   recentes-de:<contacto>:<inverso>:<id>   índice de cada contacto
 *   limite:pedidos:<contacto>:<hora>  contador do limite por contacto
 */
import {
  assinar,
  caminhoEntidade,
  codificarPedido,
  lerEntidade,
  lerLocal,
  lerPedido,
  novoIdPedido,
  PADRAO_ID_PEDIDO,
  prepararPedido,
  verificarAssinatura,
  type Pedido,
  type ResumoLocal,
} from "@missas/dados";
import { obterContacto, podeVer, type Contacto } from "./contactos.ts";
import {
  dispararWorkflow,
  eAntepassadoDoMain,
  lerArquivo,
  listarCommits,
  type EnvGithub,
  type OpcoesGithub,
} from "./github.ts";

export interface EnvPedidos extends EnvGithub {
  KV?: KVNamespace;
  PEDIDO_HMAC?: string;
  AVISO_HMAC?: string;
}

export type EstadoPedido = "A_GRAVAR" | "GRAVADO" | "PUBLICADO" | "CONFLITO" | "ERRO";

export interface RegistoPedido {
  id: string;
  tipo: Pedido["tipo"];
  entidade: string;
  /** Id opaco de quem enviou. */
  contacto: string;
  estado: EstadoPedido;
  criado_em: string;
  atualizado_em: string;
  resumo: ResumoLocal[];
  alertas: string[];
  sha?: string;
  motivo?: string;
}

const DURACAO_REGISTO_S = 90 * 24 * 60 * 60;
/** §9.4: limite por contacto. */
export const LIMITE_POR_HORA = 30;
export const TAMANHO_MAXIMO_PEDIDO = 40_000;
/** Os inputs de um `workflow_dispatch` não podem passar de 65 535 caracteres. */
const TAMANHO_MAXIMO_INPUT = 60_000;
const TAMANHO_MAXIMO_AVISO = 8192;
const JANELA_AVISO_MS = 5 * 60 * 1000;
const WORKFLOW = "aplicar-pedido.yml";
const ESTADOS_AVISO: readonly EstadoPedido[] = ["GRAVADO", "CONFLITO", "ERRO", "PUBLICADO"];
/**
 * Transições aceites. Os estados só avançam, e um desfecho (`GRAVADO`, `CONFLITO`, `ERRO`) não
 * muda para outro: repetir um aviso não tem efeito. `PUBLICADO` só depois de `GRAVADO` (ou se o
 * aviso de `GRAVADO` se perdeu); nunca depois de `CONFLITO` ou `ERRO`.
 */
const TRANSICOES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  A_GRAVAR: ["GRAVADO", "CONFLITO", "ERRO", "PUBLICADO"],
  GRAVADO: ["PUBLICADO"],
  CONFLITO: [],
  ERRO: [],
  PUBLICADO: [],
};
const LISTA_MAXIMA = 50;
/** Chave que ordena do mais recente para o mais antigo (o KV lista por ordem crescente). */
const inverso = (instante: Date) =>
  String(9_999_999_999_999 - instante.getTime()).padStart(13, "0");

function json(corpo: unknown, estado = 200): Response {
  return Response.json(corpo, { status: estado, headers: { "cache-control": "no-store" } });
}
const erro = (estado: number, codigo: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, erro: codigo, ...extra }, estado);

function objeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function opcoesGithub(deps: { buscar?: typeof fetch; agora?: Date }): OpcoesGithub {
  return { ...(deps.buscar && { buscar: deps.buscar }), ...(deps.agora && { agora: deps.agora }) };
}

/**
 * Os arquivos de que a verificação precisa, lidos do `main`: o calendário, a entidade, os seus
 * locais e os arquivos que o pedido toca. Basta para as guardas, os SHA e a validação: a
 * entidade e os locais referem-se só uns aos outros.
 */
async function lerRepositorio(
  env: EnvPedidos,
  pedido: Pedido,
  opcoes: OpcoesGithub,
): Promise<Map<string, string> | null | "base"> {
  const repo = new Map<string, string>();
  const pEntidade = caminhoEntidade(pedido.entidade);
  const [calendario, entidade] = await Promise.all([
    lerArquivo(env, "dados/calendario.yml", opcoes),
    lerArquivo(env, pEntidade, opcoes),
  ]);
  if (!entidade) return null;
  if (calendario) repo.set("dados/calendario.yml", calendario.conteudo);
  repo.set(pEntidade, entidade.conteudo);
  const locais = lerEntidade(entidade.conteudo).locais.map((id) => `dados/locais/${id}.yml`);
  const arquivos = Object.keys(pedido.arquivos ?? {});
  // O `base` só fala dos arquivos da entidade ou dos que o pedido escreve.
  const conhecidos = new Set([pEntidade, ...locais, ...arquivos]);
  if (!Object.keys(pedido.base).every((c) => conhecidos.has(c))) return "base";
  const caminhos = new Set([...locais, ...arquivos]);
  caminhos.delete(pEntidade);
  const lidos = await Promise.all(
    [...caminhos].map(async (c) => [c, await lerArquivo(env, c, opcoes)] as const),
  );
  for (const [c, arquivo] of lidos) if (arquivo) repo.set(c, arquivo.conteudo);
  return repo;
}

async function dentroDoLimite(kv: KVNamespace, contacto: string, agora: Date): Promise<boolean> {
  const chave = `limite:pedidos:${contacto}:${agora.toISOString().slice(0, 13)}`;
  const contagem = Number((await kv.get(chave)) ?? "0");
  if (contagem >= LIMITE_POR_HORA) return false;
  try {
    await kv.put(chave, String(contagem + 1), { expirationTtl: 2 * 60 * 60 });
  } catch {
    // O KV aceita uma escrita por segundo na mesma chave: um duplo clique não deve dar 500.
  }
  return true;
}

/** `POST /api/pedidos`. O corpo já foi lido (até `TAMANHO_MAXIMO_PEDIDO`). */
export async function criarPedido(
  corpo: unknown,
  eu: Contacto,
  env: EnvPedidos,
  kv: KVNamespace,
  deps: { buscar?: typeof fetch; agora?: Date } = {},
): Promise<Response> {
  if (!env.PEDIDO_HMAC) return erro(503, "gravacao_indisponivel");
  if (!objeto(corpo)) return erro(400, "corpo");
  const agora = deps.agora ?? new Date();

  // Campos do servidor: nunca vêm do corpo.
  const lido = lerPedido({
    versao: 1,
    id: novoIdPedido(),
    tipo: corpo.tipo,
    emitido_em: agora.toISOString().replace(/\.\d+Z$/, "Z"),
    contacto: { ref: eu.id, funcao: eu.funcao },
    canal: "painel",
    entidade: corpo.entidade,
    base: corpo.base ?? {},
    ...(corpo.arquivos !== undefined && { arquivos: corpo.arquivos }),
    resumo: corpo.resumo ?? [],
    ...(corpo.restaura !== undefined && { restaura: corpo.restaura }),
  });
  if (typeof lido === "string") return erro(400, "pedido", { motivo: lido });
  const pedido = lido;

  if (!podeVer(eu, pedido.entidade)) return erro(403, "ambito");
  if (pedido.tipo === "restauro" && eu.perfil !== "admin") return erro(403, "perfil");
  if (!(await dentroDoLimite(kv, eu.id, agora))) return erro(429, "limite");

  const opcoes = opcoesGithub(deps);
  let resultado;
  try {
    const repo = await lerRepositorio(env, pedido, opcoes);
    if (repo === "base") return erro(400, "pedido", { motivo: "base" });
    if (!repo) return erro(404, "entidade");
    let versaoRestaurada: ((c: string) => string | undefined) | undefined;
    if (pedido.restaura) {
      const ref = pedido.restaura;
      // Só commits do histórico do `main` (a API também resolve commits de forks).
      if (!(await eAntepassadoDoMain(env, ref, opcoes)))
        return erro(422, "invalido", { motivo: "restauro: o commit não pertence ao main" });
      const antigos = await Promise.all(
        Object.keys(pedido.arquivos ?? {}).map(
          async (c) => [c, (await lerArquivo(env, c, { ...opcoes, ref }))?.conteudo] as const,
        ),
      );
      const mapa = new Map(antigos);
      versaoRestaurada = (c) => mapa.get(c);
    }
    resultado = await prepararPedido(pedido, repo, {
      agora,
      formatoCanonico: false,
      ...(versaoRestaurada && { versaoRestaurada }),
    });
  } catch {
    return erro(502, "github");
  }

  if (resultado.estado === "CONFLITO") return erro(409, "conflito", { motivo: resultado.motivo });
  if (resultado.estado === "ERRO")
    return erro(422, "invalido", {
      motivo: resultado.motivo,
      ...(resultado.problemas && { problemas: resultado.problemas }),
    });
  if (resultado.estado === "sem_alteracoes") return json({ ok: true, estado: "sem_alteracoes" });
  // Alertas de anomalia (§8.3, 6-A): só segue com a confirmação reforçada do painel.
  if (resultado.alertas.length > 0 && corpo.confirmar_alertas !== true)
    return erro(428, "confirmar_alertas", { alertas: resultado.alertas });

  const texto = codificarPedido(pedido);
  if (texto.length > TAMANHO_MAXIMO_INPUT) return erro(413, "tamanho");
  try {
    await dispararWorkflow(
      env,
      WORKFLOW,
      { pedido: texto, assinatura: await assinar(env.PEDIDO_HMAC, texto) },
      opcoes,
    );
  } catch {
    return erro(502, "github");
  }

  const registo: RegistoPedido = {
    id: pedido.id,
    tipo: pedido.tipo,
    entidade: pedido.entidade,
    contacto: eu.id,
    estado: "A_GRAVAR",
    criado_em: agora.toISOString(),
    atualizado_em: agora.toISOString(),
    resumo: pedido.resumo,
    alertas: resultado.alertas,
  };
  const ttl = { expirationTtl: DURACAO_REGISTO_S };
  await kv.put(`pedido:${pedido.id}`, JSON.stringify(registo), ttl);
  await kv.put(`recentes:${inverso(agora)}:${pedido.id}`, pedido.id, ttl);
  await kv.put(`recentes-de:${eu.id}:${inverso(agora)}:${pedido.id}`, pedido.id, ttl);
  return json({ ok: true, id: pedido.id, estado: "A_GRAVAR", alertas: resultado.alertas }, 202);
}

const podeConsultar = (eu: Contacto, r: RegistoPedido) =>
  eu.perfil === "admin" || r.contacto === eu.id;

/**
 * `GET /api/pedidos`: os 50 mais recentes do próprio contacto (ou de todos, para `admin`). Lê só
 * o índice ordenado, nunca todos os registos.
 */
export async function listarPedidos(eu: Contacto, kv: KVNamespace): Promise<Response> {
  const prefixo = eu.perfil === "admin" ? "recentes:" : `recentes-de:${eu.id}:`;
  const pagina = await kv.list({ prefix: prefixo, limit: LISTA_MAXIMA });
  const registos = await Promise.all(
    pagina.keys.map((k) =>
      kv.get<RegistoPedido>(`pedido:${k.name.split(":").at(-1) ?? ""}`, "json"),
    ),
  );
  return json(registos.filter((r): r is RegistoPedido => r !== null && podeConsultar(eu, r)));
}

/** `GET /api/pedidos/:id`. Quem não pode ver recebe 404 (não se confirma que existe). */
export async function obterPedido(eu: Contacto, kv: KVNamespace, id: string): Promise<Response> {
  if (!PADRAO_ID_PEDIDO.test(id)) return erro(400, "id");
  const r = await kv.get<RegistoPedido>(`pedido:${id}`, "json");
  if (!r || !podeConsultar(eu, r)) return erro(404, "pedido");
  return json(r);
}

/**
 * `POST /api/interno/estado`, do GitHub Actions. Sem Access nem cookies: vale só a assinatura
 * `AVISO_HMAC` sobre o corpo exato, com o instante `em` a menos de 5 minutos. Repetir um aviso
 * não tem efeito (os estados só avançam).
 */
export async function tratarEstadoInterno(
  pedido: Request,
  env: EnvPedidos,
  agora = new Date(),
): Promise<Response> {
  if (pedido.method !== "POST") return erro(405, "metodo");
  if (!env.AVISO_HMAC || !env.KV) return erro(503, "indisponivel");
  const texto = await pedido.text();
  if (texto.length > TAMANHO_MAXIMO_AVISO) return erro(413, "tamanho");
  const assinatura = pedido.headers.get("x-assinatura") ?? "";
  if (!(await verificarAssinatura(env.AVISO_HMAC, texto, assinatura)))
    return erro(401, "assinatura");

  let aviso: unknown;
  try {
    aviso = JSON.parse(texto);
  } catch {
    return erro(400, "corpo");
  }
  if (!objeto(aviso)) return erro(400, "corpo");
  const { pedido: id, estado, em, sha, motivo, alertas } = aviso;
  if (typeof id !== "string" || !PADRAO_ID_PEDIDO.test(id)) return erro(400, "pedido");
  if (!ESTADOS_AVISO.includes(estado as EstadoPedido)) return erro(400, "estado");
  const instante = typeof em === "string" ? Date.parse(em) : NaN;
  if (Number.isNaN(instante) || Math.abs(agora.getTime() - instante) > JANELA_AVISO_MS)
    return erro(400, "em");
  if (sha !== undefined && (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)))
    return erro(400, "sha");
  if (motivo !== undefined && (typeof motivo !== "string" || motivo.length > 1000))
    return erro(400, "motivo");
  if (
    alertas !== undefined &&
    (!Array.isArray(alertas) ||
      alertas.length > 50 ||
      !alertas.every((a) => typeof a === "string" && a.length <= 300))
  )
    return erro(400, "alertas");

  const kv = env.KV;
  const r = await kv.get<RegistoPedido>(`pedido:${id}`, "json");
  // Pedidos enviados por linha de comandos não têm registo: nada a atualizar.
  if (!r) return json({ ok: true, ignorado: true });
  const novo = estado as EstadoPedido;
  if (!TRANSICOES[r.estado].includes(novo)) return json({ ok: true, ignorado: true });
  // A publicação tem de ser do commit que gravou este pedido.
  if (novo === "PUBLICADO" && r.sha !== undefined && sha !== r.sha)
    return json({ ok: true, ignorado: true });

  const atualizado: RegistoPedido = {
    ...r,
    estado: novo,
    atualizado_em: agora.toISOString(),
    ...(sha !== undefined && { sha }),
    ...(motivo !== undefined && { motivo }),
    ...(alertas !== undefined && { alertas: alertas as string[] }),
  };
  await kv.put(`pedido:${id}`, JSON.stringify(atualizado), { expirationTtl: DURACAO_REGISTO_S });
  return json({ ok: true });
}

// ── Histórico (§8.8) ────────────────────────────────────────────────────────────────────────

export interface VersaoHistorico {
  sha: string;
  data: string;
  titulo: string;
  linhas: string[];
  pedido: string | null;
  contacto: { ref: string; funcao: string | null; nome?: string } | null;
  canal: string | null;
  restaura: string | null;
}

/** Lê o título, as linhas do resumo e os *trailers* de uma mensagem de commit. */
export function lerMensagem(mensagem: string): Omit<VersaoHistorico, "sha" | "data"> {
  const paragrafos = mensagem.trim().split(/\n\s*\n/);
  const titulo = (paragrafos.shift() ?? "").trim();
  const trailers = new Map<string, string>();
  const ultimo = paragrafos.at(-1) ?? "";
  const linhasUltimo = ultimo.split("\n");
  if (paragrafos.length > 0 && linhasUltimo.every((l) => /^[A-Za-z-]+: .+$/.test(l))) {
    paragrafos.pop();
    for (const l of linhasUltimo) {
      const i = l.indexOf(": ");
      trailers.set(l.slice(0, i), l.slice(i + 2).trim());
    }
  }
  const contacto = /^(c_[0-9a-f]+)(?: \((.+)\))?$/.exec(trailers.get("Contacto") ?? "");
  return {
    titulo,
    linhas: paragrafos.flatMap((p) => p.split("\n")).map((l) => l.trimEnd()),
    pedido: trailers.get("Pedido") ?? null,
    contacto: contacto ? { ref: contacto[1] ?? "", funcao: contacto[2] ?? null } : null,
    canal: trailers.get("Canal") ?? null,
    restaura: trailers.get("Restaura") ?? null,
  };
}

/**
 * `GET /api/entidades/:id/historico` (o âmbito já foi verificado). Junta os commits de cada
 * arquivo da entidade, do mais recente para o mais antigo. O nome de quem gravou só aparece a
 * um `admin` ou à própria pessoa; os outros veem a função.
 */
export async function historico(
  env: EnvPedidos,
  kv: KVNamespace,
  eu: Contacto,
  entidade: string,
  deps: { buscar?: typeof fetch; agora?: Date } = {},
): Promise<Response> {
  const opcoes = opcoesGithub(deps);
  let versoes: VersaoHistorico[];
  try {
    const pEntidade = caminhoEntidade(entidade);
    const arquivo = await lerArquivo(env, pEntidade, opcoes);
    if (!arquivo) return erro(404, "entidade");
    const caminhos = [
      pEntidade,
      ...lerEntidade(arquivo.conteudo).locais.map((id) => `dados/locais/${id}.yml`),
    ];
    const listas = await Promise.all(caminhos.map((c) => listarCommits(env, c, opcoes)));
    const unicos = new Map(listas.flat().map((c) => [c.sha, c]));
    versoes = [...unicos.values()]
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 30)
      .map((c) => ({ sha: c.sha, data: c.data, ...lerMensagem(c.mensagem) }));
  } catch {
    return erro(502, "github");
  }
  const nomes = new Map<string, string>();
  for (const v of versoes) {
    const ref = v.contacto?.ref;
    if (!ref || nomes.has(ref) || (eu.perfil !== "admin" && ref !== eu.id)) continue;
    const c = await obterContacto(kv, ref);
    if (c) nomes.set(ref, c.nome);
  }
  return json(
    versoes.map((v) => {
      const nome = v.contacto && nomes.get(v.contacto.ref);
      return nome && v.contacto ? { ...v, contacto: { ...v.contacto, nome } } : v;
    }),
  );
}

/**
 * `GET /api/entidades/:id/versao/:sha` (o âmbito já foi verificado): a entidade e os locais que
 * ela listava nesse commit, para o painel mostrar a diferença antes de um restauro. Só commits
 * do histórico do `main`.
 */
export async function versaoDaEntidade(
  env: EnvPedidos,
  entidade: string,
  sha: string,
  deps: { buscar?: typeof fetch; agora?: Date } = {},
): Promise<Response> {
  if (!/^[0-9a-f]{40}$/.test(sha)) return erro(400, "sha");
  const opcoes = opcoesGithub(deps);
  try {
    if (!(await eAntepassadoDoMain(env, sha, opcoes))) return erro(404, "versao");
    const arquivo = await lerArquivo(env, caminhoEntidade(entidade), { ...opcoes, ref: sha });
    if (!arquivo) return erro(404, "versao");
    const dados = lerEntidade(arquivo.conteudo);
    const locais = await Promise.all(
      dados.locais.map(async (id) => {
        const local = await lerArquivo(env, `dados/locais/${id}.yml`, { ...opcoes, ref: sha });
        return local ? { local: lerLocal(local.conteudo) } : null;
      }),
    );
    return json({ sha, entidade: dados, locais: locais.filter(Boolean) });
  } catch (e) {
    // Uma versão que já não cumpre o esquema atual não pode ser restaurada.
    return e instanceof Error && e.name === "ErroLeitura"
      ? erro(422, "versao_invalida")
      : erro(502, "github");
  }
}
