import { describe, expect, it } from "vitest";
import type { Local } from "@missas/horarios";
import {
  normalizarEmail,
  normalizarSite,
  normalizarTelefone,
  problemaNaMorada,
  problemaNosContactos,
  resumirContactos,
  type ContactosPublicos,
} from "./contactos.ts";

const VAZIOS: ContactosPublicos = { responsaveis: [], telefones_publicos: [], email: null, site: null };

describe("normalizar", () => {
  it("telefones portugueses na forma 253 123 456", () => {
    expect(normalizarTelefone("253123456")).toBe("253 123 456");
    expect(normalizarTelefone("+351 912 345 678")).toBe("912 345 678");
    expect(normalizarTelefone("00351 253-12-34-56")).toBe("253 123 456");
    expect(normalizarTelefone("(253) 123.456")).toBe("253 123 456");
    for (const mau of ["12345", "353123456", "2531234567", "253 123 45a", "javascript:x"])
      expect(normalizarTelefone(mau)).toBeNull();
  });

  it("e-mail em minúsculas; recusa o que não é um endereço", () => {
    expect(normalizarEmail("  Paroquia@Exemplo.PT ")).toBe("paroquia@exemplo.pt");
    for (const mau of ["sem-arroba", "a@b", "a b@c.pt", 'a"@c.pt', "<a@c.pt>", "a@c.pt\nBcc:x"])
      expect(normalizarEmail(mau)).toBeNull();
  });

  it("site só http ou https (sem protocolo, https); recusa outros esquemas e truques", () => {
    expect(normalizarSite("paroquia.pt")).toBe("https://paroquia.pt/");
    expect(normalizarSite("http://www.paroquia.pt/horarios")).toBe("http://www.paroquia.pt/horarios");
    for (const mau of [
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:senha@paroquia.pt",
      'https://paroquia.pt/"onmouseover=x',
      "https://paroquia.pt/<script>",
      "ftp://paroquia.pt",
      "localhost",
      "",
    ])
      expect(normalizarSite(mau)).toBeNull();
  });
});

describe("problemaNosContactos (só a forma canónica)", () => {
  it("aceita contactos vazios e válidos", () => {
    expect(problemaNosContactos(VAZIOS)).toBeNull();
    expect(
      problemaNosContactos({
        responsaveis: ["Pe. João Silva (pároco)"],
        telefones_publicos: ["253 123 456", "912 345 678"],
        email: "paroquia@exemplo.pt",
        site: "https://paroquia.pt/",
      }),
    ).toBeNull();
  });

  it.each([
    ["telefone fora da forma canónica", { telefones_publicos: ["253123456"] }],
    ["telefone repetido", { telefones_publicos: ["253 123 456", "253 123 456"] }],
    ["demasiados telefones", { telefones_publicos: ["253 123 451", "253 123 452", "253 123 453", "253 123 454", "253 123 455"] }],
    ["e-mail com maiúsculas", { email: "Paroquia@exemplo.pt" }],
    ["site javascript:", { site: "javascript:alert(1)" }],
    ["site não normalizado", { site: "paroquia.pt" }],
    ["responsável com quebra de linha", { responsaveis: ["Pe. João\nSilva"] }],
    ["responsável com espaços nas pontas", { responsaveis: [" Pe. João "] }],
    ["responsável longo demais", { responsaveis: ["x".repeat(121)] }],
    ["responsáveis a mais", { responsaveis: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] }],
    ["responsável que não é texto", { responsaveis: [42] }],
  ])("recusa %s", (_caso, sobre) => {
    expect(problemaNosContactos({ ...VAZIOS, ...sobre } as ContactosPublicos)).not.toBeNull();
  });
});

describe("problemaNaMorada", () => {
  const local = { morada: "Rua Velha", notas: ["Antiga"] } as unknown as Local;
  it("verifica só o que muda", () => {
    const antigo = { morada: "Rua  com  espaços", notas: [] } as unknown as Local;
    expect(problemaNaMorada(antigo, { ...antigo, notas: ["Nova"] } as Local)).toBeNull();
    expect(problemaNaMorada(local, { ...local, morada: "Rua Nova, 12" } as Local)).toBeNull();
    expect(problemaNaMorada(local, { ...local, morada: null } as unknown as Local)).toBeNull();
  });
  it("recusa textos com quebras, longos demais e notas a mais", () => {
    expect(problemaNaMorada(local, { ...local, morada: "Rua\nNova" } as Local)).not.toBeNull();
    expect(problemaNaMorada(local, { ...local, localidade: "x".repeat(201) } as unknown as Local)).not.toBeNull();
    expect(problemaNaMorada(local, { ...local, notas: ["x".repeat(501)] } as Local)).not.toBeNull();
    expect(problemaNaMorada(local, { ...local, notas: Array(11).fill("nota") } as Local)).not.toBeNull();
  });
});

describe("resumirContactos", () => {
  it("uma linha por campo que muda, com o id da entidade", () => {
    expect(
      resumirContactos("exemplo", VAZIOS, {
        responsaveis: ["Pe. João"],
        telefones_publicos: ["253 123 456"],
        email: null,
        site: "https://paroquia.pt/",
      }),
    ).toEqual([
      {
        local: "exemplo",
        linhas: [
          "👤 Responsáveis: — → Pe. João",
          "📞 Telefones: — → 253 123 456",
          "🌐 Site: — → https://paroquia.pt/",
        ],
      },
    ]);
    expect(resumirContactos("exemplo", VAZIOS, VAZIOS)).toEqual([]);
  });
});
