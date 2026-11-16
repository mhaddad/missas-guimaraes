import { beforeEach, describe, expect, it } from "vitest";
import { chavePagina, esquecerPaginas, guardarPagina, obterPagina } from "./paginas.ts";
import { novaBase } from "./teste-util.ts";

const AGORA = new Date("2026-11-16T23:30:00Z");

beforeEach(() => esquecerPaginas());

describe("cache das páginas públicas", () => {
  it("a chave muda com o dia de Lisboa, a versão dos dados e a versão do código", async () => {
    const mem = novaBase();
    const bd = mem.comoD1();
    const chave = await chavePagina(bd, "/", "deploy-1", AGORA);
    expect(chave).toBe("/|2026-11-16|v1|deploy-1");
    expect(await chavePagina(bd, "/", "deploy-2", AGORA)).not.toBe(chave);
    expect(await chavePagina(bd, "/", "deploy-1", new Date("2026-11-17T00:30:00Z"))).not.toBe(
      chave,
    );
    mem.base.prepare("UPDATE config SET valor = '2' WHERE chave = 'versao_dados'").run();
    expect(await chavePagina(bd, "/", "deploy-1", AGORA)).not.toBe(chave);
  });

  it("uma página de outro deploy nunca é servida", async () => {
    const bd = novaBase().comoD1();
    await guardarPagina(bd, await chavePagina(bd, "/", "deploy-1", AGORA), "<html>1</html>", AGORA);
    expect(await obterPagina(bd, await chavePagina(bd, "/", "deploy-1", AGORA))).toBe(
      "<html>1</html>",
    );
    esquecerPaginas();
    expect(await obterPagina(bd, await chavePagina(bd, "/", "deploy-2", AGORA))).toBeNull();
  });
});
