/* Gerado por scripts/gerar-tipos.ts a partir de dados/schema/*.schema.json. Não editar à mão. */
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "id".
 */

export type Id = string;
/**
 * Entidade responsável (paróquia, irmandade, santuário…)
 */

export type Id1 = string;
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "tipo_celebracao".
 */

export type TipoCelebracao = "missa" | "confissoes" | "adoracao" | "terco" | "outro";
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "dia".
 */

export type Dia = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom" | "santo";
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "hora".
 */

export type Hora = string;
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "data".
 */

export type DataISO = string;

export interface Local {
  id: Id;
  tipo: "igreja" | "capela" | "santuario" | "mosteiro" | "lar" | "hospital" | "outro";
  entidade: Id1;
  concelho: "Guimarães" | "Vizela";
  nome: string;
  orago?: string | null;
  localidade?: string | null;
  freguesia?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  geo: {
    lat: number;
    lon: number;
  };
  publicar: boolean;
  /**
   * Como o local celebra os dias santos de preceito (dados/calendario.yml). horario_domingo: aplicam-se as regras de domingo; horario_proprio: aplicam-se as regras com dias: [santo]; horario_habitual: mantém o horário do dia da semana; null: desconhecido.
   */
  dias_santos: "horario_domingo" | "horario_proprio" | "horario_habitual" | null;
  acessibilidade?: string | null;
  horarios: Regra[];
  excecoes: Excecao[];
  notas?: string[];
  notas_i18n?: {
    en?: string[];
    es?: string[];
  };
  /**
   * Última confirmação pela entidade (AAAA-MM-DD); a validade da data é verificada pelo motor.
   */
  confirmado_em: DataISO | null;
  confirmado_por?: {
    canal?: "painel" | "email" | "secretaria" | "moderacao";
    ref?: string;
  } | null;
  revisao: {
    pendente: boolean;
    motivos: string[];
  };
}
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "regra".
 */

export interface Regra {
  tipo: TipoCelebracao;
  /**
   * @minItems 1
   */
  dias: [Dia, ...Dia[]];
  hora: Hora;
  hora_fim?: Hora;
  epoca?: "verao" | "inverno";
  /**
   * @minItems 1
   */
  semanas_do_mes?: [1 | 2 | 3 | 4 | 5 | -1, ...(1 | 2 | 3 | 4 | 5 | -1)[]];
  /**
   * @minItems 1
   */
  meses?: [number, ...number[]];
  quinzenal?: {
    referencia: DataISO | null;
  };
  validade?: {
    de?: DataISO;
    ate?: DataISO;
  };
  idioma?: string;
  nota?: string;
  nota_i18n?: {
    en?: string;
    es?: string;
  };
}
/**
 * This interface was referenced by `Local`'s JSON-Schema
 * via the `definition` "excecao".
 */

export interface Excecao {
  data: DataISO;
  acao: "cancelar" | "adicionar" | "alterar";
  tipo?: TipoCelebracao;
  hora?: Hora;
  hora_original?: Hora;
  nota?: string;
}

export interface Entidade {
  id: string;
  tipo:
    | "paroquia"
    | "irmandade"
    | "confraria"
    | "ordem-terceira"
    | "misericordia"
    | "ordem-religiosa"
    | "santuario"
    | "instituicao"
    | "outro";
  nome: string;
  orago?: string | null;
  arciprestado?: string | null;
  diocese: string;
  /**
   * Pároco, reitor, juiz/provedor… (nomes públicos)
   */
  responsaveis?: string[];
  telefones_publicos?: string[];
  email?: string | null;
  site?: string | null;
  /**
   * @minItems 1
   */
  locais: [string, ...string[]];
}

/**
 * This interface was referenced by `Calendario`'s JSON-Schema
 * via the `definition` "id".
 */

export interface Calendario {
  dias_santos_de_preceito: {
    estado: string;
    /**
     * @minItems 1
     */
    regras: [RegraDiaSanto, ...RegraDiaSanto[]];
    nao_incluidos?: string[];
  };
  anos: {
    [k: string]: AnoCalendario | undefined;
  };
}
/**
 * Exatamente um de data ou data_movel (verificado pelo motor).
 *
 * This interface was referenced by `Calendario`'s JSON-Schema
 * via the `definition` "regra_dia_santo".
 */

export interface RegraDiaSanto {
  id: Id;
  nome: string;
  /**
   * Data fixa, MM-DD
   */
  data?: string;
  /**
   * Dias a partir da Páscoa, ex.: pascoa+60
   */
  data_movel?: string;
}
/**
 * This interface was referenced by `Calendario`'s JSON-Schema
 * via the `definition` "ano".
 */

export interface AnoCalendario {
  dias_santos: {
    [k: string]: DataISO | undefined;
  };
  moveis: {
    [k: string]: DataISO | undefined;
  };
  hora_legal: {
    inicio_verao: DataISO;
    inicio_inverno: DataISO;
  };
}
