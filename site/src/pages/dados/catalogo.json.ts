/**
 * Catálogo para o painel (E3): entidades com os seus locais e os locais publicados e por publicar,
 * tal como estão no build. O Worker usa-o para o seletor de entidade, para validar as entidades
 * de um contacto e, sem a GitHub App, para mostrar os horários. São os mesmos dados públicos do
 * repositório.
 */
import type { APIRoute } from "astro";
import { carregarDados } from "../../lib/dados-build.ts";

export const GET: APIRoute = () => {
  const { locais, entidades } = carregarDados();
  const corpo = {
    entidades: [...entidades.values()]
      .map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, locais: e.locais }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    locais: Object.fromEntries(locais.map((l) => [l.id, l])),
  };
  return new Response(JSON.stringify(corpo), { headers: { "content-type": "application/json; charset=utf-8" } });
};
