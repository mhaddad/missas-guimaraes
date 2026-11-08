import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarMudanca, type Local } from "@missas/horarios";
import { ErroLeitura, lerCalendario, lerEntidade, lerLocal } from "./ler.ts";
import { formatar, ORDEM_ENTIDADE, ORDEM_EXCECAO, ORDEM_LOCAL, ORDEM_REGRA, serializar } from "./serializar.ts";

const RAIZ = new URL("../../..", import.meta.url).pathname;

function esquema(nome: string): { properties: Record<string, unknown>; $defs?: Record<string, { properties: Record<string, unknown> }> } {
  return JSON.parse(readFileSync(join(RAIZ, "dados/schema", nome), "utf8")) as never;
}

const LOCAL = `# Comentário no topo.
id: teste
tipo: igreja
entidade: teste
concelho: Guimarães
nome: Igreja de Teste
geo:
  lat: 41.44
  lon: -8.29
publicar: true
dias_santos: null
horarios:
- tipo: missa
  dias: [dom]
  hora: '11:00'
excecoes: []
notas: []
confirmado_em: null
confirmado_por: null
revisao:
  pendente: false
  motivos: []
`;

describe("formato canónico", () => {
  it("C31: reescrever todos os YAML de dados/ não produz diferenças", () => {
    const caminhos = [
      "dados/calendario.yml",
      ...["dados/entidades", "dados/locais"].flatMap((pasta) =>
        readdirSync(join(RAIZ, pasta)).map((nome) => `${pasta}/${nome}`),
      ),
    ];
    expect(caminhos.length).toBeGreaterThan(150);
    const diferentes = caminhos.filter((c) => {
      const conteudo = readFileSync(join(RAIZ, c), "utf8");
      return formatar(conteudo, c) !== conteudo;
    });
    expect(diferentes).toEqual([]);
  });

  it("as ordens das chaves seguem os esquemas", () => {
    const local = esquema("local.schema.json");
    expect(ORDEM_LOCAL).toEqual(Object.keys(local.properties));
    expect(ORDEM_REGRA).toEqual(Object.keys(local.$defs?.regra?.properties ?? {}));
    expect([...ORDEM_EXCECAO].sort()).toEqual(Object.keys(local.$defs?.excecao?.properties ?? {}).sort());
    expect(ORDEM_ENTIDADE).toEqual(Object.keys(esquema("entidade.schema.json").properties));
  });

  it("ordena chaves, põe plicas nas horas e datas e listas de dias em linha", () => {
    const desarrumado = `nome: Igreja de Teste
id: teste
horarios:
- hora: "18:00"
  semanas_do_mes:
  - 2
  - 4
  dias:
  - sab
  tipo: missa
  validade: {ate: 2026-12-31, de: 2026-01-01}
excecoes:
- hora: 00:00
  acao: adicionar
  data: 2026-12-25
  nota: Missa do Galo
notas:
- "Texto simples"
`;
    expect(formatar(desarrumado, "local")).toBe(`id: teste
nome: Igreja de Teste
horarios:
- tipo: missa
  dias: [sab]
  hora: '18:00'
  semanas_do_mes: [2, 4]
  validade:
    de: '2026-01-01'
    ate: '2026-12-31'
excecoes:
- {data: '2026-12-25', acao: adicionar, hora: '00:00', nota: Missa do Galo}
notas:
- 'Texto simples'
`);
  });

  it("deteta o tipo pelo caminho e recusa YAML inválido", () => {
    expect(formatar("locais:\n- b\nid: a\n", "dados/entidades/a.yml")).toBe("id: a\nlocais:\n- b\n");
    expect(() => formatar("id: [", "local")).toThrow();
  });
});

describe("serializar", () => {
  it("escreve uma mudança do painel mantendo comentários e o resto do arquivo", () => {
    const antes = lerLocal(LOCAL);
    const depois = aplicarMudanca(antes, {
      acao: "editar",
      indice: 0,
      regra: { tipo: "missa", dias: ["dom"], hora: "10:30" },
      natureza: { tipo: "habitual", de: "2026-12-01" },
    });
    const texto = serializar({ ...depois, excecoes: [{ data: "2026-11-08", acao: "cancelar", hora: "11:00" }] }, "local", LOCAL);
    expect(texto).toBe(
      LOCAL.replace(
        "horarios:\n- tipo: missa\n  dias: [dom]\n  hora: '11:00'\nexcecoes: []",
        `horarios:
- tipo: missa
  dias: [dom]
  hora: '11:00'
  validade:
    ate: '2026-11-30'
- tipo: missa
  dias: [dom]
  hora: '10:30'
  validade:
    de: '2026-12-01'
excecoes:
- {data: '2026-11-08', acao: cancelar, hora: '11:00'}`,
      ),
    );
    expect(formatar(texto, "local")).toBe(texto);
    expect(lerLocal(texto).horarios).toHaveLength(2);
  });

  it("mantém os comentários das regras que não mudaram", () => {
    const comComentarios = LOCAL.replace(
      "horarios:\n- tipo: missa\n  dias: [dom]\n  hora: '11:00'",
      "horarios:\n# Missa principal.\n- tipo: missa\n  dias: [dom]\n  hora: '11:00' # confirmar\n- tipo: missa\n  dias: [sab]\n  hora: '18:00'",
    );
    const local = lerLocal(comComentarios);
    const depois = aplicarMudanca(local, {
      acao: "apagar",
      indice: 1,
      natureza: { tipo: "habitual" },
    });
    const texto = serializar(depois, "local", comComentarios);
    expect(texto).toContain("# Missa principal.\n- tipo: missa\n  dias: [dom]\n  hora: '11:00' # confirmar\nexcecoes:");
    expect(texto).not.toContain("18:00");
  });

  it("sem mudanças, devolve o original; sem original, cria do zero", () => {
    expect(serializar(lerLocal(LOCAL), "local", LOCAL)).toBe(LOCAL);
    const local: Local = lerLocal(LOCAL);
    const { notas: _n, ...semNotas } = local;
    const novo = serializar({ ...semNotas, revisao: local.revisao, id: "teste" }, "local");
    expect(novo).not.toContain("Comentário");
    expect(novo).not.toContain("notas:");
    expect(lerLocal(novo)).toEqual(semNotas);
    expect(serializar({ id: "x", locais: ["y"] }, "entidade", "[]")).toBe("id: x\nlocais:\n- y\n");
  });
});

describe("leitura", () => {
  it("lê e valida locais, entidades e o calendário", () => {
    expect(lerLocal(LOCAL).id).toBe("teste");
    expect(lerEntidade(readFileSync(join(RAIZ, "dados/entidades/homologacao-teste.yml"), "utf8")).tipo).toBe("paroquia");
    expect(lerCalendario(readFileSync(join(RAIZ, "dados/calendario.yml"), "utf8")).anos["2027"]?.moveis.pascoa).toBe(
      "2027-03-28",
    );
  });

  it("recusa arquivos fora do esquema", () => {
    expect(() => lerLocal("id: x\n")).toThrow(ErroLeitura);
    expect(() => lerEntidade("[]")).toThrow("entidade inválido: (raiz) must be object");
  });
});
