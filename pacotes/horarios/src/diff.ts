/**
 * Diferenças entre duas versões de um local (§5.1): usadas no resumo dos modais do painel
 * (P2, passo 4), na mensagem do commit e nos e-mails. Os textos são em pt-PT.
 */
import { descreverData, descreverRegra } from "./descrever.ts";
import type { Excecao, Local, Regra } from "./modelo.gerado.ts";
import { chaveCanonica, iguais } from "./util.ts";

export type Alteracao =
  | { tipo: "regra_adicionada"; regra: Regra }
  | { tipo: "regra_removida"; regra: Regra }
  | { tipo: "regra_alterada"; antes: Regra; depois: Regra }
  | { tipo: "excecao_adicionada"; excecao: Excecao }
  | { tipo: "excecao_removida"; excecao: Excecao }
  | { tipo: "dias_santos"; antes: Local["dias_santos"]; depois: Local["dias_santos"] }
  | { tipo: "confirmacao"; antes: string | null; depois: string | null }
  | { tipo: "campo"; campo: string; antes: unknown; depois: unknown };

/** Remove de `b` os elementos iguais aos de `a` (multiconjunto) e devolve as sobras dos dois. */
function semComuns<T>(a: readonly T[], b: readonly T[]): { soA: T[]; soB: T[] } {
  const restantes = b.map((x) => ({ x, chave: chaveCanonica(x), usado: false }));
  const soA: T[] = [];
  for (const item of a) {
    const chave = chaveCanonica(item);
    const par = restantes.find((r) => !r.usado && r.chave === chave);
    if (par) par.usado = true;
    else soA.push(item);
  }
  return { soA, soB: restantes.filter((r) => !r.usado).map((r) => r.x) };
}

function mesmosDias(a: Regra, b: Regra): boolean {
  return a.tipo === b.tipo && iguais([...a.dias].sort(), [...b.dias].sort());
}

const CAMPOS_TRATADOS = new Set(["horarios", "excecoes", "dias_santos", "confirmado_em"]);

export function diff(antes: Local, depois: Local): Alteracao[] {
  const alteracoes: Alteracao[] = [];

  const regras = semComuns(antes.horarios, depois.horarios);
  const adicionadas = [...regras.soB];
  for (const removida of regras.soA) {
    const i = adicionadas.findIndex((r) => mesmosDias(removida, r));
    if (i >= 0) {
      const [par] = adicionadas.splice(i, 1);
      alteracoes.push({ tipo: "regra_alterada", antes: removida, depois: par as Regra });
    } else {
      alteracoes.push({ tipo: "regra_removida", regra: removida });
    }
  }
  for (const regra of adicionadas) alteracoes.push({ tipo: "regra_adicionada", regra });

  const excecoes = semComuns(antes.excecoes, depois.excecoes);
  for (const excecao of excecoes.soA) alteracoes.push({ tipo: "excecao_removida", excecao });
  for (const excecao of excecoes.soB) alteracoes.push({ tipo: "excecao_adicionada", excecao });

  if (antes.dias_santos !== depois.dias_santos) {
    alteracoes.push({ tipo: "dias_santos", antes: antes.dias_santos, depois: depois.dias_santos });
  }
  if (antes.confirmado_em !== depois.confirmado_em) {
    alteracoes.push({
      tipo: "confirmacao",
      antes: antes.confirmado_em,
      depois: depois.confirmado_em,
    });
  }

  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const campo of [...campos].sort()) {
    if (CAMPOS_TRATADOS.has(campo)) continue;
    const a = (antes as unknown as Record<string, unknown>)[campo];
    const d = (depois as unknown as Record<string, unknown>)[campo];
    if (!iguais(a ?? null, d ?? null))
      alteracoes.push({ tipo: "campo", campo, antes: a, depois: d });
  }
  return alteracoes;
}

const NOMES_TIPO: Record<string, string> = {
  missa: "missa",
  confissoes: "confissões",
  adoracao: "adoração",
  terco: "terço",
  outro: "celebração",
};

function descreverExcecao(e: Excecao): string {
  const data = descreverData(e.data, "pt-PT");
  const tipo = NOMES_TIPO[e.tipo ?? "missa"] ?? "celebração";
  const nota = e.nota ? ` (${e.nota})` : "";
  switch (e.acao) {
    case "cancelar":
      return e.hora
        ? `${data}: sem ${tipo} às ${e.hora}${nota}`
        : `${data}: sem ${e.tipo ? tipo : "celebrações"}${nota}`;
    case "alterar":
      return `${data}: ${tipo} das ${e.hora_original ?? "?"} passa para as ${e.hora ?? "?"}${nota}`;
    case "adicionar":
      return `${data}: ${tipo} às ${e.hora ?? "?"}${nota}`;
  }
}

const REGIMES: Record<string, string> = {
  horario_domingo: "horário de domingo",
  horario_proprio: "horário próprio",
  horario_habitual: "horário normal do dia",
  null: "sem informação",
};

/** Uma linha por alteração: "➖ Missa: domingos às 11:15" · "➕ Missa: domingos às 10:30 (a partir de 1 dez. 2026)". */
export function descreverAlteracao(a: Alteracao): string {
  const regra = (r: Regra) => descreverRegra(r, "pt-PT", { comTipo: true });
  switch (a.tipo) {
    case "regra_adicionada":
      return `➕ ${regra(a.regra)}`;
    case "regra_removida":
      return `➖ ${regra(a.regra)}`;
    case "regra_alterada":
      return `✏️ ${regra(a.antes)} → ${descreverRegra(a.depois, "pt-PT")}`;
    case "excecao_adicionada":
      return `📅 ${descreverExcecao(a.excecao)}`;
    case "excecao_removida":
      return `🗑️ Exceção retirada: ${descreverExcecao(a.excecao)}`;
    case "dias_santos":
      return `Dias santos: ${REGIMES[String(a.antes)] ?? ""} → ${REGIMES[String(a.depois)] ?? ""}`;
    case "confirmacao":
      return a.depois
        ? `✅ Horários confirmados em ${descreverData(a.depois, "pt-PT")}`
        : "Confirmação retirada";
    case "campo":
      return `Campo ${a.campo} alterado`;
  }
}

export function resumirAlteracoes(alteracoes: readonly Alteracao[]): string[] {
  return alteracoes.map(descreverAlteracao);
}
