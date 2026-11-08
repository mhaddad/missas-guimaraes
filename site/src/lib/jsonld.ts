/**
 * Dados estruturados schema.org (§6.5): cada local como `Church` com `geo` e `address`, e as
 * regras de horário como `Event` com `eventSchedule` (`Schedule`, `byDay`, `startTime`,
 * `scheduleTimezone: Europe/Lisbon`). Regras quinzenais sem referência ficam de fora.
 */
import {
  epocaDe,
  FUSO_HORARIO,
  somarDias,
  type Data,
  type Dia,
  type Entidade,
  type Local,
  type Regra,
} from "@missas/horarios";
import { TEXTOS, type Idioma } from "../i18n/index.ts";

const DIAS_SCHEMA: Record<Exclude<Dia, "santo">, string> = {
  seg: "https://schema.org/Monday",
  ter: "https://schema.org/Tuesday",
  qua: "https://schema.org/Wednesday",
  qui: "https://schema.org/Thursday",
  sex: "https://schema.org/Friday",
  sab: "https://schema.org/Saturday",
  dom: "https://schema.org/Sunday",
};

/** Último domingo de um mês. */
function ultimoDomingo(ano: number, mes: number): Data {
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  ultimo.setUTCDate(ultimo.getUTCDate() - ultimo.getUTCDay());
  return ultimo.toISOString().slice(0, 10);
}

/** Período atual (ou o próximo) de uma época, para `startDate`/`endDate` do horário. */
export function periodoDaEpoca(epoca: "verao" | "inverno", hoje: Data): { de: Data; ate: Data } {
  const ano = Number(hoje.slice(0, 4));
  if (epoca === "verao") {
    const inicio = epocaDe(hoje) === "verao" || hoje < ultimoDomingo(ano, 3) ? ano : ano + 1;
    return { de: ultimoDomingo(inicio, 3), ate: somarDias(ultimoDomingo(inicio, 10), -1) };
  }
  const inicio = hoje < ultimoDomingo(ano, 3) ? ano - 1 : ano;
  return { de: ultimoDomingo(inicio, 10), ate: somarDias(ultimoDomingo(inicio + 1, 3), -1) };
}

function horario(regra: Regra, hoje: Data): Record<string, unknown> | null {
  const dias = regra.dias.filter((d): d is Exclude<Dia, "santo"> => d !== "santo");
  if (dias.length === 0) return null;
  if (regra.quinzenal && regra.quinzenal.referencia === null) return null;
  const periodo = regra.epoca ? periodoDaEpoca(regra.epoca, hoje) : undefined;
  const de = [regra.validade?.de, periodo?.de].filter(Boolean).sort().at(-1);
  const ate = [regra.validade?.ate, periodo?.ate].filter(Boolean).sort().at(0);
  if (de && ate && de > ate) return null;
  return {
    "@type": "Schedule",
    byDay: dias.map((d) => DIAS_SCHEMA[d]),
    startTime: regra.hora,
    ...(regra.hora_fim && { endTime: regra.hora_fim }),
    repeatFrequency: regra.quinzenal ? "P2W" : regra.semanas_do_mes ? "P1M" : "P1W",
    ...(regra.semanas_do_mes && { byMonthWeek: regra.semanas_do_mes }),
    ...(regra.meses && { byMonth: regra.meses }),
    ...(regra.quinzenal?.referencia && !de && { startDate: regra.quinzenal.referencia }),
    ...(de && { startDate: de }),
    ...(ate && { endDate: ate }),
    scheduleTimezone: FUSO_HORARIO,
  };
}

export function jsonLd(
  locais: readonly { local: Local; entidade: Entidade }[],
  idioma: Idioma,
  urlPagina: string,
  hoje: Data,
): Record<string, unknown> {
  const t = TEXTOS[idioma];
  return {
    "@context": "https://schema.org",
    "@graph": locais.map(({ local, entidade }) => {
      const id = `${urlPagina}#${local.id}`;
      const eventos = local.horarios
        .map((regra) => {
          const agenda = horario(regra, hoje);
          if (!agenda) return null;
          return {
            "@type": "Event",
            name: regra.nota ? `${t.tipos[regra.tipo]} — ${regra.nota}` : t.tipos[regra.tipo],
            eventSchedule: agenda,
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            location: { "@id": id },
            organizer: { "@type": "Organization", name: entidade.nome },
            ...(regra.idioma && regra.idioma !== "pt" && { inLanguage: regra.idioma }),
          };
        })
        .filter(Boolean);
      return {
        "@type": "Church",
        "@id": id,
        name: local.nome,
        url: id,
        geo: { "@type": "GeoCoordinates", latitude: local.geo.lat, longitude: local.geo.lon },
        address: {
          "@type": "PostalAddress",
          ...(local.morada && { streetAddress: local.morada }),
          ...(local.codigo_postal && { postalCode: local.codigo_postal }),
          addressLocality: local.localidade ?? local.concelho,
          addressRegion: local.concelho,
          addressCountry: "PT",
        },
        ...(entidade.telefones_publicos?.[0] && {
          telephone: `+351 ${entidade.telefones_publicos[0]}`,
        }),
        ...(eventos.length > 0 && { event: eventos }),
      };
    }),
  };
}
