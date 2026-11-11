import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Local } from "@missas/horarios";
import {
  alertasDeAnomalia,
  caminhoEntidade,
  caminhoLocal,
  prepararPedido,
  resumirPedido,
  type OpcoesPedido,
  type ResultadoPedido,
} from "./aplicar.ts";
import { shaBlob, type Pedido } from "./pedido.ts";
import { serializar } from "./serializar.ts";

const AGORA = new Date("2026-11-30T11:45:00Z");

function local(id: string, entidade: string, sobre: Partial<Local> = {}): Local {
  return {
    id,
    tipo: "igreja",
    entidade,
    concelho: "Guimarães",
    nome: `Igreja ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios: [
      { tipo: "missa", dias: ["dom"], hora: "10:00" },
      { tipo: "missa", dias: ["sab"], hora: "19:00" },
    ],
    excecoes: [],
    confirmado_em: null,
    revisao: { pendente: false, motivos: [] },
    ...sobre,
  } as Local;
}

function entidade(id: string, locais: string[]) {
  return { id, tipo: "paroquia", nome: `Paróquia ${id}`, diocese: "Braga", locais };
}

function repositorio(): Map<string, string> {
  const repo = new Map<string, string>();
  repo.set(caminhoEntidade("exemplo"), serializar(entidade("exemplo", ["igreja-a", "capela-b"]), "entidade"));
  repo.set(caminhoEntidade("outra"), serializar(entidade("outra", ["igreja-c"]), "entidade"));
  repo.set(caminhoLocal("igreja-a"), serializar(local("igreja-a", "exemplo"), "local"));
  repo.set(caminhoLocal("capela-b"), serializar(local("capela-b", "exemplo"), "local"));
  repo.set(caminhoLocal("igreja-c"), serializar(local("igreja-c", "outra"), "local"));
  return repo;
}

const REPO = repositorio();
const ler = <T = Record<string, unknown>>(caminho: string, repo = REPO) => parse(repo.get(caminho) ?? "") as T;

async function base(...caminhos: string[]): Promise<Record<string, string | null>> {
  const r: Record<string, string | null> = {};
  for (const c of caminhos) {
    const texto = REPO.get(c);
    r[c] = texto === undefined ? null : await shaBlob(texto);
  }
  return r;
}

function pedido(sobre: Partial<Pedido>): Pedido {
  return {
    versao: 1,
    id: "p_0123456789abcdef",
    tipo: "alteracao",
    emitido_em: "2026-11-30T11:42:07Z",
    contacto: { ref: "c_7f3a", funcao: "paroco" },
    canal: "painel",
    entidade: "exemplo",
    base: {},
    resumo: [],
    ...sobre,
  };
}

const aplicar = (p: Pedido, repo = REPO, extra: Partial<OpcoesPedido> = {}) =>
  prepararPedido(p, repo, { agora: AGORA, exigirCalendario: false, ...extra });

function pronto(r: ResultadoPedido) {
  if (r.estado !== "pronto") throw new Error(`esperava pronto, veio ${JSON.stringify(r)}`);
  return r;
}

/** Alteração de um local com o resumo calculado como o painel o faria. */
async function alteracao(id: string, mudar: (l: Local) => Local, sobre: Partial<Pedido> = {}): Promise<Pedido> {
  const antes = ler<Local>(caminhoLocal(id));
  const depois = mudar(structuredClone(antes));
  return pedido({
    base: await base(caminhoLocal(id)),
    arquivos: { [caminhoLocal(id)]: depois as unknown as Record<string, unknown> },
    resumo: resumirPedido([{ antes, depois }]),
    ...sobre,
  });
}

describe("alteracao", () => {
  it("escreve o local no formato canónico com a mensagem do commit", async () => {
    const p = await alteracao("igreja-a", (l) => ({
      ...l,
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "10:30" }, ...l.horarios.slice(1, 2)],
    }));
    const r = pronto(await aplicar(p));
    expect(r.escritos.map((a) => a.caminho)).toEqual(["dados/locais/igreja-a.yml"]);
    expect(r.escritos[0]?.conteudo).toContain("hora: '10:30'");
    expect(r.mensagem).toBe(
      [
        "Horários: Paróquia exemplo (alteração)",
        `Igreja igreja-a\n  ${p.resumo[0]?.linhas.join("\n  ")}`,
        "Pedido: p_0123456789abcdef\nContacto: c_7f3a (pároco)\nCanal: painel",
      ].join("\n\n"),
    );
    expect(r.alertas).toEqual([]);
  });

  it("recusa campos fora dos permitidos (nome, publicar, entidade, revisao, confirmado_*)", async () => {
    for (const mudar of [
      (l: Local) => ({ ...l, nome: "Outro nome" }),
      (l: Local) => ({ ...l, publicar: false }),
      (l: Local) => ({ ...l, entidade: "outra" }),
      (l: Local) => ({ ...l, revisao: { pendente: true, motivos: ["x"] } }),
      (l: Local) => ({ ...l, confirmado_em: "2026-11-01" }),
      (l: Local) => ({ ...l, confirmado_por: { canal: "moderacao" as const, ref: "c_0000" } }),
    ]) {
      const r = await aplicar(await alteracao("igreja-a", mudar));
      expect(r).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/campos não permitidos/) });
    }
  });

  it("recusa locais de outra entidade (guard de âmbito)", async () => {
    const p = await alteracao("igreja-c", (l) => ({ ...l, horarios: [] }));
    expect(await aplicar(p)).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/âmbito/) });
  });

  it("recusa o arquivo da entidade numa alteração", async () => {
    const p = pedido({
      base: await base(caminhoEntidade("exemplo")),
      arquivos: { [caminhoEntidade("exemplo")]: { ...entidade("exemplo", []) } },
    });
    expect(await aplicar(p)).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/âmbito/) });
  });

  it("recusa um local que não existe", async () => {
    const repo = repositorio();
    repo.delete(caminhoLocal("capela-b"));
    const p = await alteracao("capela-b", (l) => ({ ...l, horarios: [] }));
    expect(await aplicar(p, repo)).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/não existe/) });
  });

  it("CONFLITO se o arquivo mudou desde que foi carregado", async () => {
    const p = await alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }));
    const repo = repositorio();
    repo.set(caminhoLocal("igreja-a"), `${repo.get(caminhoLocal("igreja-a"))}# comentário\n`);
    expect(await aplicar(p, repo)).toMatchObject({ estado: "CONFLITO", motivo: expect.stringMatching(/mudou/) });
  });

  it("CONFLITO se o arquivo deixou de existir", async () => {
    const p = pedido({ tipo: "confirmacao", base: await base(caminhoLocal("igreja-c")) });
    const repo = repositorio();
    repo.delete(caminhoLocal("igreja-c"));
    expect(await aplicar(p, repo)).toMatchObject({ estado: "CONFLITO", motivo: expect.stringMatching(/deixou/) });
  });

  it("recusa um resumo diferente do que as alterações produzem", async () => {
    const p = await alteracao("igreja-a", (l) => ({ ...l, horarios: l.horarios.slice(0, 1) }));
    const r = await aplicar({ ...p, resumo: [{ local: "igreja-a", linhas: ["➕ Missa às 07:00"] }] });
    expect(r).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/resumo/) });
  });

  it("recusa dados que não passam a validação (§8.3)", async () => {
    const p = await alteracao("igreja-a", (l) => ({
      ...l,
      horarios: [{ tipo: "missa", dias: ["dom"], hora: "25:00" }],
    }));
    const r = await aplicar(p);
    expect(r).toMatchObject({ estado: "ERRO", motivo: "os dados não passam a validação" });
    expect(r.estado === "ERRO" && r.problemas?.length).toBeGreaterThan(0);
  });

  it("recusa sem lançar se o repositório tiver YAML ilegível", async () => {
    const p = await alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }));
    const repo = repositorio();
    repo.set(caminhoLocal("igreja-a"), "id: [sem fecho");
    expect(await aplicar(p, repo)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/^não foi possível aplicar o pedido/),
    });
  });

  it("sem_alteracoes quando o conteúdo é igual", async () => {
    expect(await aplicar(await alteracao("igreja-a", (l) => l))).toEqual({ estado: "sem_alteracoes" });
  });

  it("mantém comentários que já existiam", async () => {
    const repo = repositorio();
    const comComentario = `# Notas da secretaria\n${repo.get(caminhoLocal("igreja-a"))}`;
    repo.set(caminhoLocal("igreja-a"), comComentario);
    const antes = parse(comComentario) as Local;
    const depois = { ...antes, dias_santos: "horario_domingo" } as Local;
    const r = pronto(
      await aplicar(
        pedido({
          base: { [caminhoLocal("igreja-a")]: await shaBlob(comComentario) },
          arquivos: { [caminhoLocal("igreja-a")]: depois as unknown as Record<string, unknown> },
          resumo: resumirPedido([{ antes, depois }]),
        }),
        repo,
      ),
    );
    expect(r.escritos[0]?.conteudo.startsWith("# Notas da secretaria\n")).toBe(true);
  });
});

describe("confirmacao", () => {
  it("atualiza confirmado_em (dia de Lisboa) e confirmado_por de todos os locais da entidade", async () => {
    const pares = ["capela-b", "igreja-a"].map((id) => {
      const antes = ler<Local>(caminhoLocal(id));
      return { antes, depois: { ...antes, confirmado_em: "2026-11-30" } };
    });
    const r = pronto(await aplicar(pedido({ tipo: "confirmacao", canal: "email", resumo: resumirPedido(pares) })));
    expect(r.escritos.map((a) => a.caminho)).toEqual(["dados/locais/capela-b.yml", "dados/locais/igreja-a.yml"]);
    const final = new Map(r.escritos.map((a) => [a.caminho, a.conteudo]));
    expect(ler(caminhoLocal("igreja-a"), final)).toMatchObject({
      confirmado_em: "2026-11-30",
      confirmado_por: { canal: "email", ref: "c_7f3a" },
    });
    expect(r.mensagem).toMatch(/^Horários: Paróquia exemplo \(confirmação\)/);
    expect(r.mensagem).toMatch(/Canal: email$/);
  });

  it("usa a data de Lisboa (23:30 UTC no verão já é o dia seguinte)", async () => {
    const p = pedido({ tipo: "confirmacao", emitido_em: "2026-07-14T23:30:00Z" });
    const r = await prepararPedido(p, REPO, { agora: new Date("2026-07-14T23:31:00Z"), exigirCalendario: false });
    expect(r).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/resumo/) });
    const pares = ["capela-b", "igreja-a"].map((id) => {
      const antes = ler<Local>(caminhoLocal(id));
      return { antes, depois: { ...antes, confirmado_em: "2026-07-15" } };
    });
    const r2 = await prepararPedido({ ...p, resumo: resumirPedido(pares) }, REPO, {
      agora: new Date("2026-07-14T23:31:00Z"),
      exigirCalendario: false,
    });
    expect(r2.estado).toBe("pronto");
  });

  it("recusa se um local listado pela entidade não existir", async () => {
    const repo = repositorio();
    repo.delete(caminhoLocal("capela-b"));
    expect(await aplicar(pedido({ tipo: "confirmacao" }), repo)).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/capela-b/),
    });
  });
});

describe("novo-local", () => {
  async function novoLocal(sobre: { local?: Partial<Local>; locais?: string[]; extra?: object } = {}) {
    const novo = local("capela-nova", "exemplo", sobre.local);
    const ent = { ...entidade("exemplo", sobre.locais ?? ["igreja-a", "capela-b", "capela-nova"]), ...sobre.extra };
    return pedido({
      tipo: "novo-local",
      base: { ...(await base(caminhoEntidade("exemplo"))), [caminhoLocal("capela-nova")]: null },
      arquivos: {
        [caminhoLocal("capela-nova")]: novo as unknown as Record<string, unknown>,
        [caminhoEntidade("exemplo")]: ent,
      },
      resumo: resumirPedido([{ antes: null, depois: novo }]),
    });
  }

  it("cria o local e acrescenta-o à entidade", async () => {
    const r = pronto(await aplicar(await novoLocal()));
    expect(r.escritos.map((a) => a.caminho)).toEqual(["dados/entidades/exemplo.yml", "dados/locais/capela-nova.yml"]);
    expect(r.mensagem).toContain("🆕 Novo local: Igreja capela-nova");
    expect(r.mensagem).toMatch(/\(novo local\)/);
  });

  it("CONFLITO se o arquivo já existir", async () => {
    const repo = repositorio();
    repo.set(caminhoLocal("capela-nova"), "id: capela-nova\n");
    expect(await aplicar(await novoLocal(), repo)).toMatchObject({ estado: "CONFLITO", motivo: expect.stringMatching(/já existe/) });
  });

  it.each([
    ["de outra entidade", { local: { entidade: "outra" } }, /pertencer à entidade/],
    ["sem o acrescentar à entidade", { locais: ["igreja-a", "capela-b"] }, /só se acrescenta/],
    ["tirando outro local", { locais: ["igreja-a", "capela-nova"] }, /só se acrescenta/],
    ["mudando o nome da entidade", { extra: { nome: "Outra" } }, /só se acrescenta/],
    ["com locais que não são lista", { extra: { locais: "capela-nova" } }, /só se acrescenta/],
    ["já confirmado", { local: { confirmado_em: "2026-11-01" } }, /sem confirmação/],
    ["com confirmado_por", { local: { confirmado_por: { canal: "painel" as const, ref: "c_0000" } } }, /sem confirmação/],
  ])("recusa: %s", async (_caso, sobre, motivo) => {
    expect(await aplicar(await novoLocal(sobre))).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(motivo) });
  });

  it("recusa sem o arquivo da entidade, ou com dois locais", async () => {
    const p = await novoLocal();
    const soLocal = { [caminhoLocal("capela-nova")]: p.arquivos?.[caminhoLocal("capela-nova")] ?? {} };
    expect(await aplicar({ ...p, arquivos: soLocal })).toMatchObject({ estado: "ERRO" });
    const dois = { ...p.arquivos, [caminhoLocal("outra-nova")]: {} };
    expect(await aplicar({ ...p, arquivos: dois, base: { ...p.base, [caminhoLocal("outra-nova")]: null } })).toMatchObject({
      estado: "ERRO",
    });
  });

  it("recusa um 'novo' local com base (arquivo existente)", async () => {
    const p = await novoLocal();
    const r = await aplicar({ ...p, base: { ...p.base, [caminhoLocal("capela-nova")]: "a".repeat(40) } });
    expect(r).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(/arquivo novo/) });
  });
});

describe("restauro", () => {
  async function restauro(arquivos: Record<string, Record<string, unknown>>, sobre: Partial<Pedido> = {}) {
    const pares = Object.entries(arquivos)
      .filter(([c]) => c.startsWith("dados/locais/"))
      .map(([c, depois]) => ({
        antes: REPO.has(c) ? ler<Local>(c) : null,
        depois: depois as unknown as Local,
      }));
    return pedido({
      tipo: "restauro",
      restaura: "b".repeat(40),
      base: await base(...Object.keys(arquivos)),
      arquivos,
      resumo: resumirPedido(pares),
      ...sobre,
    });
  }

  /** O histórico do Git, com os mesmos arquivos do pedido no commit `restaura`. */
  const historico =
    (arquivos: Record<string, Record<string, unknown>>) =>
    (c: string): string | undefined => {
      const conteudo = arquivos[c];
      if (!conteudo) return undefined;
      return serializar(conteudo, c.startsWith("dados/locais/") ? "local" : "entidade");
    };
  const restaurar = async (arquivos: Record<string, Record<string, unknown>>) =>
    aplicar(await restauro(arquivos), REPO, { versaoRestaurada: historico(arquivos) });

  it("recusa sem acesso ao histórico, ou com conteúdo diferente do commit", async () => {
    const antigo = local("igreja-a", "exemplo", { nome: "Nome antigo" }) as never;
    const p = await restauro({ [caminhoLocal("igreja-a")]: antigo });
    expect(await aplicar(p)).toMatchObject({ estado: "ERRO", motivo: "restauro sem acesso ao histórico" });
    const outro = { [caminhoLocal("igreja-a")]: local("igreja-a", "exemplo", { nome: "Inventado" }) as never };
    expect(await aplicar(p, REPO, { versaoRestaurada: historico(outro) })).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não coincide/),
    });
    expect(await aplicar(p, REPO, { versaoRestaurada: () => undefined })).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não existia/),
    });
  });

  it("repõe qualquer campo de um local da entidade e regista o commit", async () => {
    const antigo = local("igreja-a", "exemplo", { nome: "Nome antigo", publicar: false });
    const r = pronto(await restaurar({ [caminhoLocal("igreja-a")]: antigo as never }));
    expect(r.mensagem).toMatch(/\(restauro\)/);
    expect(r.mensagem).toMatch(/\nRestaura: b{40}$/);
  });

  it("repõe o arquivo da entidade", async () => {
    const r = pronto(
      await restaurar({ [caminhoEntidade("exemplo")]: { ...entidade("exemplo", ["igreja-a", "capela-b"]), nome: "Antigo" } }),
    );
    expect(r.escritos.map((a) => a.caminho)).toEqual(["dados/entidades/exemplo.yml"]);
  });

  it.each([
    ["local de outra entidade", { [caminhoLocal("igreja-c")]: local("igreja-c", "outra") }, /âmbito/],
    ["local que passa a dizer que é da entidade", { [caminhoLocal("igreja-c")]: local("igreja-c", "exemplo") }, /outra entidade/],
    ["entidade com outro id", { [caminhoEntidade("exemplo")]: entidade("outra", []) }, /id da entidade/],
    ["outra entidade", { [caminhoEntidade("outra")]: entidade("outra", ["igreja-c"]) }, /âmbito/],
  ])("recusa: %s", async (_caso, arquivos, motivo) => {
    const r = await restaurar(arquivos as never);
    expect(r).toMatchObject({ estado: "ERRO", motivo: expect.stringMatching(motivo) });
  });
});

describe("gerais", () => {
  it("recusa uma entidade que não existe", async () => {
    expect(await aplicar(pedido({ entidade: "nenhuma", tipo: "confirmacao" }))).toMatchObject({
      estado: "ERRO",
      motivo: expect.stringMatching(/não existe/),
    });
  });

  it("recusa caminhos fora de dados/ mesmo que o pedido não tenha passado por lerPedido", async () => {
    const r = await aplicar(pedido({ tipo: "confirmacao", base: { "../.github/x.yml": null } }));
    expect(r).toMatchObject({ estado: "ERRO", motivo: "caminho inválido" });
  });

  it("textos com quebras de linha não criam trailers falsos", async () => {
    const repo = repositorio();
    const ent = { ...entidade("exemplo", ["igreja-a", "capela-b"]), nome: "Paróquia\n\nPedido: p_falso" };
    repo.set(caminhoEntidade("exemplo"), serializar(ent, "entidade"));
    const p = await alteracao("igreja-a", (l) => ({ ...l, dias_santos: "horario_domingo" }));
    const r = pronto(await aplicar(p, repo));
    expect(r.mensagem.split("\n")[0]).toBe("Horários: Paróquia Pedido: p_falso (alteração)");
    expect(r.mensagem.match(/^Pedido:/gm)).toHaveLength(1);
  });
});

describe("alertasDeAnomalia (§8.3, 6-A)", () => {
  const base = local("x", "e", {
    horarios: [
      { tipo: "missa", dias: ["dom"], hora: "08:00" },
      { tipo: "missa", dias: ["dom"], hora: "10:00" },
      { tipo: "missa", dias: ["dom"], hora: "12:00" },
    ],
  });

  it("local sem nenhum horário", () => {
    expect(alertasDeAnomalia([{ antes: base, depois: { ...base, horarios: [] } }])).toEqual(["Igreja x fica sem nenhum horário."]);
  });

  it("retira mais de metade das regras", () => {
    const depois = { ...base, horarios: base.horarios.slice(0, 1) };
    expect(alertasDeAnomalia([{ antes: base, depois }])).toEqual(["Igreja x: retira 2 de 3 horários."]);
    const metade = local("y", "e", { horarios: base.horarios.slice(0, 2) });
    expect(alertasDeAnomalia([{ antes: metade, depois: { ...metade, horarios: metade.horarios.slice(0, 1) } }])).toEqual([]);
  });

  it("horas novas fora de 06:00–22:30 (horários e exceções)", () => {
    const depois = {
      ...base,
      horarios: [...base.horarios, { tipo: "missa", dias: ["sab"], hora: "23:00" }],
      excecoes: [{ data: "2026-12-24", acao: "adicionar", hora: "05:30" }],
    } as Local;
    expect(alertasDeAnomalia([{ antes: base, depois }])).toEqual([
      "Igreja x: hora fora do habitual (23:00).",
      "Igreja x: hora fora do habitual (05:30).",
    ]);
  });

  it("mais de 5 locais; locais sem mudanças não contam", () => {
    const pares = Array.from({ length: 6 }, (_, i) => {
      const l = local(`l${i}`, "e");
      return { antes: l, depois: { ...l, dias_santos: "horario_domingo" } as Local };
    });
    expect(alertasDeAnomalia(pares)).toEqual(["O pedido mexe em 6 locais."]);
    expect(alertasDeAnomalia(pares.map((p) => ({ antes: p.antes, depois: p.antes })))).toEqual([]);
  });

  it("novo local sem horários não é anomalia", () => {
    expect(alertasDeAnomalia([{ antes: null, depois: { ...base, horarios: [] } }])).toEqual([]);
  });
});
