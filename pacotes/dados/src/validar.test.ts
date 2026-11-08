import { describe, expect, it } from "vitest";
import { validarDados, type ArquivoDados } from "./validar.ts";

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
dias_santos: null
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
    expect(validarDados(arquivos())).toEqual([]);
  });

  it("recusa YAML mal formado", () => {
    const erros = validarDados(arquivos({ local: "id: [sem fecho" }));
    expect(erros[0]?.mensagem).toMatch(/^YAML inválido/);
  });

  it("recusa campos fora do esquema, como a antiga proveniência", () => {
    const erros = validarDados(arquivos({ local: `${local}origem:\n  fonte: x\n` }));
    expect(erros).toContainEqual({
      nivel: "erro",
      caminho: "dados/locais/igreja-exemplo.yml",
      mensagem: "esquema: (raiz) must NOT have additional properties (origem)",
    });
  });

  it("recusa datas inválidas sem gerar erros de integridade em cascata", () => {
    const erros = validarDados(
      arquivos({ local: local.replace("confirmado_em: null", "confirmado_em: '2026-13-45'") })
    );
    expect(erros).toEqual([
      {
        nivel: "erro",
        caminho: "dados/locais/igreja-exemplo.yml",
        mensagem: "confirmado_em: data inválida (2026-13-45)",
      },
    ]);
  });

  it("recusa coordenadas fora de Guimarães e Vizela", () => {
    const erros = validarDados(arquivos({ local: local.replace("41.44", "38.72") }));
    expect(erros.map((e) => e.mensagem)).toContain("esquema: /geo/lat must be >= 41.3");
  });

  it("exige que o id coincida com o nome do arquivo", () => {
    const erros = validarDados(
      [
        { caminho: "dados/entidades/paroquia-exemplo.yml", conteudo: entidade },
        { caminho: "dados/locais/outro-nome.yml", conteudo: local },
      ]
    );
    expect(erros.map((e) => e.mensagem)).toContain(
      'integridade: o id "igreja-exemplo" não coincide com o nome do arquivo "outro-nome"',
    );
  });

  it("exige a ligação entre entidade e local nos dois sentidos", () => {
    const semLocal = entidade.replace("- igreja-exemplo", "- outra-igreja");
    const mensagens = validarDados(arquivos({ entidade: semLocal })).map(
      (e) => e.mensagem,
    );
    expect(mensagens).toContain(
      'integridade: a entidade "paroquia-exemplo" não lista este local em "locais"',
    );
    expect(mensagens).toContain('integridade: o local "outra-igreja" não existe');
  });

  it("verifica o calendário e usa-o nas regras de negócio", () => {
    const calendario = `dias_santos_de_preceito:
  estado: documentado
  regras:
  - {id: imaculada-conceicao, nome: Imaculada Conceição, data: '12-08'}
anos:
  2026:
    dias_santos:
      imaculada-conceicao: '2026-12-09'
    moveis: {}
    hora_legal:
      inicio_verao: '2026-03-29'
      inicio_inverno: '2026-10-25'
`;
    const comExcecao = local.replace(
      "excecoes: []",
      "excecoes:\n- {data: '2026-12-08', acao: cancelar, hora: '10:00'}",
    );
    const problemas = validarDados([
      { caminho: "dados/calendario.yml", conteudo: calendario },
      ...arquivos({ local: comExcecao }),
    ]);
    expect(problemas).toEqual([
      {
        nivel: "erro",
        caminho: "dados/calendario.yml",
        mensagem: "calendário: anos.2026.dias_santos.imaculada-conceicao: 2026-12-09 ≠ 2026-12-08",
      },
      {
        nivel: "aviso",
        caminho: "dados/locais/igreja-exemplo.yml",
        mensagem: "excecoes[0]: não há nenhuma celebração às 10:00 nesse dia; a exceção não tem efeito",
      },
    ]);
  });

  it("recusa arquivos fora do formato canónico e extensões erradas", () => {
    const problemas = validarDados([
      { caminho: "dados/entidades/paroquia-exemplo.yml", conteudo: entidade.replace("tipo: paroquia\n", "") + "tipo: paroquia\n" },
      { caminho: "dados/locais/igreja-exemplo.yaml", conteudo: local },
      { caminho: "dados/outro.txt", conteudo: "" },
    ]);
    expect(problemas.map((p) => p.mensagem)).toEqual([
      "formato: não está no formato canónico (corra `npm run formatar:dados`)",
      "extensão: os arquivos de dados usam .yml",
      'integridade: o local "igreja-exemplo" não existe',
    ]);
    expect(validarDados(arquivos({ entidade: entidade + "orago: null\n" }), { formatoCanonico: false })).toEqual([]);
  });

  it("recusa confirmações no futuro", () => {
    const confirmado = local.replace("confirmado_em: null", "confirmado_em: '2026-11-09'");
    expect(validarDados(arquivos({ local: confirmado }), { hoje: "2026-11-08" })).toEqual([
      {
        nivel: "erro",
        caminho: "dados/locais/igreja-exemplo.yml",
        mensagem: "confirmado_em: a data de confirmação está no futuro",
      },
    ]);
  });

  it("um local que aponta para outra entidade", () => {
    const outra = `id: outra
tipo: paroquia
nome: Outra
diocese: Braga
locais:
- igreja-exemplo
`;
    const mensagens = validarDados([
      ...arquivos(),
      { caminho: "dados/entidades/outra.yml", conteudo: outra },
    ]).map((p) => p.mensagem);
    expect(mensagens).toEqual(['integridade: o local "igreja-exemplo" pertence a "paroquia-exemplo"']);
  });
});
