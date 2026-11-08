/** Texto e cores do selo de confirmação (§6.6), iguais no build e no navegador. */
import { formatar, plural, TEXTOS, type Idioma, type TipoEntidade } from "../i18n/index.ts";
import { formatarDataLonga } from "./formatos.ts";
import type { EstadoSelo } from "./portal.ts";

export function classeSelo(estado: EstadoSelo): string {
  if (estado === "confirmadoHoje" || estado === "confirmado")
    return "bg-confirmado-fundo text-confirmado";
  if (estado === "aConfirmar") return "bg-aviso-fundo text-dourado-texto";
  return "bg-slate-100 text-texto-secundario";
}

export function textoSelo(
  idioma: Idioma,
  forma: "curto" | "longo",
  estado: EstadoSelo,
  dias: number,
  confirmadoEm: string | null,
  tipoEntidade: TipoEntidade,
): string {
  const t = TEXTOS[idioma];
  if (forma === "curto") return t.selo[estado];
  const pela = t.pelaEntidade[tipoEntidade];
  const com = t.comEntidade[tipoEntidade];
  switch (estado) {
    case "confirmadoHoje":
      return formatar(t.seloLongo.confirmadoHoje, { pela });
    case "confirmado":
      return formatar(plural(idioma, t.seloLongo.confirmadoHa, dias), { pela });
    case "aConfirmar":
      return formatar(t.seloLongo.confirmadoEm, {
        data: formatarDataLonga(confirmadoEm ?? "", idioma),
      });
    case "antigo":
      return formatar(t.seloLongo.antigo, { com });
    case "importado":
      return formatar(t.seloLongo.importado, { pela });
  }
}
