/**
 * Aplicação de uma regra de horário a uma data (§4.5, §5.2).
 */
import { epocaDe } from "./calendario.ts";
import { diaDaSemana, diferencaEmDias, partesDaData, semanasDoMes, type Data } from "./datas.ts";
import type { Dia, Regra } from "./modelo.gerado.ts";

/**
 * Uma regra aplica-se a `data` se todas as condições presentes forem verdadeiras: dia da
 * semana, época, semanas do mês, meses, paridade quinzenal e validade.
 *
 * `comoDia` permite avaliar a regra como se a data fosse outro "dia" (usado nos dias santos:
 * `dom` para `horario_domingo`, `santo` para `horario_proprio`); as outras condições usam
 * sempre a data real.
 *
 * Uma regra quinzenal sem referência nunca se aplica: o site mostra "quinzenal — confirme com
 * a paróquia" e não a inclui nas próximas celebrações (C12).
 */
export function regraAplica(regra: Regra, data: Data, comoDia?: Dia): boolean {
  const dia = comoDia ?? diaDaSemana(data);
  if (!regra.dias.includes(dia)) return false;
  if (regra.epoca !== undefined && regra.epoca !== epocaDe(data)) return false;
  if (regra.semanas_do_mes !== undefined) {
    const semanas = semanasDoMes(data);
    if (!regra.semanas_do_mes.some((s) => semanas.includes(s))) return false;
  }
  if (regra.meses !== undefined && !regra.meses.includes(partesDaData(data).mes)) return false;
  if (regra.quinzenal !== undefined) {
    const referencia = regra.quinzenal.referencia;
    if (referencia === null) return false;
    const diferenca = diferencaEmDias(data, referencia);
    if (((diferenca % 14) + 14) % 14 !== 0) return false;
  }
  if (regra.validade?.de !== undefined && data < regra.validade.de) return false;
  if (regra.validade?.ate !== undefined && data > regra.validade.ate) return false;
  return true;
}
