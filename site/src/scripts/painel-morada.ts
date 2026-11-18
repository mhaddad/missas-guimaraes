/**
 * Morada, localização no mapa e notas de um local (pedido `alteracao`). As notas aparecem no site
 * por baixo do horário; se mudarem, as traduções antigas (inglês e espanhol) deixam de valer e
 * saem, e o site mostra as novas em português.
 */
import { LIMITES_CONTACTOS } from "@missas/dados/contactos";
import { iguais, type Local } from "@missas/horarios";
import { h } from "./painel-comum.ts";
import {
  abrirModal,
  campo,
  valorDe,
  type Alteracao,
  type Calculo,
  type LocalComSha,
} from "./painel-modal.ts";

/** Região aceite pelo esquema (concelhos de Guimarães e Vizela, com folga). */
const LIMITES_GEO = { lat: [41.3, 41.62], lon: [-8.5, -8.15] } as const;
const CODIGO_POSTAL = /^\d{4}(-\d{3})?$/;
const NUMERO = String.raw`-?\d+(?:[.,]\d+)?`;
const COORDENADAS = new RegExp(String.raw`^\s*(${NUMERO})\s*(?:[,;]\s*|\s+)(${NUMERO})\s*$`);

const linha = (texto: string) => texto.replace(/\s+/g, " ").trim();
const mapa = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

/** "41.4425, -8.2918" (como o Google Maps copia), também com vírgulas decimais. */
export function lerCoordenadas(texto: string): { lat: number; lon: number } | null {
  const m = COORDENADAS.exec(texto);
  if (!m?.[1] || !m[2]) return null;
  const numero = (t: string) => Math.round(Number(t.replace(",", ".")) * 1e6) / 1e6;
  const lat = numero(m[1]);
  const lon = numero(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

export function abrirMorada(opcoes: {
  dialogo: HTMLDialogElement;
  escolhido: LocalComSha;
}): Promise<Alteracao | null> {
  const { escolhido } = opcoes;
  const { local } = escolhido;
  const texto = (nome: string, valor: string | null | undefined, extra = {}) =>
    h("input", {
      type: "text",
      name: nome,
      class: "campo",
      value: valor ?? "",
      maxlength: String(LIMITES_CONTACTOS.morada),
      ...extra,
    });
  const verNoMapa = h(
    "a",
    {
      class: "ligacao text-sm",
      href: mapa(local.geo.lat, local.geo.lon),
      target: "_blank",
      rel: "noopener",
    },
    "Ver no mapa",
    h("span", { class: "sr-only" }, " (abre noutro separador)"),
  );

  const calcular = (form: HTMLFormElement): Calculo => {
    const morada = linha(valorDe(form, "morada")) || null;
    const localidade = linha(valorDe(form, "localidade")) || null;
    const freguesia = linha(valorDe(form, "freguesia")) || null;
    const codigoPostal = linha(valorDe(form, "codigo_postal")) || null;
    if (codigoPostal && !CODIGO_POSTAL.test(codigoPostal))
      return { mensagem: "Código postal: use o formato 4800-001.", erro: true };
    const geo = lerCoordenadas(valorDe(form, "coordenadas"));
    if (!geo)
      return {
        mensagem:
          "Indique as coordenadas como o Google Maps as mostra (por exemplo 41.4425, -8.2918).",
        erro: true,
      };
    if (
      geo.lat < LIMITES_GEO.lat[0] ||
      geo.lat > LIMITES_GEO.lat[1] ||
      geo.lon < LIMITES_GEO.lon[0] ||
      geo.lon > LIMITES_GEO.lon[1]
    )
      return {
        mensagem: "A localização tem de ficar nos concelhos de Guimarães ou Vizela.",
        erro: true,
      };
    const notas = valorDe(form, "notas").split("\n").map(linha).filter(Boolean);
    if (notas.length > LIMITES_CONTACTOS.notas)
      return { mensagem: `No máximo ${LIMITES_CONTACTOS.notas} notas.`, erro: true };
    if (notas.some((n) => n.length > LIMITES_CONTACTOS.nota))
      return {
        mensagem: `Cada nota pode ter até ${LIMITES_CONTACTOS.nota} caracteres.`,
        erro: true,
      };

    // Só se mexe no que mudou (um campo vazio que não existia continua a não existir).
    const depois: Local = { ...local };
    const mudar = (
      chave: "morada" | "localidade" | "freguesia" | "codigo_postal",
      v: string | null,
    ) => {
      if ((local[chave] ?? null) !== v) depois[chave] = v;
    };
    mudar("morada", morada);
    mudar("localidade", localidade);
    mudar("freguesia", freguesia);
    mudar("codigo_postal", codigoPostal);
    if (!iguais(local.geo, geo)) depois.geo = geo;
    if (!iguais(local.notas ?? [], notas)) {
      depois.notas = notas;
      delete depois.notas_i18n;
    }
    return { escolhido, depois };
  };

  return abrirModal({
    dialogo: opcoes.dialogo,
    titulo: `Morada e localização · ${local.nome}`,
    textoGravar: "Gravar",
    campos: [
      campo("Morada", texto("morada", local.morada, { autocomplete: "street-address" })),
      h(
        "div",
        { class: "grid gap-4 sm:grid-cols-3" },
        campo(
          "Código postal",
          texto("codigo_postal", local.codigo_postal, {
            inputmode: "numeric",
            placeholder: "4800-001",
            maxlength: "8",
          }),
        ),
        campo("Localidade", texto("localidade", local.localidade)),
        campo("Freguesia", texto("freguesia", local.freguesia)),
      ),
      h(
        "div",
        { class: "grid gap-1" },
        campo(
          "Coordenadas no mapa",
          texto("coordenadas", `${local.geo.lat}, ${local.geo.lon}`, { inputmode: "decimal" }),
          "Latitude e longitude. No Google Maps, clique com o botão direito em cima da igreja e copie os números que aparecem.",
        ),
        verNoMapa,
      ),
      campo(
        "Notas",
        h(
          "textarea",
          { name: "notas", class: "campo py-3", rows: "4" },
          (local.notas ?? []).join("\n"),
        ),
        "Uma por linha. Aparecem no site por baixo do horário (por exemplo: Missa com coro no 1.º domingo do mês).",
      ),
    ],
    aoMudar(form) {
      const geo = lerCoordenadas(valorDe(form, "coordenadas"));
      if (geo) verNoMapa.setAttribute("href", mapa(geo.lat, geo.lon));
    },
    calcular,
  });
}
