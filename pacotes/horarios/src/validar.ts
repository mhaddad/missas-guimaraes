/**
 * Regras de negócio de um local (§8.3, item 4). O esquema e a integridade entre arquivos
 * são verificados em `@missas/dados`. Erros impedem a gravação; avisos não.
 */
import type { CalendarioMotor } from "./calendario.ts";
import { diaDaSemana, eDataValida, minutosDaHora, type Data } from "./datas.ts";
import type { Local } from "./modelo.gerado.ts";
import { ocorrencias } from "./ocorrencias.ts";
import { chaveCanonica } from "./util.ts";

export interface Problema {
  nivel: "erro" | "aviso";
  /** Onde, dentro do local: `horarios[2].hora`, `excecoes[0]`… */
  caminho: string;
  mensagem: string;
}

export interface ContextoValidacao {
  /** Hoje, em Lisboa; sem ele não se verifica `confirmado_em` no futuro. */
  hoje?: Data;
  calendario?: CalendarioMotor;
}

/** Fora deste intervalo, uma hora é provavelmente um engano (aviso). A meia-noite é aceite. */
const HORA_MINIMA = "06:00";
const HORA_MAXIMA = "22:30";
const NOTA_MAXIMA = 40;

function horaEstranha(hora: string): boolean {
  return hora !== "00:00" && (hora < HORA_MINIMA || hora > HORA_MAXIMA);
}

export function validar(local: Local, contexto: ContextoValidacao = {}): Problema[] {
  const problemas: Problema[] = [];
  const erro = (caminho: string, mensagem: string) =>
    problemas.push({ nivel: "erro", caminho, mensagem });
  const aviso = (caminho: string, mensagem: string) =>
    problemas.push({ nivel: "aviso", caminho, mensagem });

  const vistas = new Map<string, number>();
  local.horarios.forEach((regra, i) => {
    const onde = `horarios[${i}]`;
    const chave = chaveCanonica(regra);
    const anterior = vistas.get(chave);
    if (anterior !== undefined) erro(onde, `horário repetido (igual a horarios[${anterior}])`);
    else vistas.set(chave, i);

    if (
      regra.hora_fim !== undefined &&
      minutosDaHora(regra.hora_fim) <= minutosDaHora(regra.hora)
    ) {
      erro(`${onde}.hora_fim`, "a hora de fim tem de ser depois da hora de início");
    }
    if (horaEstranha(regra.hora)) aviso(`${onde}.hora`, `hora pouco habitual (${regra.hora})`);

    const referencia = regra.quinzenal?.referencia;
    if (referencia) {
      if (!eDataValida(referencia))
        erro(`${onde}.quinzenal.referencia`, `data inválida (${referencia})`);
      else if (!regra.dias.includes(diaDaSemana(referencia))) {
        erro(
          `${onde}.quinzenal.referencia`,
          "a data de referência não calha num dos dias da regra",
        );
      }
    }

    const { de, ate } = regra.validade ?? {};
    if (de !== undefined && !eDataValida(de)) erro(`${onde}.validade.de`, `data inválida (${de})`);
    if (ate !== undefined && !eDataValida(ate))
      erro(`${onde}.validade.ate`, `data inválida (${ate})`);
    if (de !== undefined && ate !== undefined && eDataValida(de) && eDataValida(ate) && de > ate) {
      erro(`${onde}.validade`, "o início da validade é depois do fim");
    }

    if (regra.dias.includes("santo") && local.dias_santos !== "horario_proprio") {
      aviso(
        `${onde}.dias`,
        "regra para dias santos, mas o local não tem `dias_santos: horario_proprio`",
      );
    }
    if (regra.nota !== undefined && regra.nota.length > NOTA_MAXIMA) {
      aviso(`${onde}.nota`, `nota com mais de ${NOTA_MAXIMA} caracteres; use as notas do local`);
    }
  });

  if (
    local.dias_santos === "horario_proprio" &&
    !local.horarios.some((r) => r.dias.includes("santo"))
  ) {
    aviso("dias_santos", "`horario_proprio` sem nenhuma regra com `dias: [santo]`");
  }
  if (local.publicar && local.horarios.length === 0)
    aviso("horarios", "local publicado sem horários");

  const excecoesVistas = new Map<string, number>();
  local.excecoes.forEach((excecao, i) => {
    const onde = `excecoes[${i}]`;
    const chave = chaveCanonica(excecao);
    const anterior = excecoesVistas.get(chave);
    if (anterior !== undefined) erro(onde, `exceção repetida (igual a excecoes[${anterior}])`);
    else excecoesVistas.set(chave, i);

    if (!eDataValida(excecao.data)) {
      erro(`${onde}.data`, `data inválida (${excecao.data})`);
      return;
    }
    if (excecao.acao === "adicionar" && excecao.hora === undefined) {
      erro(onde, "uma exceção `adicionar` precisa de `hora`");
    }
    if (excecao.acao === "alterar") {
      if (excecao.hora === undefined || excecao.hora_original === undefined) {
        erro(onde, "uma exceção `alterar` precisa de `hora_original` e `hora`");
      } else if (excecao.hora === excecao.hora_original) {
        erro(onde, "a hora nova é igual à original");
      }
    }
    if (excecao.acao !== "alterar" && excecao.hora_original !== undefined) {
      erro(`${onde}.hora_original`, "só as exceções `alterar` usam `hora_original`");
    }
    if (excecao.acao !== "cancelar" && excecao.hora !== undefined && horaEstranha(excecao.hora)) {
      aviso(`${onde}.hora`, `hora pouco habitual (${excecao.hora})`);
    }

    // Uma exceção que cancela ou altera uma celebração que não existe nesse dia não tem efeito.
    const alvo =
      excecao.acao === "alterar"
        ? excecao.hora_original
        : excecao.acao === "cancelar"
          ? excecao.hora
          : undefined;
    if (alvo !== undefined) {
      const semExcecoes: Local = { ...local, excecoes: [] };
      const doDia = ocorrencias(semExcecoes, excecao.data, excecao.data, {
        ...(contexto.calendario && { calendario: contexto.calendario }),
      });
      const existe = doDia.some(
        (o) => o.hora === alvo && (excecao.tipo === undefined || excecao.tipo === o.tipo),
      );
      if (!existe)
        aviso(onde, `não há nenhuma celebração às ${alvo} nesse dia; a exceção não tem efeito`);
    }
  });

  if (local.confirmado_em !== null) {
    if (!eDataValida(local.confirmado_em))
      erro("confirmado_em", `data inválida (${local.confirmado_em})`);
    else if (contexto.hoje !== undefined && local.confirmado_em > contexto.hoje) {
      erro("confirmado_em", "a data de confirmação está no futuro");
    }
  }

  return problemas;
}
