/** Conteúdo do detalhe de um local (§6.5), preparado no build. */
import {
  chaveCanonica,
  compararRegras,
  descreverRegra,
  epocaDe,
  type Epoca,
  type Excecao,
  type Local,
  type Regra,
} from "@missas/horarios";
import { formatar, TEXTOS, type Idioma } from "../i18n/index.ts";
import { formatarDataCurta } from "./formatos.ts";

export interface LinhaHorario {
  texto: string;
  nota?: string;
  notaEmPortugues?: boolean;
}

export interface BlocoHorario {
  /** Sem título quando o local não distingue verão e inverno. */
  titulo?: string;
  atual: boolean;
  linhas: LinhaHorario[];
}

function linha(regra: Regra, idioma: Idioma, horas: string[] = [regra.hora]): LinhaHorario {
  const { epoca: _e, ...semEpoca } = regra;
  const descricao = descreverRegra(semEpoca, idioma, { horas });
  const texto =
    regra.tipo === "missa"
      ? descricao
      : `${TEXTOS[idioma].tipos[regra.tipo]}: ${descricao.replace(/^./, (c) => c.toLowerCase())}`;
  const traduzida = idioma === "pt-PT" ? undefined : regra.nota_i18n?.[idioma];
  if (regra.nota === undefined) return { texto };
  return traduzida
    ? { texto, nota: traduzida }
    : { texto, nota: regra.nota, notaEmPortugues: idioma !== "pt-PT" };
}

/**
 * Junta as regras iguais em tudo menos na hora (sem hora de fim nem nota) numa só linha:
 * "Domingos às 12:00 e 19:00".
 */
function linhas(regras: Regra[], idioma: Idioma): LinhaHorario[] {
  const grupos: { regra: Regra; horas: string[] }[] = [];
  for (const regra of regras) {
    const { hora: _h, epoca: _e, ...resto } = regra;
    const juntavel = regra.hora_fim === undefined && regra.nota === undefined;
    const chave = chaveCanonica(resto);
    const grupo = juntavel
      ? grupos.find((g) => {
          const { hora: _gh, epoca: _ge, ...outro } = g.regra;
          return (
            g.regra.nota === undefined &&
            g.regra.hora_fim === undefined &&
            chaveCanonica(outro) === chave
          );
        })
      : undefined;
    if (grupo) grupo.horas.push(regra.hora);
    else grupos.push({ regra, horas: [regra.hora] });
  }
  return grupos.map((g) => linha(g.regra, idioma, g.horas));
}

/** Horário semanal: um bloco, ou dois (época atual primeiro) se houver regras por época. */
export function blocosHorario(
  local: Pick<Local, "horarios">,
  idioma: Idioma,
  hoje: string,
): BlocoHorario[] {
  const t = TEXTOS[idioma];
  const regras = [...local.horarios].sort(compararRegras);
  if (!regras.some((r) => r.epoca)) {
    return regras.length ? [{ atual: true, linhas: linhas(regras, idioma) }] : [];
  }
  const atual = epocaDe(hoje);
  const epocas: Epoca[] = atual === "verao" ? ["verao", "inverno"] : ["inverno", "verao"];
  return epocas.map((epoca) => ({
    titulo: epoca === "verao" ? t.epocaVerao : t.epocaInverno,
    atual: epoca === atual,
    linhas: linhas(
      regras.filter((r) => !r.epoca || r.epoca === epoca),
      idioma,
    ),
  }));
}

/** "15 nov.: missa das 11:00 passa para as 10:00" */
export function descreverExcecao(e: Excecao, idioma: Idioma): string {
  const t = TEXTOS[idioma];
  const data = formatarDataCurta(e.data, idioma);
  const tipo = t.tipos[e.tipo ?? "missa"].toLowerCase();
  switch (e.acao) {
    case "cancelar":
      return e.hora
        ? formatar(t.alteracaoCancelada, { data, tipo, hora: e.hora })
        : formatar(t.alteracaoCanceladaDia, { data });
    case "alterar":
      return formatar(t.alteracaoHora, {
        data,
        tipo,
        de: e.hora_original ?? "",
        para: e.hora ?? "",
      });
    case "adicionar":
      return (
        formatar(t.alteracaoNova, { data, tipo, hora: e.hora ?? "" }) +
        (e.nota ? ` (${e.nota})` : "")
      );
  }
}

export function notasDoLocal(
  local: Pick<Local, "notas" | "notas_i18n">,
  idioma: Idioma,
): { texto: string; emPortugues: boolean }[] {
  const traduzidas = idioma === "pt-PT" ? undefined : local.notas_i18n?.[idioma];
  if (traduzidas?.length) return traduzidas.map((texto) => ({ texto, emPortugues: false }));
  return (local.notas ?? []).map((texto) => ({ texto, emPortugues: idioma !== "pt-PT" }));
}
