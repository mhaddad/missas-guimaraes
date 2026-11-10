/**
 * Contactos do painel no Workers KV (§9.3, D25). REVISÃO DE SEGURANÇA OBRIGATÓRIA (âmbito).
 *
 *   contacto:<id>         o contacto (nome, e-mail, função, perfil, entidades, estado, consentimento)
 *   email:<email>         → <id>   (índice para o login)
 *   auditoria:<ts>:<id>   ações de administradores (2 anos)
 *
 * Os dados pessoais vivem só aqui, nunca no Git. Os commits e o histórico usam o id opaco.
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
const AUDITORIA_SEGUNDOS = 2 * 365 * 24 * 60 * 60;

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

export async function obterContacto(kv: KVNamespace, id: string): Promise<Contacto | null> {
  return kv.get<Contacto>(`contacto:${id}`, "json");
}

export async function obterPorEmail(kv: KVNamespace, email: string): Promise<Contacto | null> {
  const id = await kv.get(`email:${normalizarEmail(email)}`);
  if (!id) return null;
  const contacto = await obterContacto(kv, id);
  // O índice só vale se o contacto ainda tiver esse e-mail.
  return contacto && contacto.email === normalizarEmail(email) ? contacto : null;
}

export async function listarContactos(kv: KVNamespace): Promise<Contacto[]> {
  const contactos: Contacto[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await kv.list({ prefix: "contacto:", ...(cursor && { cursor }) });
    for (const chave of pagina.keys) {
      const c = await kv.get<Contacto>(chave.name, "json");
      if (c) contactos.push(c);
    }
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return contactos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
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
 * Grava o contacto e mantém o índice por e-mail. Recusa (devolve "email_em_uso") se o e-mail já
 * pertencer a outro contacto.
 */
export async function gravarContacto(
  kv: KVNamespace,
  contacto: Contacto,
  anterior: Contacto | null,
): Promise<"ok" | "email_em_uso"> {
  const dono = await kv.get(`email:${contacto.email}`);
  if (dono && dono !== contacto.id) {
    const outro = await obterContacto(kv, dono);
    if (outro && outro.email === contacto.email) return "email_em_uso";
  }
  await kv.put(`contacto:${contacto.id}`, JSON.stringify(contacto));
  await kv.put(`email:${contacto.email}`, contacto.id);
  if (anterior && anterior.email !== contacto.email) await kv.delete(`email:${anterior.email}`);
  return "ok";
}

export async function auditar(
  kv: KVNamespace,
  quem: string,
  acao: string,
  detalhe: Record<string, unknown>,
  agora = new Date(),
): Promise<void> {
  const id = crypto.randomUUID().slice(0, 8);
  await kv.put(
    `auditoria:${agora.toISOString()}:${id}`,
    JSON.stringify({ quem, acao, detalhe, em: agora.toISOString() }),
    {
      expirationTtl: AUDITORIA_SEGUNDOS,
    },
  );
}
