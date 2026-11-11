import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  assinar,
  codificarPedido,
  descodificarPedido,
  lerPedido,
  novoIdPedido,
  pedidoDentroDoPrazo,
  shaBlob,
  verificarAssinatura,
  type Pedido,
} from "./pedido.ts";

const SEGREDO = "segredo-de-teste-com-pelo-menos-32-caracteres";
const SHA = "a".repeat(40);

const valido: Pedido = {
  versao: 1,
  id: "p_0123456789abcdef",
  tipo: "alteracao",
  emitido_em: "2026-11-30T11:42:07Z",
  contacto: { ref: "c_7f3a", funcao: "paroco" },
  canal: "painel",
  entidade: "paroquia-exemplo",
  base: { "dados/locais/igreja-exemplo.yml": SHA },
  arquivos: { "dados/locais/igreja-exemplo.yml": { id: "igreja-exemplo" } },
  resumo: [{ local: "igreja-exemplo", linhas: ["➕ Missa: domingos às 10:30"] }],
};

describe("lerPedido", () => {
  it("aceita um pedido completo", () => {
    expect(lerPedido(valido)).toEqual(valido);
  });

  it("aceita uma confirmação sem arquivos e um restauro com o commit", () => {
    const { arquivos: _a, ...semArquivos } = valido;
    expect(lerPedido({ ...semArquivos, tipo: "confirmacao", base: {} })).not.toBeTypeOf("string");
    expect(lerPedido({ ...valido, tipo: "restauro", restaura: "b".repeat(40) })).not.toBeTypeOf(
      "string",
    );
  });

  it.each([
    ["não objeto", null, "pedido: não é um objeto"],
    ["lista", [], "pedido: não é um objeto"],
    ["campo extra", { ...valido, extra: 1 }, "pedido: campos desconhecidos"],
    ["versão", { ...valido, versao: 2 }, "versao"],
    ["id", { ...valido, id: "p_xyz" }, "id"],
    ["tipo", { ...valido, tipo: "apagar" }, "tipo"],
    ["emitido_em sem Z", { ...valido, emitido_em: "2026-11-30T11:42:07" }, "emitido_em"],
    ["emitido_em impossível", { ...valido, emitido_em: "2026-13-30T11:42:07Z" }, "emitido_em"],
    ["contacto com e-mail", { ...valido, contacto: { ref: "a@b.pt", funcao: "paroco" } }, "contacto"],
    ["contacto com nome", { ...valido, contacto: { ...valido.contacto, nome: "X" } }, "contacto"],
    ["função", { ...valido, contacto: { ref: "c_7f3a", funcao: "bispo" } }, "contacto"],
    ["canal", { ...valido, canal: "sms" }, "canal"],
    ["entidade", { ...valido, entidade: "../x" }, "entidade"],
    ["base não objeto", { ...valido, base: [] }, "base"],
    ["base com sha inválido", { ...valido, base: { "dados/locais/igreja-exemplo.yml": "x" } }, "base: sha"],
    ["confirmação com arquivos", { ...valido, tipo: "confirmacao" }, "arquivos: uma confirmação não traz arquivos"],
    ["sem arquivos", { ...valido, arquivos: {} }, "arquivos"],
    ["arquivos não objeto", { ...valido, arquivos: [] }, "arquivos"],
    [
      "conteúdo não objeto",
      { ...valido, arquivos: { "dados/locais/igreja-exemplo.yml": "texto" } },
      "arquivos: conteúdo",
    ],
    [
      "arquivo sem base",
      { ...valido, arquivos: { "dados/locais/outra.yml": {} } },
      "base: falta o sha de um arquivo",
    ],
    ["resumo não lista", { ...valido, resumo: {} }, "resumo"],
    ["resumo com linhas erradas", { ...valido, resumo: [{ local: "x", linhas: [1] }] }, "resumo"],
    ["restauro sem commit", { ...valido, tipo: "restauro" }, "restaura"],
    ["restaura fora de restauro", { ...valido, restaura: SHA }, "restaura: só em restauros"],
  ])("recusa: %s", (_caso, pedido, motivo) => {
    expect(lerPedido(pedido)).toBe(motivo);
  });

  it.each([
    "dados/locais/../../.github/workflows/x.yml",
    "dados/locais/x.yaml",
    "dados/calendario.yml",
    "dados/locais/sub/x.yml",
    "/dados/locais/x.yml",
    "dados/locais/X.yml",
    ".github/workflows/deploy.yml",
    "scripts/aplicar-pedido.ts",
  ])("recusa o caminho %s", (caminho) => {
    expect(lerPedido({ ...valido, base: { [caminho]: SHA } })).toBe("base: caminho inválido");
    expect(
      lerPedido({ ...valido, arquivos: { [caminho]: {} } }),
    ).toBe("arquivos: caminho inválido");
  });

  it("limita o número de arquivos", () => {
    const base = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [`dados/locais/l${i}.yml`, SHA]),
    );
    expect(lerPedido({ ...valido, base })).toBe("base");
  });
});

describe("prazo", () => {
  const emitido = new Date(valido.emitido_em).getTime();
  it.each([
    [0, true],
    [15 * 60 * 1000, true],
    [15 * 60 * 1000 + 1, false],
    [-60 * 1000, true],
    [-61 * 1000, false],
  ])("emitido há %i ms → %s", (diferenca, esperado) => {
    expect(pedidoDentroDoPrazo(valido, new Date(emitido + diferenca))).toBe(esperado);
  });
});

describe("base64", () => {
  it("ida e volta com acentos e emojis", () => {
    const pedido = { ...valido, resumo: [{ local: "x", linhas: ["Missa às 10:30 ✅ São Tomé"] }] };
    expect(descodificarPedido(codificarPedido(pedido))).toEqual(pedido);
  });

  it.each(["%%%", btoa("não é json"), btoa("\xff\xfe")])("lixo dá null: %s", (texto) => {
    expect(descodificarPedido(texto)).toBeNull();
  });
});

describe("assinatura HMAC", () => {
  it("assina e verifica", async () => {
    const texto = codificarPedido(valido);
    const assinatura = await assinar(SEGREDO, texto);
    expect(assinatura).toMatch(/^[0-9a-f]{64}$/);
    expect(await verificarAssinatura(SEGREDO, texto, assinatura)).toBe(true);
  });

  it("coincide com o HMAC-SHA256 de referência (RFC 4231, caso 2 adaptado)", async () => {
    // openssl dgst -sha256 -hmac "<SEGREDO>" <<< -n "abc"
    const esperado = execFileSync("openssl", ["dgst", "-sha256", "-hmac", SEGREDO, "-r"], {
      input: "abc",
    })
      .toString()
      .split(" ")[0];
    expect(await assinar(SEGREDO, "abc")).toBe(esperado);
  });

  it("recusa texto alterado, outro segredo e assinaturas mal formadas", async () => {
    const texto = codificarPedido(valido);
    const assinatura = await assinar(SEGREDO, texto);
    expect(await verificarAssinatura(SEGREDO, `${texto}A`, assinatura)).toBe(false);
    expect(await verificarAssinatura(`${SEGREDO}x`, texto, assinatura)).toBe(false);
    expect(await verificarAssinatura(SEGREDO, texto, assinatura.toUpperCase())).toBe(false);
    expect(await verificarAssinatura(SEGREDO, texto, assinatura.slice(2))).toBe(false);
    expect(await verificarAssinatura(SEGREDO, texto, "")).toBe(false);
  });

  it("recusa segredos curtos", async () => {
    await expect(assinar("curto", "abc")).rejects.toThrow(/curto/);
    expect(await verificarAssinatura("curto", "abc", "0".repeat(64))).toBe(false);
  });
});

describe("shaBlob", () => {
  it("é igual ao git hash-object", async () => {
    const texto = "id: igreja-exemplo\nnome: São Tomé ✅\n";
    const git = execFileSync("git", ["hash-object", "--stdin"], { input: texto })
      .toString()
      .trim();
    expect(await shaBlob(texto)).toBe(git);
  });
});

it("novoIdPedido segue o padrão", () => {
  const id = novoIdPedido();
  expect(lerPedido({ ...valido, id })).not.toBeTypeOf("string");
  expect(novoIdPedido()).not.toBe(id);
});
