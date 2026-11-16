/**
 * Contactos do painel no D1 (§9.3, D25, ADR-005). REVISÃO DE SEGURANÇA OBRIGATÓRIA (âmbito).
 *
 *   contactos            nome, e-mail (único), função, perfil, estado, consentimento
 *   contacto_entidades   as entidades de cada contacto
 *   auditoria            ações de administradores sobre contactos
 *
 * Os dados pessoais vivem só aqui, nunca no Git. O histórico das gravações usa o id opaco.
 */

export type Perfil = "admin" | "entidade";
export type EstadoContacto = "ativo" | "suspenso" | "sem_lembretes" | "removido";
export type Funcao = "paroco" | "secretaria" | "colaborador" | "equipa";

export interface Consentimento {
  /** Data em que a pessoa assinou o formulário (AAAA-MM-DD). */
  em: string;
  /** Versão do formulário de adesão (§11.4). */
  versao: string;
  meio: "papel" | "proprio";
}

export interface Contacto {
  id: string;
  nome: string;
  email: string;
  funcao: Funcao;
  perfil: Perfil;
  /** Para `entidade`: as que pode ver e editar. Para `admin`: só aquelas de que é contacto. */
  entidades: string[];
  estado: EstadoContacto;
  consentimento: Consentimento;
  criado_em: string;
  atualizado_em: string;
}

const PERFIS: readonly Perfil[] = ["admin", "entidade"];
const ESTADOS: readonly EstadoContacto[] = ["ativo", "suspenso", "sem_lembretes", "removido"];
const FUNCOES: readonly Funcao[] = ["paroco", "secretaria", "colaborador", "equipa"];
const PADRAO_ID_ENTIDADE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pode entrar no painel: ativo ou sem lembretes (§7.4, P9). */
export function podeEntrar(c: Contacto): boolean {
  return c.estado === "ativo" || c.estado === "sem_lembretes";
}

/** Âmbito (D25): `admin` → todas as entidades; `entidade` → só as associadas. */
export function podeVer(c: Contacto, entidade: string): boolean {
  if (!podeEntrar(c)) return false;
  return c.perfil === "admin" || c.entidades.includes(entidade);
}

interface LinhaContacto {
  id: string;
  nome: string;
  email: string;
  funcao: Funcao;
  perfil: Perfil;
  estado: EstadoContacto;
  consentimento: string;
  criado_em: string;
  atualizado_em: string;
  entidades: string | null;
}

const SELECAO = `SELECT c.*, (SELECT group_concat(entidade_id, ',') FROM contacto_entidades e
  WHERE e.contacto_id = c.id) AS entidades FROM contactos c`;

function deLinha(l: LinhaContacto): Contacto {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    funcao: l.funcao,
    perfil: l.perfil,
    entidades: l.entidades ? l.entidades.split(",").sort() : [],
    estado: l.estado,
    consentimento: JSON.parse(l.consentimento) as Consentimento,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  };
}

export async function obterContacto(bd: D1Database, id: string): Promise<Contacto | null> {
  const l = await bd.prepare(`${SELECAO} WHERE c.id = ?`).bind(id).first<LinhaContacto>();
  return l ? deLinha(l) : null;
}

export async function obterPorEmail(bd: D1Database, email: string): Promise<Contacto | null> {
  const l = await bd
    .prepare(`${SELECAO} WHERE c.email = ?`)
    .bind(normalizarEmail(email))
    .first<LinhaContacto>();
  return l ? deLinha(l) : null;
}

export async function listarContactos(bd: D1Database): Promise<Contacto[]> {
  const { results } = await bd.prepare(SELECAO).all<LinhaContacto>();
  return results.map(deLinha).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

/** Dados que um administrador pode escrever num contacto. */
export interface DadosContacto {
  nome: string;
  email: string;
  funcao: Funcao;
  perfil: Perfil;
  entidades: string[];
  estado: EstadoContacto;
  consentimento: Consentimento;
}

/**
 * Valida os dados vindos do ecrã *Acessos*. `entidadesExistentes` são os ids publicados; um
 * contacto `entidade` precisa de pelo menos uma. Sem consentimento registado, não há contacto
 * (§7.2, passo 6).
 */
export function validarDadosContacto(
  dados: unknown,
  entidadesExistentes: ReadonlySet<string>,
  hoje: string,
): DadosContacto | string {
  if (!dados || typeof dados !== "object") return "corpo";
  const d = dados as Record<string, unknown>;
  const nome = typeof d.nome === "string" ? d.nome.trim().replace(/\s+/g, " ") : "";
  if (nome.length < 2 || nome.length > 100) return "nome";
  const email = typeof d.email === "string" ? normalizarEmail(d.email) : "";
  if (!PADRAO_EMAIL.test(email) || email.length > 200) return "email";
  if (!FUNCOES.includes(d.funcao as Funcao)) return "funcao";
  if (!PERFIS.includes(d.perfil as Perfil)) return "perfil";
  if (!ESTADOS.includes(d.estado as EstadoContacto)) return "estado";
  if (!Array.isArray(d.entidades) || d.entidades.length > 100) return "entidades";
  const entidades = [...new Set(d.entidades)];
  if (
    !entidades.every(
      (e) => typeof e === "string" && PADRAO_ID_ENTIDADE.test(e) && entidadesExistentes.has(e),
    )
  ) {
    return "entidades";
  }
  if (d.perfil === "entidade" && entidades.length === 0) return "entidades";
  const c = d.consentimento as Record<string, unknown> | undefined;
  if (
    !c ||
    typeof c.em !== "string" ||
    !PADRAO_DATA.test(c.em) ||
    c.em > hoje ||
    typeof c.versao !== "string" ||
    c.versao.trim().length === 0 ||
    c.versao.length > 40 ||
    (c.meio !== "papel" && c.meio !== "proprio")
  ) {
    return "consentimento";
  }
  return {
    nome,
    email,
    funcao: d.funcao as Funcao,
    perfil: d.perfil as Perfil,
    entidades: entidades as string[],
    estado: d.estado as EstadoContacto,
    consentimento: { em: c.em, versao: c.versao.trim(), meio: c.meio },
  };
}

export function novoId(): string {
  return `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/**
 * Grava o contacto e as suas entidades numa transação. Recusa ("email_em_uso") se o e-mail já
 * pertencer a outro contacto. Suspender ou remover termina as sessões abertas.
 */
export async function gravarContacto(
  bd: D1Database,
  contacto: Contacto,
  anterior: Contacto | null,
): Promise<"ok" | "email_em_uso"> {
  const dono = await bd
    .prepare("SELECT id FROM contactos WHERE email = ?")
    .bind(contacto.email)
    .first<string>("id");
  if (dono && dono !== contacto.id) return "email_em_uso";
  const valores = [
    contacto.nome,
    contacto.email,
    contacto.funcao,
    contacto.perfil,
    contacto.estado,
    JSON.stringify(contacto.consentimento),
    contacto.atualizado_em,
  ];
  await bd.batch([
    anterior
      ? bd
          .prepare(
            "UPDATE contactos SET nome = ?, email = ?, funcao = ?, perfil = ?, estado = ?, consentimento = ?, atualizado_em = ? WHERE id = ?",
          )
          .bind(...valores, contacto.id)
      : bd
          .prepare(
            "INSERT INTO contactos (nome, email, funcao, perfil, estado, consentimento, atualizado_em, id, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(...valores, contacto.id, contacto.criado_em),
    bd.prepare("DELETE FROM contacto_entidades WHERE contacto_id = ?").bind(contacto.id),
    ...contacto.entidades.map((e) =>
      bd
        .prepare("INSERT INTO contacto_entidades (contacto_id, entidade_id) VALUES (?, ?)")
        .bind(contacto.id, e),
    ),
    ...(podeEntrar(contacto)
      ? []
      : [bd.prepare("DELETE FROM sessoes WHERE contacto_id = ?").bind(contacto.id)]),
  ]);
  return "ok";
}

export async function auditar(
  bd: D1Database,
  quem: string,
  acao: string,
  detalhe: Record<string, unknown>,
  agora = new Date(),
): Promise<void> {
  await bd
    .prepare("INSERT INTO auditoria (contacto_id, acao, detalhe, criado_em) VALUES (?, ?, ?, ?)")
    .bind(quem, acao, JSON.stringify(detalhe), agora.toISOString())
    .run();
}
