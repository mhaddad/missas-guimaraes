/**
 * Gravação de uma alteração no estado de uma entidade (ADR-005): guardas por tipo, conflitos
 * pelo número de versão, validação completa, resumo recalculado e alertas de anomalia.
 * REVISÃO DE SEGURANÇA OBRIGATÓRIA (guardas de âmbito e de campos).
 *
 * Função pura, sem base de dados: o Worker lê do D1 o estado atual (a entidade e os locais
 * envolvidos), chama `prepararGravacao` e grava o resultado numa só transação.
 */
import {
  iguais,
  momentoEmLisboa,
  type Calendario,
  type Entidade,
  type Local,
} from "@missas/horarios";
import { alertasDeAnomalia, resumirPedido, type ParLocal, type ResumoLocal } from "./resumo.ts";
import { validarDados, type ArquivoDados, type ProblemaDados } from "./validar.ts";

export type TipoGravacao = "confirmacao" | "alteracao" | "novo-local" | "restauro";
export type CanalGravacao = "painel" | "email";

/** Pedido tal como chega do painel (já lido por `lerPedidoGravacao`). */
export type PedidoGravacao =
  | {
      tipo: "confirmacao";
      entidade: string;
      /** Versão de cada local que a pessoa viu antes de confirmar. */
      base: Record<string, number>;
      resumo: ResumoLocal[];
    }
  | {
      tipo: "alteracao";
      entidade: string;
      /** Estado completo de cada local alterado e a versão de onde partiu. */
      locais: Record<string, { versao: number; dados: Record<string, unknown> }>;
      resumo: ResumoLocal[];
    }
  | {
      tipo: "novo-local";
      entidade: string;
      /** Versão da entidade de onde partiu (o novo local é acrescentado à sua lista). */
      versaoEntidade: number;
      local: Record<string, unknown>;
      resumo: ResumoLocal[];
    }
  | {
      tipo: "restauro";
      entidade: string;
      /** Gravação cujo estado se repõe. */
      restaura: number;
      /** Versões atuais da entidade e dos seus locais, como o painel as viu. */
      base: { entidade: number; locais: Record<string, number> };
      resumo: ResumoLocal[];
    };

export interface Registo<T> {
  dados: T;
  versao: number;
}

export interface EstadoEntidade {
  entidade: Registo<Entidade>;
  /**
   * Locais atuais da entidade e qualquer outro local referido pelo pedido (um id novo que já
   * exista, os locais de uma versão a restaurar), com a entidade a que pertencem agora.
   */
  locais: ReadonlyMap<string, Registo<Local>>;
}

export interface OpcoesGravacao {
  agora: Date;
  /** Quem grava: id opaco do contacto e canal (vai para `confirmado_por`). */
  contacto: { ref: string; canal: CanalGravacao };
  /** Regras dos dias santos, para a validação. */
  calendario?: Calendario;
  /** Só em `restauro`: o estado da entidade depois da gravação `restaura`. */
  alvo?: { entidade: Entidade; locais: ReadonlyMap<string, Local> };
}

export type ResultadoGravacao =
  | {
      estado: "pronto";
      /** A entidade, se mudou. */
      entidade?: Entidade;
      /** Os locais que mudam (os novos incluídos). */
      locais: Map<string, Local>;
      resumo: ResumoLocal[];
      alertas: string[];
      avisos: ProblemaDados[];
    }
  | { estado: "sem_alteracoes" }
  | { estado: "CONFLITO"; motivo: string }
  | { estado: "ERRO"; motivo: string; problemas?: ProblemaDados[] };

/** Campos que uma `alteracao` pode mudar num local (§8.2). `confirmado_*` só por confirmação. */
export const CAMPOS_ALTERACAO: readonly string[] = [
  "horarios",
  "excecoes",
  "notas",
  "notas_i18n",
  "dias_santos",
  "foto",
];

/** Imagens de capa enviadas pelo painel (R2, `worker/src/fotos.ts`): `/fotos/<sha-256>.<ext>`. */
export const PADRAO_URL_FOTO = /^\/fotos\/[0-9a-f]{64}\.(webp|jpg)$/;
const MAX_TEXTO_FOTO = 300;

export const PADRAO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIPOS: readonly TipoGravacao[] = ["confirmacao", "alteracao", "novo-local", "restauro"];
const MAX_LOCAIS = 50;

// ── Leitura estrita do corpo ────────────────────────────────────────────────────────────────

function objeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const soChaves = (v: Record<string, unknown>, permitidas: readonly string[]) =>
  Object.keys(v).every((k) => permitidas.includes(k));
const versaoValida = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function lerResumo(v: unknown): ResumoLocal[] | null {
  if (!Array.isArray(v) || v.length > MAX_LOCAIS) return null;
  for (const r of v) {
    if (
      !objeto(r) ||
      !soChaves(r, ["local", "linhas"]) ||
      typeof r.local !== "string" ||
      !PADRAO_ID.test(r.local) ||
      !Array.isArray(r.linhas) ||
      !r.linhas.every((l) => typeof l === "string" && l.length <= 500)
    )
      return null;
  }
  return v as ResumoLocal[];
}

function lerVersoes(v: unknown): Record<string, number> | null {
  if (!objeto(v)) return null;
  const entradas = Object.entries(v);
  if (entradas.length > MAX_LOCAIS) return null;
  return entradas.every(([id, n]) => PADRAO_ID.test(id) && versaoValida(n))
    ? (v as Record<string, number>)
    : null;
}

/**
 * Lê o corpo de `POST /api/gravacoes`. Campos desconhecidos, ids fora do padrão e versões
 * inválidas são recusados. `confirmar_alertas` é tratado à parte, pelo Worker.
 */
export function lerPedidoGravacao(valor: unknown): PedidoGravacao | string {
  if (!objeto(valor)) return "corpo";
  const { tipo, entidade } = valor;
  if (!TIPOS.includes(tipo as TipoGravacao)) return "tipo";
  if (typeof entidade !== "string" || !PADRAO_ID.test(entidade)) return "entidade";
  const resumo = lerResumo(valor.resumo ?? []);
  if (!resumo) return "resumo";
  const comuns = ["tipo", "entidade", "resumo", "confirmar_alertas"];

  if (tipo === "confirmacao") {
    if (!soChaves(valor, [...comuns, "base"])) return "campos";
    const base = lerVersoes(valor.base ?? {});
    if (!base) return "base";
    return { tipo, entidade, base, resumo };
  }
  if (tipo === "alteracao") {
    if (!soChaves(valor, [...comuns, "locais"])) return "campos";
    if (!objeto(valor.locais)) return "locais";
    const locais = Object.entries(valor.locais);
    if (locais.length === 0 || locais.length > MAX_LOCAIS) return "locais";
    for (const [id, l] of locais) {
      if (!PADRAO_ID.test(id) || !objeto(l) || !soChaves(l, ["versao", "dados"])) return "locais";
      if (!versaoValida(l.versao) || !objeto(l.dados)) return "locais";
    }
    return {
      tipo,
      entidade,
      locais: valor.locais as Record<string, { versao: number; dados: Record<string, unknown> }>,
      resumo,
    };
  }
  if (tipo === "novo-local") {
    if (!soChaves(valor, [...comuns, "versaoEntidade", "local"])) return "campos";
    if (!versaoValida(valor.versaoEntidade)) return "versaoEntidade";
    if (!objeto(valor.local)) return "local";
    return { tipo, entidade, versaoEntidade: valor.versaoEntidade, local: valor.local, resumo };
  }
  // restauro
  if (!soChaves(valor, [...comuns, "restaura", "base"])) return "campos";
  if (!Number.isInteger(valor.restaura) || (valor.restaura as number) < 1) return "restaura";
  const b = valor.base;
  if (!objeto(b) || !soChaves(b, ["entidade", "locais"]) || !versaoValida(b.entidade))
    return "base";
  const locaisBase = lerVersoes(b.locais ?? {});
  if (!locaisBase) return "base";
  return {
    tipo: "restauro",
    entidade,
    restaura: valor.restaura as number,
    base: { entidade: b.entidade, locais: locaisBase },
    resumo,
  };
}

// ── Aplicação ───────────────────────────────────────────────────────────────────────────────

type Recusa = { estado: "ERRO"; motivo: string } | { estado: "CONFLITO"; motivo: string };
const erro = (motivo: string): Recusa => ({ estado: "ERRO", motivo });
const conflito = (motivo: string): Recusa => ({ estado: "CONFLITO", motivo });

/**
 * Imagem de capa que uma `alteracao` pode gravar: só uma enviada pelo painel (nunca um endereço
 * de fora) e textos curtos. `null`/ausente retira a imagem.
 */
function fotoDoPainel(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (!objeto(v) || !soChaves(v, ["url", "alt", "credito"])) return false;
  if (typeof v.url !== "string" || !PADRAO_URL_FOTO.test(v.url)) return false;
  return [v.alt, v.credito].every(
    (t) => t === undefined || (typeof t === "string" && t.length <= MAX_TEXTO_FOTO),
  );
}

function camposMudados(antes: object, depois: object): string[] {
  const a = antes as Record<string, unknown>;
  const d = depois as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(d)])].filter(
    (k) => !iguais(a[k] ?? null, d[k] ?? null),
  );
}

interface Novo {
  entidade: Entidade;
  locais: Map<string, Local>;
}

/** Estado final da entidade e dos locais tocados, depois das guardas e dos conflitos. */
function calcular(
  pedido: PedidoGravacao,
  estado: EstadoEntidade,
  opcoes: OpcoesGravacao,
): Novo | Recusa {
  const entidade = estado.entidade.dados;
  const daEntidade = new Set(entidade.locais);
  const atual = (id: string) => estado.locais.get(id);
  const locais = new Map<string, Local>();

  if (pedido.tipo === "confirmacao") {
    for (const [id, versao] of Object.entries(pedido.base)) {
      const r = atual(id);
      if (!r) return conflito(`o local ${id} deixou de existir`);
      if (r.versao !== versao) return conflito(`o local ${id} mudou desde que foi carregado`);
    }
    const hoje = momentoEmLisboa(opcoes.agora).data;
    for (const id of entidade.locais) {
      const r = atual(id);
      if (!r) return erro(`o local ${id} da entidade não existe`);
      locais.set(id, {
        ...r.dados,
        confirmado_em: hoje,
        confirmado_por: { canal: opcoes.contacto.canal, ref: opcoes.contacto.ref },
      });
    }
    return { entidade, locais };
  }

  if (pedido.tipo === "alteracao") {
    for (const [id, { versao, dados }] of Object.entries(pedido.locais)) {
      if (!daEntidade.has(id)) return erro(`âmbito: ${id} não é um local da entidade`);
      const r = atual(id);
      if (!r) return erro(`o local ${id} não existe`);
      if (r.versao !== versao) return conflito(`o local ${id} mudou desde que foi carregado`);
      const fora = camposMudados(r.dados, dados).filter((c) => !CAMPOS_ALTERACAO.includes(c));
      if (fora.length > 0) return erro(`alteração de campos não permitidos: ${fora.join(", ")}`);
      if (!iguais(r.dados.foto ?? null, dados.foto ?? null) && !fotoDoPainel(dados.foto))
        return erro("a imagem de capa tem de ser enviada pelo painel");
      locais.set(id, dados as unknown as Local);
    }
    return { entidade, locais };
  }

  if (pedido.tipo === "novo-local") {
    if (estado.entidade.versao !== pedido.versaoEntidade)
      return conflito("a entidade mudou desde que foi carregada");
    const local = pedido.local;
    const id = local.id;
    if (typeof id !== "string" || !PADRAO_ID.test(id)) return erro("o novo local precisa de um id");
    if (atual(id) || daEntidade.has(id)) return conflito(`já existe um local ${id}`);
    if (local.entidade !== pedido.entidade)
      return erro("o novo local tem de pertencer à entidade do pedido");
    if ((local.confirmado_em ?? null) !== null || (local.confirmado_por ?? null) !== null)
      return erro("um novo local começa sem confirmação");
    locais.set(id, local as unknown as Local);
    return { entidade: { ...entidade, locais: [...entidade.locais, id] }, locais };
  }

  // restauro: o estado de uma gravação anterior, lido do próprio D1 (opcoes.alvo).
  const alvo = opcoes.alvo;
  if (!alvo) return erro("restauro sem a versão a repor");
  if (alvo.entidade.id !== pedido.entidade) return erro("restauro: id da entidade");
  if (estado.entidade.versao !== pedido.base.entidade)
    return conflito("a entidade mudou desde que foi carregada");
  for (const id of entidade.locais) {
    const r = atual(id);
    if (r && r.versao !== pedido.base.locais[id])
      return conflito(`o local ${id} mudou desde que foi carregado`);
  }
  for (const id of alvo.entidade.locais) {
    const antigo = alvo.locais.get(id);
    if (!antigo) return erro(`restauro: o local ${id} não tem versão nessa gravação`);
    if (antigo.entidade !== pedido.entidade) return erro(`âmbito: ${id} não é da entidade`);
    const r = atual(id);
    if (r && r.dados.entidade !== pedido.entidade)
      return erro(`âmbito: ${id} pertence agora a outra entidade`);
    if (!r || !iguais(r.dados, antigo)) locais.set(id, antigo);
  }
  return { entidade: alvo.entidade, locais };
}

/** Aplica o pedido ao estado atual. Não escreve nada: devolve o que gravar. */
export function prepararGravacao(
  pedido: PedidoGravacao,
  estado: EstadoEntidade,
  opcoes: OpcoesGravacao,
): ResultadoGravacao {
  if (pedido.entidade !== estado.entidade.dados.id) return erro("entidade");
  const novo = calcular(pedido, estado, opcoes);
  if (!("entidade" in novo)) return novo;

  // Só o que muda de facto.
  const mudados = new Map(
    [...novo.locais].filter(([id, l]) => !iguais(estado.locais.get(id)?.dados ?? null, l)),
  );
  const entidadeMudou = !iguais(estado.entidade.dados, novo.entidade);
  if (mudados.size === 0 && !entidadeMudou) return { estado: "sem_alteracoes" };

  // Validação completa da entidade como fica (§8.3): esquema, integridade e regras do motor.
  const registos: ArquivoDados[] = [
    { caminho: `dados/entidades/${novo.entidade.id}.yml`, dados: novo.entidade },
  ];
  for (const id of novo.entidade.locais) {
    const dados = mudados.get(id) ?? estado.locais.get(id)?.dados;
    if (dados) registos.push({ caminho: `dados/locais/${id}.yml`, dados });
  }
  for (const [id, dados] of mudados)
    if (!novo.entidade.locais.includes(id))
      registos.push({ caminho: `dados/locais/${id}.yml`, dados });
  if (opcoes.calendario)
    registos.push({ caminho: "dados/calendario.yml", dados: opcoes.calendario });
  const problemas = validarDados(registos, {
    hoje: momentoEmLisboa(opcoes.agora).data,
    exigirCalendario: opcoes.calendario !== undefined,
    formatoCanonico: false,
  });
  const erros = problemas.filter((p) => p.nivel === "erro");
  if (erros.length > 0)
    return { estado: "ERRO", motivo: "os dados não passam a validação", problemas: erros };

  // Resumo recalculado: tem de coincidir com o que a pessoa viu antes de gravar.
  const pares: ParLocal[] = [...mudados].map(([id, depois]) => ({
    antes: estado.locais.get(id)?.dados ?? null,
    depois,
  }));
  const resumo = resumirPedido(pares);
  const recebido = [...pedido.resumo].sort((a, b) => a.local.localeCompare(b.local));
  if (!iguais(recebido, resumo)) return erro("o resumo não coincide com as alterações");

  return {
    estado: "pronto",
    ...(entidadeMudou && { entidade: novo.entidade }),
    locais: mudados,
    resumo,
    alertas: alertasDeAnomalia(pares),
    avisos: problemas.filter((p) => p.nivel === "aviso"),
  };
}
