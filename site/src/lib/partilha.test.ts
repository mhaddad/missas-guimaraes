import { describe, expect, it } from "vitest";
import { imagemDePartilha } from "./partilha.ts";

describe("imagemDePartilha", () => {
  it("usa a fotografia da primeira igreja que a tiver", () => {
    expect(
      imagemDePartilha([
        { nome: "Capela sem foto", foto: null },
        { nome: "Igreja de Santa Eulália", foto: { url: `/fotos/${"a".repeat(64)}.webp` } },
        { nome: "Outra", foto: { url: "/fotos/outra.jpg", alt: "Outra" } },
      ]),
    ).toEqual({ url: `/fotos/${"a".repeat(64)}.webp`, alt: "Igreja de Santa Eulália" });
  });

  it("prefere a descrição da fotografia ao nome da igreja", () => {
    expect(
      imagemDePartilha([
        { nome: "Igreja", foto: { url: "/fotos/x.jpg", alt: "Fachada da igreja" } },
      ]),
    ).toEqual({ url: "/fotos/x.jpg", alt: "Fachada da igreja" });
  });

  it("sem fotografias, nada (fica a imagem geral do site)", () => {
    expect(imagemDePartilha([{ nome: "Igreja", foto: null }, { nome: "Capela" }])).toBeUndefined();
  });
});
