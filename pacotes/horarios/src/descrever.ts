/**
 * Descrições das regras em texto (§5.1) e etiquetas automáticas (§7.3-A), em pt-PT, en e es.
 * As tabelas de nomes são do próprio motor (não do `Intl`), para o texto ser igual no
 * navegador, no Worker e na CI.
 */
import type { Epoca } from "./calendario.ts";
import { DIAS_DA_SEMANA, partesDaData, type Data } from "./datas.ts";
import type { Dia, Local, Regra, TipoCelebracao } from "./modelo.gerado.ts";
import { ORDEM_TIPOS } from "./util.ts";

export type Idioma = "pt-PT" | "en" | "es";

type Semana = 1 | 2 | 3 | 4 | 5 | -1;

interface Textos {
  /** Plural "cheio", para um só dia: "Domingos", "Sextas-feiras". */
  diasPlural: Record<Dia, string>;
  /** Plural curto, para listas: "terças, quartas e quintas". */
  diasLista: Record<Dia, string>;
  /** Singular, para "1.ª sexta-feira do mês". */
  diaSingular: Record<Dia, string>;
  /** Plural com ordinais: "2.º e 4.º sábados do mês". */
  diaOrdinalPlural: Record<Dia, string>;
  feminino: ReadonlySet<Dia>;
  ordinal(semana: Semana, feminino: boolean): string;
  doMes: string;
  semanasDoMes(ordinais: string, plural: boolean): string;
  e: string;
  diasUteis: string;
  segundaASabado: string;
  todosOsDias: string;
  as(hora: string): string;
  dasAs(hora: string, fim: string): string;
  soEpoca: Record<Epoca, string>;
  soMeses(meses: string): string;
  meses: readonly string[];
  mesesAbreviados: readonly string[];
  quinzenal: string;
  quinzenalSemReferencia: string;
  ate(data: string): string;
  aPartirDe(data: string): string;
  deAte(de: string, ate: string): string;
  emIdioma(nome: string): string;
  tipos: Record<TipoCelebracao, string>;
  tiposPlural: Record<TipoCelebracao, string>;
  semanal: string;
  mensal: string;
  vespertina: string;
  semHorarios: string;
  diasSantos: Record<NonNullable<Local["dias_santos"]> | "null", string>;
}

const PT: Textos = {
  diasPlural: {
    seg: "segundas-feiras",
    ter: "terças-feiras",
    qua: "quartas-feiras",
    qui: "quintas-feiras",
    sex: "sextas-feiras",
    sab: "sábados",
    dom: "domingos",
    santo: "dias santos",
  },
  diasLista: {
    seg: "segundas",
    ter: "terças",
    qua: "quartas",
    qui: "quintas",
    sex: "sextas",
    sab: "sábados",
    dom: "domingos",
    santo: "dias santos",
  },
  diaSingular: {
    seg: "segunda-feira",
    ter: "terça-feira",
    qua: "quarta-feira",
    qui: "quinta-feira",
    sex: "sexta-feira",
    sab: "sábado",
    dom: "domingo",
    santo: "dia santo",
  },
  diaOrdinalPlural: {
    seg: "segundas-feiras",
    ter: "terças-feiras",
    qua: "quartas-feiras",
    qui: "quintas-feiras",
    sex: "sextas-feiras",
    sab: "sábados",
    dom: "domingos",
    santo: "dias santos",
  },
  feminino: new Set<Dia>(["seg", "ter", "qua", "qui", "sex"]),
  ordinal: (s, f) => (s === -1 ? (f ? "última" : "último") : `${s}.${f ? "ª" : "º"}`),
  doMes: "do mês",
  semanasDoMes: (o, p) => `${o} ${p ? "semanas" : "semana"} do mês`,
  e: "e",
  diasUteis: "dias úteis",
  segundaASabado: "de segunda a sábado",
  todosOsDias: "todos os dias",
  as: (h) => (h === "00:00" ? "à meia-noite" : `às ${h}`),
  dasAs: (h, f) => `das ${h} às ${f}`,
  soEpoca: { verao: "só no verão", inverno: "só no inverno" },
  soMeses: (m) => `só em ${m}`,
  meses: [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ],
  mesesAbreviados: [
    "jan.",
    "fev.",
    "mar.",
    "abr.",
    "mai.",
    "jun.",
    "jul.",
    "ago.",
    "set.",
    "out.",
    "nov.",
    "dez.",
  ],
  quinzenal: "quinzenal",
  quinzenalSemReferencia: "quinzenal — confirme com a paróquia",
  ate: (d) => `até ${d}`,
  aPartirDe: (d) => `a partir de ${d}`,
  deAte: (de, ate) => `de ${de} a ${ate}`,
  emIdioma: (n) => `em ${n}`,
  tipos: {
    missa: "Missa",
    confissoes: "Confissões",
    adoracao: "Adoração",
    terco: "Terço",
    outro: "Outra celebração",
  },
  tiposPlural: {
    missa: "Missas",
    confissoes: "Confissões",
    adoracao: "Adoração",
    terco: "Terço",
    outro: "Outras celebrações",
  },
  semanal: "Semanal",
  mensal: "Mensal",
  vespertina: "Vespertina",
  semHorarios: "Sem horários registados.",
  diasSantos: {
    horario_domingo: "Dias santos: horário de domingo",
    horario_proprio: "Dias santos: horário próprio",
    horario_habitual: "Dias santos: horário normal do dia",
    null: "Dias santos: sem informação",
  },
};

const EN: Textos = {
  diasPlural: {
    seg: "Mondays",
    ter: "Tuesdays",
    qua: "Wednesdays",
    qui: "Thursdays",
    sex: "Fridays",
    sab: "Saturdays",
    dom: "Sundays",
    santo: "holy days of obligation",
  },
  diasLista: {
    seg: "Mondays",
    ter: "Tuesdays",
    qua: "Wednesdays",
    qui: "Thursdays",
    sex: "Fridays",
    sab: "Saturdays",
    dom: "Sundays",
    santo: "holy days of obligation",
  },
  diaSingular: {
    seg: "Monday",
    ter: "Tuesday",
    qua: "Wednesday",
    qui: "Thursday",
    sex: "Friday",
    sab: "Saturday",
    dom: "Sunday",
    santo: "holy day of obligation",
  },
  diaOrdinalPlural: {
    seg: "Mondays",
    ter: "Tuesdays",
    qua: "Wednesdays",
    qui: "Thursdays",
    sex: "Fridays",
    sab: "Saturdays",
    dom: "Sundays",
    santo: "holy days of obligation",
  },
  feminino: new Set(),
  ordinal: (s) => (s === -1 ? "last" : `${s}${["st", "nd", "rd"][s - 1] ?? "th"}`),
  doMes: "of the month",
  semanasDoMes: (o, p) => `${o} ${p ? "weeks" : "week"} of the month`,
  e: "and",
  diasUteis: "weekdays",
  segundaASabado: "Monday to Saturday",
  todosOsDias: "every day",
  as: (h) => (h === "00:00" ? "at midnight" : `at ${h}`),
  dasAs: (h, f) => `from ${h} to ${f}`,
  soEpoca: { verao: "summer time only", inverno: "winter time only" },
  soMeses: (m) => `${m} only`,
  meses: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  mesesAbreviados: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  quinzenal: "every other week",
  quinzenalSemReferencia: "every other week — check with the parish",
  ate: (d) => `until ${d}`,
  aPartirDe: (d) => `from ${d}`,
  deAte: (de, ate) => `from ${de} to ${ate}`,
  emIdioma: (n) => `in ${n}`,
  tipos: {
    missa: "Mass",
    confissoes: "Confession",
    adoracao: "Adoration",
    terco: "Rosary",
    outro: "Other celebration",
  },
  tiposPlural: {
    missa: "Masses",
    confissoes: "Confession",
    adoracao: "Adoration",
    terco: "Rosary",
    outro: "Other celebrations",
  },
  semanal: "Weekly",
  mensal: "Monthly",
  vespertina: "Vigil Mass",
  semHorarios: "No times registered.",
  diasSantos: {
    horario_domingo: "Holy days of obligation: Sunday times",
    horario_proprio: "Holy days of obligation: own times",
    horario_habitual: "Holy days of obligation: usual times for that day",
    null: "Holy days of obligation: no information",
  },
};

const ES: Textos = {
  diasPlural: {
    seg: "lunes",
    ter: "martes",
    qua: "miércoles",
    qui: "jueves",
    sex: "viernes",
    sab: "sábados",
    dom: "domingos",
    santo: "días de precepto",
  },
  diasLista: {
    seg: "lunes",
    ter: "martes",
    qua: "miércoles",
    qui: "jueves",
    sex: "viernes",
    sab: "sábados",
    dom: "domingos",
    santo: "días de precepto",
  },
  diaSingular: {
    seg: "lunes",
    ter: "martes",
    qua: "miércoles",
    qui: "jueves",
    sex: "viernes",
    sab: "sábado",
    dom: "domingo",
    santo: "día de precepto",
  },
  diaOrdinalPlural: {
    seg: "lunes",
    ter: "martes",
    qua: "miércoles",
    qui: "jueves",
    sex: "viernes",
    sab: "sábado",
    dom: "domingo",
    santo: "día de precepto",
  },
  feminino: new Set(),
  ordinal: (s) => (s === -1 ? "último" : s === 1 || s === 3 ? `${s}.er` : `${s}.º`),
  doMes: "del mes",
  semanasDoMes: (o, p) => `${o} ${p ? "semanas" : "semana"} del mes`,
  e: "y",
  diasUteis: "días laborables",
  segundaASabado: "de lunes a sábado",
  todosOsDias: "todos los días",
  as: (h) => (h === "00:00" ? "a medianoche" : `a las ${h}`),
  dasAs: (h, f) => `de ${h} a ${f}`,
  soEpoca: { verao: "solo en horario de verano", inverno: "solo en horario de invierno" },
  soMeses: (m) => `solo en ${m}`,
  meses: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  mesesAbreviados: [
    "ene.",
    "feb.",
    "mar.",
    "abr.",
    "may.",
    "jun.",
    "jul.",
    "ago.",
    "sept.",
    "oct.",
    "nov.",
    "dic.",
  ],
  quinzenal: "cada dos semanas",
  quinzenalSemReferencia: "cada dos semanas — confirme con la parroquia",
  ate: (d) => `hasta el ${d}`,
  aPartirDe: (d) => `desde el ${d}`,
  deAte: (de, ate) => `del ${de} al ${ate}`,
  emIdioma: (n) => `en ${n}`,
  tipos: {
    missa: "Misa",
    confissoes: "Confesiones",
    adoracao: "Adoración",
    terco: "Rosario",
    outro: "Otra celebración",
  },
  tiposPlural: {
    missa: "Misas",
    confissoes: "Confesiones",
    adoracao: "Adoración",
    terco: "Rosario",
    outro: "Otras celebraciones",
  },
  semanal: "Semanal",
  mensal: "Mensual",
  vespertina: "Vespertina",
  semHorarios: "Sin horarios registrados.",
  diasSantos: {
    horario_domingo: "Días de precepto: horario de domingo",
    horario_proprio: "Días de precepto: horario propio",
    horario_habitual: "Días de precepto: horario habitual del día",
    null: "Días de precepto: sin información",
  },
};

const TEXTOS: Record<Idioma, Textos> = { "pt-PT": PT, en: EN, es: ES };

const ORDEM_DIAS: readonly Dia[] = [...DIAS_DA_SEMANA, "santo"];
const DIAS_UTEIS: readonly Dia[] = ["seg", "ter", "qua", "qui", "sex"];
const SEG_A_SAB: readonly Dia[] = [...DIAS_UTEIS, "sab"];

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function juntar(itens: readonly string[], e: string): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} ${e} ${itens.at(-1) ?? ""}`;
}

function mesmoConjunto(a: readonly Dia[], b: readonly Dia[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function ordenarSemanas(semanas: readonly Semana[]): Semana[] {
  return [...semanas].sort((a, b) => (a === -1 ? 6 : a) - (b === -1 ? 6 : b));
}

function ordenarDias(dias: readonly Dia[]): Dia[] {
  return [...dias].sort((a, b) => ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b));
}

/** "1 dez. 2026" / "1 Dec 2026" / "1 dic. 2026". */
export function descreverData(data: Data, idioma: Idioma): string {
  const { ano, mes, dia } = partesDaData(data);
  return `${dia} ${TEXTOS[idioma].mesesAbreviados[mes - 1] ?? ""} ${ano}`;
}

function descreverDias(regra: Regra, t: Textos): string {
  const dias = ordenarDias(regra.dias);
  const semanas = regra.semanas_do_mes ? ordenarSemanas(regra.semanas_do_mes) : undefined;

  if (semanas && dias.length === 1) {
    const dia = dias[0] as Dia;
    const feminino = t.feminino.has(dia);
    const ordinais = juntar(
      semanas.map((s) => t.ordinal(s, feminino)),
      t.e,
    );
    const nome = semanas.length === 1 ? t.diaSingular[dia] : t.diaOrdinalPlural[dia];
    return `${ordinais} ${nome} ${t.doMes}`;
  }

  const semSanto = dias.filter((d) => d !== "santo");
  const comSanto = dias.includes("santo");
  let texto: string;
  if (mesmoConjunto(semSanto, DIAS_DA_SEMANA)) texto = t.todosOsDias;
  else if (mesmoConjunto(semSanto, SEG_A_SAB)) texto = t.segundaASabado;
  else if (mesmoConjunto(semSanto, DIAS_UTEIS)) texto = t.diasUteis;
  else if (semSanto.length === 1) texto = t.diasPlural[semSanto[0] as Dia];
  else
    texto = juntar(
      semSanto.map((d) => t.diasLista[d]),
      t.e,
    );
  if (comSanto)
    texto = semSanto.length === 0 ? t.diasPlural.santo : `${texto} ${t.e} ${t.diasPlural.santo}`;

  return texto;
}

/** Semanas do mês de uma regra com vários dias: "1.ª e 3.ª semanas do mês". */
function textoSemanas(regra: Regra, t: Textos): string | undefined {
  if (!regra.semanas_do_mes || regra.dias.length === 1) return undefined;
  const ordinais = juntar(
    ordenarSemanas(regra.semanas_do_mes).map((s) => t.ordinal(s, true)),
    t.e,
  );
  return t.semanasDoMes(ordinais, regra.semanas_do_mes.length > 1);
}

function nomeDoIdioma(codigo: string, idioma: Idioma): string {
  try {
    return new Intl.DisplayNames([idioma], { type: "language" }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

function textoMeses(meses: readonly number[], t: Textos): string {
  const nomes = [...meses].sort((a, b) => a - b).map((m) => t.meses[m - 1] ?? String(m));
  return t.soMeses(juntar(nomes, t.e));
}

function qualificadores(regra: Regra, idioma: Idioma): string[] {
  const t = TEXTOS[idioma];
  const lista: string[] = [];
  const semanas = textoSemanas(regra, t);
  if (semanas) lista.push(semanas);
  if (regra.epoca) lista.push(t.soEpoca[regra.epoca]);
  if (regra.meses) lista.push(textoMeses(regra.meses, t));
  if (regra.quinzenal) {
    lista.push(regra.quinzenal.referencia === null ? t.quinzenalSemReferencia : t.quinzenal);
  }
  const validade = descreverValidade(regra, idioma);
  if (validade) lista.push(validade);
  if (regra.idioma && regra.idioma !== "pt")
    lista.push(t.emIdioma(nomeDoIdioma(regra.idioma, idioma)));
  return lista;
}

function descreverValidade(regra: Regra, idioma: Idioma): string | undefined {
  const t = TEXTOS[idioma];
  const { de, ate } = regra.validade ?? {};
  if (de && ate) return t.deAte(descreverData(de, idioma), descreverData(ate, idioma));
  if (de) return t.aPartirDe(descreverData(de, idioma));
  if (ate) return t.ate(descreverData(ate, idioma));
  return undefined;
}

export interface OpcoesDescricao {
  /** Começa pelo tipo de celebração: "Missa: domingos às 11:00". */
  comTipo?: boolean;
}

/**
 * "Domingos às 11:00" · "2.º e 4.º sábados do mês às 17:00" ·
 * "Dias úteis às 21:00 (só em maio)" · "Sábados às 16:30 (quinzenal — confirme com a paróquia)".
 */
export function descreverRegra(regra: Regra, idioma: Idioma, opcoes: OpcoesDescricao = {}): string {
  const t = TEXTOS[idioma];
  const hora = regra.hora_fim ? t.dasAs(regra.hora, regra.hora_fim) : t.as(regra.hora);
  const extra = qualificadores(regra, idioma);
  const corpo = `${descreverDias(regra, t)} ${hora}${extra.length ? ` (${extra.join(", ")})` : ""}`;
  return opcoes.comTipo ? `${t.tipos[regra.tipo]}: ${corpo}` : maiuscula(corpo);
}

/**
 * Etiquetas automáticas (§7.3-A): frequência, vespertina, época, meses, validade e idioma.
 * A nota da regra é mostrada à parte.
 */
export function etiquetas(regra: Regra, idioma: Idioma): string[] {
  const t = TEXTOS[idioma];
  const lista: string[] = [];
  if (regra.quinzenal) lista.push(maiuscula(t.quinzenal));
  else if (regra.semanas_do_mes?.length === 1) lista.push(t.mensal);
  else if (regra.semanas_do_mes) {
    const dias = ordenarDias(regra.dias);
    if (dias.length === 1) {
      const dia = dias[0] as Dia;
      const ordinais = juntar(
        ordenarSemanas(regra.semanas_do_mes).map((s) => t.ordinal(s, t.feminino.has(dia))),
        t.e,
      );
      lista.push(maiuscula(`${ordinais} ${t.diaSingular[dia]}`));
    } else {
      // Igual à descrição: "1.ª e 3.ª semanas do mês".
      lista.push(maiuscula(textoSemanas(regra, t) ?? ""));
    }
  } else lista.push(t.semanal);
  if (
    regra.tipo === "missa" &&
    regra.dias.length === 1 &&
    regra.dias[0] === "sab" &&
    regra.hora >= "16:00"
  ) {
    lista.push(t.vespertina);
  }
  if (regra.epoca) lista.push(maiuscula(t.soEpoca[regra.epoca]));
  if (regra.meses) lista.push(maiuscula(textoMeses(regra.meses, t)));
  const validade = descreverValidade(regra, idioma);
  if (validade) lista.push(maiuscula(validade));
  if (regra.idioma && regra.idioma !== "pt")
    lista.push(maiuscula(t.emIdioma(nomeDoIdioma(regra.idioma, idioma))));
  return lista;
}

/** Ordem de apresentação das regras: tipo, primeiro dia, hora. */
export function compararRegras(a: Regra, b: Regra): number {
  const primeiro = (r: Regra) => Math.min(...r.dias.map((d) => ORDEM_DIAS.indexOf(d)));
  return (
    ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) ||
    primeiro(a) - primeiro(b) ||
    a.hora.localeCompare(b.hora)
  );
}

export interface OpcoesHorarios {
  /** Só as regras desta época (e as de todo o ano). */
  epoca?: Epoca;
}

/** Texto simples com todos os horários de um local, para o painel e os e-mails (Anexo A). */
export function descreverHorarios(
  local: Local,
  idioma: Idioma,
  opcoes: OpcoesHorarios = {},
): string {
  const t = TEXTOS[idioma];
  const regras = local.horarios
    .filter((r) => !opcoes.epoca || !r.epoca || r.epoca === opcoes.epoca)
    .sort(compararRegras);
  const blocos: string[] = [];
  for (const tipo of ORDEM_TIPOS) {
    const doTipo = regras.filter((r) => r.tipo === tipo);
    if (doTipo.length === 0) continue;
    const linhas = doTipo.map((r) => {
      const nota = idioma === "pt-PT" ? r.nota : (r.nota_i18n?.[idioma] ?? r.nota);
      return `- ${descreverRegra(r, idioma)}${nota ? ` — ${nota}` : ""}`;
    });
    blocos.push(`${t.tiposPlural[tipo]}\n${linhas.join("\n")}`);
  }
  if (blocos.length === 0) blocos.push(t.semHorarios);
  blocos.push(t.diasSantos[local.dias_santos ?? "null"]);
  return blocos.join("\n\n");
}
