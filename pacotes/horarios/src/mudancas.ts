/**
 * Conversão das mudanças feitas no painel em regras e exceções (§7.4, P2, passo 3; C24–C26).
 * Corre no navegador (resumo antes de gravar) e de novo no GitHub Actions, com o mesmo código.
 */
import { minutosDaHora, somarDias, type Data } from "./datas.ts";
import type { Excecao, Local, Regra } from "./modelo.gerado.ts";
import { iguais } from "./util.ts";

/** A pergunta "A partir de quando?" que o painel faz sempre (D16). */
export type Natureza =
  | { tipo: "so_num_dia"; data: Data }
  /** Sem `de`: substitui a regra desde já, sem deixar rasto de validade. */
  | { tipo: "habitual"; de?: Data }
  | { tipo: "periodo"; de: Data; ate: Data };

export type Mudanca =
  | { acao: "adicionar"; regra: Regra; natureza: Natureza }
  | { acao: "editar"; indice: number; regra: Regra; natureza: Natureza }
  | { acao: "apagar"; indice: number; natureza: Natureza };

export class MudancaInvalida extends Error {
  override name = "MudancaInvalida";
}

function comValidade(regra: Regra, de: Data | undefined, ate: Data | undefined): Regra | null {
  const inicio = [regra.validade?.de, de]
    .filter((x): x is Data => x !== undefined)
    .sort()
    .at(-1);
  const fim = [regra.validade?.ate, ate]
    .filter((x): x is Data => x !== undefined)
    .sort()
    .at(0);
  if (inicio !== undefined && fim !== undefined && inicio > fim) return null;
  const { validade: _antiga, ...resto } = regra;
  if (inicio === undefined && fim === undefined) return resto;
  return {
    ...resto,
    validade: {
      ...(inicio !== undefined && { de: inicio }),
      ...(fim !== undefined && { ate: fim }),
    },
  };
}

/** A regra deixa de valer entre `de` e `ate` (inclusive): fica partida em duas, se preciso. */
function suspender(regra: Regra, de: Data, ate: Data): Regra[] {
  return [
    comValidade(regra, undefined, somarDias(de, -1)),
    comValidade(regra, somarDias(ate, 1), undefined),
  ].filter((r): r is Regra => r !== null);
}

/** A regra deixa de valer a partir de `de` (inclusive). */
function terminar(regra: Regra, de: Data): Regra[] {
  const r = comValidade(regra, undefined, somarDias(de, -1));
  return r ? [r] : [];
}

function validarPeriodo(natureza: Natureza): void {
  if (natureza.tipo === "periodo" && natureza.de > natureza.ate) {
    throw new MudancaInvalida("O início do período é depois do fim.");
  }
}

function excecaoAdicionar(regra: Regra, data: Data): Excecao {
  return {
    data,
    acao: "adicionar",
    tipo: regra.tipo,
    hora: regra.hora,
    ...(regra.hora_fim !== undefined && { hora_fim: regra.hora_fim }),
    ...(regra.idioma !== undefined && regra.idioma !== "pt" && { idioma: regra.idioma }),
    ...(regra.nota !== undefined && { nota: regra.nota }),
  };
}

function excecaoCancelar(regra: Regra, data: Data): Excecao {
  return { data, acao: "cancelar", tipo: regra.tipo, hora: regra.hora };
}

function duracao(regra: Regra): number | undefined {
  return regra.hora_fim === undefined
    ? undefined
    : minutosDaHora(regra.hora_fim) - minutosDaHora(regra.hora);
}

/**
 * Só a hora de início mudou (e a duração, se houver, é a mesma)? Então uma exceção `alterar`
 * basta: o motor desloca a hora de fim com a de início.
 */
function soMudouAHora(antes: Regra, depois: Regra): boolean {
  const { hora: _a, hora_fim: _af, ...restoAntes } = antes;
  const { hora: _d, hora_fim: _df, ...restoDepois } = depois;
  return (
    antes.hora !== depois.hora &&
    duracao(antes) === duracao(depois) &&
    iguais(restoAntes, restoDepois)
  );
}

/**
 * Aplica uma mudança do painel a um local e devolve o local novo (o original não é alterado).
 * - adicionar: só num dia → exceção `adicionar`; habitual → regra (com `validade.de`);
 *   período → regra com `validade` {de, ate}.
 * - editar: só num dia → exceção `alterar` (ou `cancelar` + `adicionar`); habitual a partir
 *   de D → a antiga termina em D−1 e a nova começa em D (C25); período → a antiga fica
 *   suspensa e a nova vale só nesse período.
 * - apagar: só num dia → exceção `cancelar` (C24); período → regra suspensa (C26);
 *   habitual a partir de D → `validade.ate` = D−1; sem data → a regra sai.
 */
export function aplicarMudanca(local: Local, mudanca: Mudanca): Local {
  const { natureza } = mudanca;
  validarPeriodo(natureza);
  const horarios = [...local.horarios];
  const excecoes = [...local.excecoes];

  const regraEm = (indice: number): Regra => {
    const regra = horarios[indice];
    if (!regra) throw new MudancaInvalida(`Não existe o horário n.º ${indice + 1}.`);
    return regra;
  };

  switch (mudanca.acao) {
    case "adicionar": {
      const { regra } = mudanca;
      if (natureza.tipo === "so_num_dia") {
        excecoes.push(excecaoAdicionar(regra, natureza.data));
      } else {
        const nova =
          natureza.tipo === "habitual"
            ? comValidade(regra, natureza.de, undefined)
            : comValidade(regra, natureza.de, natureza.ate);
        if (!nova) throw new MudancaInvalida("O horário novo não teria nenhum dia válido.");
        horarios.push(nova);
      }
      break;
    }
    case "editar": {
      const antiga = regraEm(mudanca.indice);
      const { regra } = mudanca;
      if (natureza.tipo === "so_num_dia") {
        if (soMudouAHora(antiga, regra)) {
          excecoes.push({
            data: natureza.data,
            acao: "alterar",
            tipo: antiga.tipo,
            hora_original: antiga.hora,
            hora: regra.hora,
          });
        } else {
          excecoes.push(
            excecaoCancelar(antiga, natureza.data),
            excecaoAdicionar(regra, natureza.data),
          );
        }
      } else if (natureza.tipo === "habitual") {
        if (natureza.de === undefined) {
          horarios.splice(mudanca.indice, 1, regra);
        } else {
          const nova = comValidade(regra, natureza.de, undefined);
          if (!nova) throw new MudancaInvalida("O horário novo não teria nenhum dia válido.");
          horarios.splice(mudanca.indice, 1, ...terminar(antiga, natureza.de), nova);
        }
      } else {
        const nova = comValidade(regra, natureza.de, natureza.ate);
        if (!nova) throw new MudancaInvalida("O horário novo não teria nenhum dia válido.");
        horarios.splice(mudanca.indice, 1, ...suspender(antiga, natureza.de, natureza.ate), nova);
      }
      break;
    }
    case "apagar": {
      const antiga = regraEm(mudanca.indice);
      if (natureza.tipo === "so_num_dia") {
        excecoes.push(excecaoCancelar(antiga, natureza.data));
      } else if (natureza.tipo === "periodo") {
        horarios.splice(mudanca.indice, 1, ...suspender(antiga, natureza.de, natureza.ate));
      } else if (natureza.de === undefined) {
        horarios.splice(mudanca.indice, 1);
      } else {
        horarios.splice(mudanca.indice, 1, ...terminar(antiga, natureza.de));
      }
      break;
    }
  }

  excecoes.sort(
    (a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""),
  );
  return { ...local, horarios, excecoes };
}
