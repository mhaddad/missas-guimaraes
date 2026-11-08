/**
 * Motor de horários (§5): interpreta as regras e exceções dos locais e produz celebrações
 * concretas, descrições e diferenças. O mesmo código corre no navegador, no Worker e na CI.
 * Todas as datas e horas são de Europe/Lisbon.
 */
export type {
  AnoCalendario,
  Calendario,
  Dia,
  Entidade,
  Excecao,
  Local,
  Regra,
  RegraDiaSanto,
  TipoCelebracao,
} from "./modelo.gerado.ts";
export {
  FUSO_HORARIO,
  DIAS_DA_SEMANA,
  diaDaSemana,
  eDataValida,
  eHoraValida,
  momentoEmLisboa,
  pascoa,
  semanasDoMes,
  somarDias,
  type Data,
  type DiaDaSemana,
  type HoraTexto,
} from "./datas.ts";
export {
  epocaDe,
  prepararCalendario,
  verificarCalendario,
  SEM_DIAS_SANTOS,
  type CalendarioMotor,
  type DiaSanto,
  type Epoca,
} from "./calendario.ts";
export { regraAplica } from "./regras.ts";
export {
  compararOcorrencias,
  expandir,
  ocorrencias,
  proximas,
  type Aviso,
  type Expansao,
  type Ocorrencia,
  type OpcoesExpansao,
  type OpcoesProximas,
} from "./ocorrencias.ts";
export {
  compararRegras,
  descreverData,
  descreverHorarios,
  descreverRegra,
  etiquetas,
  type Idioma,
} from "./descrever.ts";
export { diff, descreverAlteracao, resumirAlteracoes, type Alteracao } from "./diff.ts";
export { aplicarMudanca, MudancaInvalida, type Mudanca, type Natureza } from "./mudancas.ts";
export { validar, type ContextoValidacao, type Problema } from "./validar.ts";
export { chaveCanonica, iguais, ORDEM_TIPOS } from "./util.ts";
