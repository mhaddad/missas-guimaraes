import { describe, expect, it } from "vitest";
import type { Entidade, Local } from "@missas/horarios";
import { jsonLd, periodoDaEpoca } from "./jsonld.ts";

const entidade: Entidade = {
  id: "p",
  tipo: "paroquia",
  nome: "Paróquia de Teste",
  diocese: "Braga",
  locais: ["l"],
  telefones_publicos: ["253 000 000"],
};

const local: Local = {
  id: "l",
  tipo: "igreja",
  entidade: "p",
  concelho: "Vizela",
  nome: "Igreja de Teste",
  localidade: "Teste",
  morada: "Largo da Igreja",
  codigo_postal: "4815-000",
  geo: { lat: 41.38, lon: -8.3 },
  publicar: true,
  dias_santos: null,
  horarios: [
    { tipo: "missa", dias: ["dom"], hora: "11:00", nota: "Com coro" },
    { tipo: "missa", dias: ["sab"], hora: "17:00", semanas_do_mes: [2, 4], meses: [5] },
    {
      tipo: "confissoes",
      dias: ["sab"],
      hora: "16:00",
      hora_fim: "17:00",
      validade: { de: "2026-12-01" },
    },
    { tipo: "missa", dias: ["sab"], hora: "16:30", quinzenal: { referencia: null } },
    {
      tipo: "missa",
      dias: ["sab"],
      hora: "16:30",
      quinzenal: { referencia: "2026-11-07" },
      idioma: "la",
    },
    { tipo: "missa", dias: ["santo"], hora: "10:00" },
    {
      tipo: "missa",
      dias: ["qua"],
      hora: "19:00",
      epoca: "verao",
      validade: { ate: "2026-01-01" },
    },
  ],
  excecoes: [],
  confirmado_em: null,
  revisao: { pendente: false, motivos: [] },
};

describe("JSON-LD", () => {
  it("períodos das épocas", () => {
    expect(periodoDaEpoca("inverno", "2026-11-08")).toEqual({
      de: "2026-10-25",
      ate: "2027-03-27",
    });
    expect(periodoDaEpoca("inverno", "2027-02-01")).toEqual({
      de: "2026-10-25",
      ate: "2027-03-27",
    });
    expect(periodoDaEpoca("inverno", "2027-07-01")).toEqual({
      de: "2027-10-31",
      ate: "2028-03-25",
    });
    expect(periodoDaEpoca("verao", "2026-11-08")).toEqual({ de: "2027-03-28", ate: "2027-10-30" });
    expect(periodoDaEpoca("verao", "2027-02-01")).toEqual({ de: "2027-03-28", ate: "2027-10-30" });
    expect(periodoDaEpoca("verao", "2027-07-01")).toEqual({ de: "2027-03-28", ate: "2027-10-30" });
  });

  it("igreja com horários", () => {
    const grafo = jsonLd([{ local, entidade }], "en", "https://exemplo.pt/en/", "2026-11-08");
    const igreja = (grafo["@graph"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(igreja).toMatchObject({
      "@type": "Church",
      "@id": "https://exemplo.pt/en/#l",
      telephone: "+351 253 000 000",
      address: { postalCode: "4815-000", addressLocality: "Teste", addressRegion: "Vizela" },
    });
    const eventos = igreja.event as Record<string, Record<string, unknown>>[];
    expect(eventos.map((e) => e.name)).toEqual(["Mass — Com coro", "Mass", "Confession", "Mass"]);
    expect(eventos.map((e) => e.eventSchedule)).toEqual([
      expect.objectContaining({
        byDay: ["https://schema.org/Sunday"],
        startTime: "11:00",
        repeatFrequency: "P1W",
      }),
      expect.objectContaining({ byMonthWeek: [2, 4], byMonth: [5], repeatFrequency: "P1M" }),
      expect.objectContaining({ endTime: "17:00", startDate: "2026-12-01" }),
      expect.objectContaining({ repeatFrequency: "P2W", startDate: "2026-11-07" }),
    ]);
    expect(eventos[3]?.inLanguage).toBe("la");
  });

  it("igreja sem horários nem morada", () => {
    const vazio = { ...local, horarios: [], morada: null, codigo_postal: null, localidade: null };
    const grafo = jsonLd(
      [{ local: vazio, entidade: { ...entidade, telefones_publicos: [] } }],
      "pt-PT",
      "https://x/",
      "2026-11-08",
    );
    const igreja = (grafo["@graph"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(igreja.event).toBeUndefined();
    expect(igreja.telephone).toBeUndefined();
    expect(igreja.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Vizela",
      addressRegion: "Vizela",
      addressCountry: "PT",
    });
  });
});
