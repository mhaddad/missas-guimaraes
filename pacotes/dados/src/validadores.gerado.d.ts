// Tipos de validadores.gerado.js (gerado por pacotes/dados/scripts/gerar-validadores.ts).
import type { ErrorObject } from "ajv";

export interface FuncaoValidacao {
  (dados: unknown): boolean;
  errors?: ErrorObject[] | null;
}

export declare const validarLocal: FuncaoValidacao;
export declare const validarEntidade: FuncaoValidacao;
export declare const validarCalendario: FuncaoValidacao;
