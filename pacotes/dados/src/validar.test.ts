import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarDados, type ArquivoDados } from "./validar.ts";

const esquemas = {
  local: JSON.parse(readFileSync("dados/schema/local.schema.json", "utf8")) as object,
  entidade: JSON.parse(readFileSync("dados/schema/entidade.schema.json", "utf8")) as object,
};

const entidade = `id: paroquia-exemplo
tipo: paroquia
nome: Paróquia de Exemplo
diocese: Braga
locais:
- igreja-exemplo
`;

const local = `id: igreja-exemplo
tipo: igreja
entidade: paroquia-exemplo
concelho: Guimarães
nome: Igreja de Exemplo
geo:
  lat: 41.44
  lon: -8.29
publicar: true
horarios:
- tipo: missa
  dias: [dom]
  hora: '10:00'
excecoes: []
confirmado_em: null
revisao:
  pendente: false
  motivos: []
`;

function arquivos(sobre: Partial<Record<"entidade" | "local", string>> = {}): ArquivoDados[] {
  return [
    { caminho: "dados/entidades/paroquia-exemplo.yml", conteudo: sobre.entidade ?? entidade },
    { caminho: "dados/locais/igreja-exemplo.yml", conteudo: sobre.local ?? local },
  ];
}

describe("validarDados", () => {
  it("aceita uma entidade e um local coerentes", () => {
    expect(validarDados(arquivos(), esquemas)).toEqual([]);
  });

  it("recusa YAML mal formado", () => {
    const erros = validarDados(arquivos({ local: "id: [sem fecho" }), esquemas);
    expect(erros[0]?.mensagem).toMatch(/^YAML inválido/);
  });

  it("recusa campos fora do esquema, como a antiga proveniência", () => {
    const erros = validarDados(arquivos({ local: `${local}origem:\n  fonte: x\n` }), esquemas);
    expect(erros).toContainEqual({
      caminho: "dados/locais/igreja-exemplo.yml",
      mensagem: "esquema: (raiz) must NOT have additional properties (origem)",
    });
  });

  it("recusa datas inválidas sem gerar erros de integridade em cascata", () => {
    const erros = validarDados(
      arquivos({ local: local.replace("confirmado_em: null", "confirmado_em: 2026-13-45") }),
      esquemas,
    );
    expect(erros).toEqual([
      {
        caminho: "dados/locais/igreja-exemplo.yml",
        mensagem: 'esquema: /confirmado_em must match format "date"',
      },
    ]);
  });

  it("recusa coordenadas fora de Guimarães e Vizela", () => {
    const erros = validarDados(arquivos({ local: local.replace("41.44", "38.72") }), esquemas);
    expect(erros.map((e) => e.mensagem)).toContain("esquema: /geo/lat must be >= 41.3");
  });

  it("exige que o id coincida com o nome do arquivo", () => {
    const erros = validarDados(
      [
        { caminho: "dados/entidades/paroquia-exemplo.yml", conteudo: entidade },
        { caminho: "dados/locais/outro-nome.yml", conteudo: local },
      ],
      esquemas,
    );
    expect(erros.map((e) => e.mensagem)).toContain(
      'integridade: o id "igreja-exemplo" não coincide com o nome do arquivo "outro-nome"',
    );
  });

  it("exige a ligação entre entidade e local nos dois sentidos", () => {
    const semLocal = entidade.replace("- igreja-exemplo", "- outra-igreja");
    const mensagens = validarDados(arquivos({ entidade: semLocal }), esquemas).map(
      (e) => e.mensagem,
    );
    expect(mensagens).toContain(
      'integridade: a entidade "paroquia-exemplo" não lista este local em "locais"',
    );
    expect(mensagens).toContain('integridade: o local "outra-igreja" não existe');
  });
});
