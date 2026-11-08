/**
 * Leitura dos YAML de dados/ (E1.2), com validação do esquema. Lança `ErroLeitura` se o
 * arquivo não for YAML válido ou não cumprir o esquema.
 */
import { parse } from "yaml";
import type { Calendario, Entidade, Local } from "@missas/horarios";
import { validarCalendario, validarEntidade, validarLocal, type FuncaoValidacao } from "./validadores.gerado.js";

export class ErroLeitura extends Error {
  override name = "ErroLeitura";
}

function ler<T>(conteudo: string, validador: FuncaoValidacao, nome: string): T {
  const dados: unknown = parse(conteudo);
  if (!validador(dados)) {
    const primeiro = validador.errors?.[0];
    throw new ErroLeitura(
      `${nome} inválido: ${primeiro ? `${primeiro.instancePath || "(raiz)"} ${primeiro.message ?? ""}` : "esquema"}`,
    );
  }
  return dados as T;
}

export const lerLocal = (conteudo: string): Local => ler<Local>(conteudo, validarLocal, "local");
export const lerEntidade = (conteudo: string): Entidade =>
  ler<Entidade>(conteudo, validarEntidade, "entidade");
export const lerCalendario = (conteudo: string): Calendario =>
  ler<Calendario>(conteudo, validarCalendario, "calendário");
