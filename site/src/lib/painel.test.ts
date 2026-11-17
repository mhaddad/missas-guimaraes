import { describe, expect, it } from "vitest";
import {
  compararPorAntiguidade,
  estadoDaConfirmacao,
  formatarData,
  haQuanto,
  ultimaAtualizacao,
} from "./painel.ts";

describe("estado da confirmação", () => {
  it("confirmada até 45 dias, a confirmar até 120, depois sem confirmação recente", () => {
    const hoje = "2026-11-17";
    expect(estadoDaConfirmacao("2026-11-17", hoje)).toBe("confirmada");
    expect(estadoDaConfirmacao("2026-10-03", hoje)).toBe("confirmada");
    expect(estadoDaConfirmacao("2026-10-02", hoje)).toBe("a-confirmar");
    expect(estadoDaConfirmacao("2026-07-20", hoje)).toBe("a-confirmar");
    expect(estadoDaConfirmacao("2026-07-19", hoje)).toBe("antiga");
    expect(estadoDaConfirmacao(null, hoje)).toBe("nunca");
  });
});

describe("última atualização e ordenação", () => {
  it("a mais recente entre a gravação e a confirmação", () => {
    expect(ultimaAtualizacao({ confirmado_em: null, ultima_gravacao: null })).toBeNull();
    expect(
      ultimaAtualizacao({ confirmado_em: "2026-10-01", ultima_gravacao: "2026-11-02T10:00:00Z" }),
    ).toBe("2026-11-02");
    expect(ultimaAtualizacao({ confirmado_em: "2026-11-05", ultima_gravacao: null })).toBe(
      "2026-11-05",
    );
  });

  it("primeiro as que nunca foram atualizadas, depois as mais antigas; empate pelo nome", () => {
    const lista = [
      { nome: "Caldas", data: "2026-11-01" },
      { nome: "Briteiros", data: null },
      { nome: "Azurém", data: "2026-09-01" },
      { nome: "Abação", data: null },
    ];
    expect(lista.sort(compararPorAntiguidade((p) => p.data)).map((p) => p.nome)).toEqual([
      "Abação",
      "Briteiros",
      "Azurém",
      "Caldas",
    ]);
  });
});

describe("datas", () => {
  it("relativas e por extenso", () => {
    expect(haQuanto("2026-11-17", "2026-11-17")).toBe("hoje");
    expect(haQuanto("2026-11-16T23:00:00Z", "2026-11-17")).toBe("ontem");
    // Verão: 23:30 UTC já é o dia seguinte em Lisboa.
    expect(haQuanto("2026-07-01T23:30:00Z", "2026-07-02")).toBe("hoje");
    expect(haQuanto("2026-11-10", "2026-11-17")).toBe("há 7 dias");
    expect(haQuanto("2026-10-20", "2026-11-17")).toBe("há 4 semanas");
    expect(haQuanto("2026-07-01", "2026-11-17")).toBe("há 4 meses");
    expect(haQuanto("2025-01-01", "2026-11-17")).toBe("há mais de um ano");
    expect(formatarData("2026-11-17")).toMatch(/17.*nov.*2026/);
  });
});
