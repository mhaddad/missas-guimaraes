/**
 * Aplicação de um pedido ao estado do repositório (§8.2–§8.4), sem Git nem rede: recebe os
 * arquivos atuais de `dados/` e devolve os arquivos a escrever e a mensagem do commit, ou o
 * motivo da recusa. REVISÃO DE SEGURANÇA OBRIGATÓRIA (guardas de âmbito e de confirmação).
 *
 * Corre no GitHub Actions (`scripts/aplicar-pedido.ts`) e, para a verificação prévia, no Worker.
 * A assinatura e o prazo verificam-se antes, em `pedido.ts`.
 */
import { parse } from "yaml";
import {
  chaveCanonica,
  diff,
  iguais,
  momentoEmLisboa,
  resumirAlteracoes,
  type Entidade,
  type Local,
} from "@missas/horarios";
import type { Pedido, ResumoLocal, TipoPedido } from "./pedido.ts";
import { PADRAO_CAMINHO, shaBlob } from "./pedido.ts";
import { serializar } from "./serializar.ts";
import { validarDados, type ArquivoDados, type ProblemaDados } from "./validar.ts";

export type ResultadoPedido =
  | {
      estado: "pronto";
      /** Só os arquivos que mudam, já no formato canónico. */
      escritos: ArquivoDados[];
      mensagem: string;
      alertas: string[];
      avisos: ProblemaDados[];
    }
  /** O pedido é válido mas não muda nada (ex.: segunda confirmação no mesmo dia). */
  | { estado: "sem_alteracoes" }
  | { estado: "CONFLITO"; motivo: string }
  | { estado: "ERRO"; motivo: string; problemas?: ProblemaDados[] };

/**
 * Campos que uma `alteracao` pode mudar num local (§8.2). `confirmado_em` e `confirmado_por` só
 * mudam por um pedido `confirmacao`, em que é o workflow que os escreve (com o contacto assinado).
 */
export const CAMPOS_ALTERACAO: readonly string[] = [
  "horarios",
  "excecoes",
  "notas",
  "notas_i18n",
  "dias_santos",
];

const ROTULOS_TIPO: Record<TipoPedido, string> = {
  confirmacao: "confirmação",
  alteracao: "alteração",
  "novo-local": "novo local",
  restauro: "restauro",
};

const ROTULOS_FUNCAO: Record<string, string> = {
  paroco: "pároco",
  secretaria: "secretaria",
  colaborador: "colaborador",
  equipa: "equipa",
};

const HORA_MINIMA = "06:00";
const HORA_MAXIMA = "22:30";
const MAX_LOCAIS_SEM_ALERTA = 5;

export const caminhoLocal = (id: string): string => `dados/locais/${id}.yml`;
export const caminhoEntidade = (id: string): string => `dados/entidades/${id}.yml`;

function idDoCaminho(caminho: string): string {
  return (caminho.split("/").pop() ?? "").replace(/\.yml$/, "");
}

/** Uma linha só, sem quebras: os textos vêm dos dados e não podem criar *trailers* falsos. */
function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function lerYaml<T>(texto: string): T {
  return parse(texto) as T;
}

export interface ParLocal {
  /** `null` para um local novo. */
  antes: Local | null;
  depois: Local;
}

/**
 * Resumo de um pedido, local a local, com as linhas do motor (§5.1, `diff`). O painel e o
 * Worker calculam-no da mesma forma; o GitHub Actions recalcula-o e recusa se não coincidir.
 */
export function resumirPedido(pares: readonly ParLocal[]): ResumoLocal[] {
  return pares
    .map(({ antes, depois }) => {
      const vazio: Local = {
        ...depois,
        horarios: [],
        excecoes: [],
        dias_santos: null,
        confirmado_em: null,
      };
      delete (vazio as Partial<Local>).confirmado_por;
      const alteracoes = diff(antes ?? vazio, depois).filter(
        // `confirmado_por` acompanha sempre `confirmado_em`, que já tem a sua linha.
        (a) => !(a.tipo === "campo" && a.campo === "confirmado_por"),
      );
      const linhas = resumirAlteracoes(alteracoes).map(umaLinha);
      if (antes === null) linhas.unshift(`🆕 Novo local: ${umaLinha(depois.nome)}`);
      return { local: depois.id, linhas };
    })
    .filter((r) => r.linhas.length > 0)
    .sort((a, b) => a.local.localeCompare(b.local));
}

/**
 * Alertas de anomalia (§8.3, 6-A): não impedem a gravação, mas pedem confirmação reforçada no
 * painel e um e-mail aos administradores.
 */
export function alertasDeAnomalia(pares: readonly ParLocal[]): string[] {
  const alertas: string[] = [];
  const mudados = pares.filter(({ antes, depois }) => !iguais(antes, depois));
  if (mudados.length > MAX_LOCAIS_SEM_ALERTA)
    alertas.push(`O pedido mexe em ${mudados.length} locais.`);
  for (const { antes, depois } of mudados) {
    const nome = umaLinha(depois.nome);
    if (antes && antes.horarios.length > 0) {
      const chavesDepois = new Set(depois.horarios.map(chaveCanonica));
      const retiradas = antes.horarios.filter((r) => !chavesDepois.has(chaveCanonica(r))).length;
      if (depois.horarios.length === 0) alertas.push(`${nome} fica sem nenhum horário.`);
      else if (retiradas * 2 > antes.horarios.length)
        alertas.push(`${nome}: retira ${retiradas} de ${antes.horarios.length} horários.`);
    }
    const existentes = new Set(
      [...(antes?.horarios ?? []), ...(antes?.excecoes ?? [])].map(chaveCanonica),
    );
    const horas = [...depois.horarios, ...depois.excecoes]
      .filter((x) => !existentes.has(chaveCanonica(x)))
      .flatMap((x) => [x.hora, "hora_fim" in x ? x.hora_fim : undefined])
      .filter((h): h is string => typeof h === "string");
    for (const hora of new Set(horas)) {
      if (hora < HORA_MINIMA || hora > HORA_MAXIMA)
        alertas.push(`${nome}: hora fora do habitual (${hora}).`);
    }
  }
  return alertas;
}

function mensagemDoCommit(
  pedido: Pedido,
  nomeEntidade: string,
  resumo: readonly ResumoLocal[],
  nomes: ReadonlyMap<string, string>,
): string {
  const corpo = resumo.map(
    (r) =>
      `${umaLinha(nomes.get(r.local) ?? r.local)}\n${r.linhas.map((l) => `  ${l}`).join("\n")}`,
  );
  const trailers = [
    `Pedido: ${pedido.id}`,
    `Contacto: ${pedido.contacto.ref} (${ROTULOS_FUNCAO[pedido.contacto.funcao]})`,
    `Canal: ${pedido.canal}`,
    ...(pedido.restaura ? [`Restaura: ${pedido.restaura}`] : []),
  ];
  return [
    `Horários: ${umaLinha(nomeEntidade)} (${ROTULOS_TIPO[pedido.tipo]})`,
    ...corpo,
    trailers.join("\n"),
  ].join("\n\n");
}

/** Chaves (de qualquer dos lados) cujo valor mudou. */
function camposMudados(antes: Record<string, unknown>, depois: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(
    (k) => !iguais(antes[k] ?? null, depois[k] ?? null),
  );
}

type Novos = Map<string, Record<string, unknown>>;
type Recusa = { estado: "ERRO"; motivo: string };
const erro = (motivo: string): Recusa => ({ estado: "ERRO", motivo });

/** Calcula o estado final de cada arquivo tocado, aplicando as guardas do tipo de pedido. */
function arquivosDoPedido(
  pedido: Pedido,
  repo: ReadonlyMap<string, string>,
  entidade: Entidade,
  versaoRestaurada: OpcoesPedido["versaoRestaurada"],
): Novos | Recusa {
  const doEntidade = new Set(entidade.locais);
  const novos: Novos = new Map();
  const atual = (caminho: string) => {
    const texto = repo.get(caminho);
    return texto === undefined ? undefined : lerYaml<Record<string, unknown>>(texto);
  };

  if (pedido.tipo === "confirmacao") {
    const hoje = momentoEmLisboa(new Date(pedido.emitido_em)).data;
    for (const id of entidade.locais) {
      const local = atual(caminhoLocal(id));
      if (!local) return erro(`o local ${id} da entidade não existe`);
      novos.set(caminhoLocal(id), {
        ...local,
        confirmado_em: hoje,
        confirmado_por: { canal: pedido.canal, ref: pedido.contacto.ref },
      });
    }
    return novos;
  }

  const arquivos = Object.entries(pedido.arquivos ?? {});

  if (pedido.tipo === "alteracao") {
    for (const [caminho, depois] of arquivos) {
      const id = idDoCaminho(caminho);
      if (caminho !== caminhoLocal(id) || !doEntidade.has(id))
        return erro(`âmbito: ${caminho} não é um local da entidade`);
      const antes = atual(caminho);
      if (!antes) return erro(`${caminho} não existe`);
      const fora = camposMudados(antes, depois).filter((c) => !CAMPOS_ALTERACAO.includes(c));
      if (fora.length > 0) return erro(`alteração de campos não permitidos: ${fora.join(", ")}`);
      novos.set(caminho, depois);
    }
    return novos;
  }

  if (pedido.tipo === "novo-local") {
    const pEntidade = caminhoEntidade(pedido.entidade);
    const locais = arquivos.filter(([c]) => c !== pEntidade);
    const novaEntidade = pedido.arquivos?.[pEntidade];
    const [primeiro] = locais;
    if (!novaEntidade || !primeiro || locais.length !== 1)
      return erro("um novo local traz o arquivo do local e o da entidade");
    const [caminho, local] = primeiro;
    const id = idDoCaminho(caminho);
    if (caminho !== caminhoLocal(id) || pedido.base[caminho] !== null)
      return erro("o novo local tem de ser um arquivo novo de dados/locais/");
    if (local.id !== id || local.entidade !== pedido.entidade)
      return erro("o novo local tem de pertencer à entidade do pedido");
    if ((local.confirmado_em ?? null) !== null || (local.confirmado_por ?? null) !== null)
      return erro("um novo local começa sem confirmação");
    const fora = camposMudados(entidade as unknown as Record<string, unknown>, novaEntidade);
    const esperados = [...entidade.locais, id].sort();
    const recebidos = Array.isArray(novaEntidade.locais)
      ? [...(novaEntidade.locais as unknown[])].map(String).sort()
      : [];
    if (fora.some((c) => c !== "locais") || !iguais(esperados, recebidos))
      return erro("na entidade, só se acrescenta o novo local à lista `locais`");
    novos.set(caminho, local);
    novos.set(pEntidade, novaEntidade);
    return novos;
  }

  // restauro: o conteúdo de uma versão anterior dos arquivos da entidade (só `admin`, no Worker).
  // O conteúdo tem de ser exatamente o do commit `restaura` (defesa em profundidade: um restauro
  // assinado por engano não serve para escrever valores novos).
  if (!versaoRestaurada) return erro("restauro sem acesso ao histórico");
  for (const [caminho, conteudo] of arquivos) {
    const id = idDoCaminho(caminho);
    const antigo = versaoRestaurada(caminho);
    if (antigo === undefined) return erro(`restauro: ${caminho} não existia nesse commit`);
    if (!iguais(lerYaml<unknown>(antigo), conteudo))
      return erro(`restauro: ${caminho} não coincide com a versão desse commit`);
    if (caminho === caminhoEntidade(pedido.entidade)) {
      if (conteudo.id !== pedido.entidade) return erro("restauro: id da entidade");
    } else if (caminho !== caminhoLocal(id) || conteudo.entidade !== pedido.entidade) {
      return erro(`âmbito: ${caminho} não é um local da entidade`);
    } else if (!doEntidade.has(id) && repo.has(caminho)) {
      return erro(`âmbito: ${caminho} pertence a outra entidade`);
    }
    novos.set(caminho, conteudo);
  }
  return novos;
}

export interface OpcoesPedido {
  /** Instante da aplicação: dá o "hoje" das validações. */
  agora: Date;
  /** Exigir o calendário na validação (por omissão, sim, como na CI). */
  exigirCalendario?: boolean;
  /**
   * Só para `restauro`: o conteúdo de um arquivo no commit `restaura` (`undefined` se não
   * existia). Sem isto, os restauros são recusados.
   */
  versaoRestaurada?: (caminho: string) => string | undefined;
}

/**
 * Aplica o pedido a `repo` (caminho → conteúdo de todos os arquivos de `dados/`). Não escreve
 * nada: devolve o que escrever.
 */
export async function prepararPedido(
  pedido: Pedido,
  repo: ReadonlyMap<string, string>,
  opcoes: OpcoesPedido,
): Promise<ResultadoPedido> {
  try {
    return await preparar(pedido, repo, opcoes);
  } catch (e) {
    // YAML ilegível no repositório ou conteúdo que o serializador não aceita.
    return erro(`não foi possível aplicar o pedido: ${(e as Error).message}`);
  }
}

async function preparar(
  pedido: Pedido,
  repo: ReadonlyMap<string, string>,
  opcoes: OpcoesPedido,
): Promise<ResultadoPedido> {
  const textoEntidade = repo.get(caminhoEntidade(pedido.entidade));
  if (textoEntidade === undefined) return erro(`a entidade ${pedido.entidade} não existe`);
  const entidade = lerYaml<Entidade>(textoEntidade);

  // Defesa em profundidade: `lerPedido` já recusa outros caminhos.
  const tocados = [...Object.keys(pedido.base), ...Object.keys(pedido.arquivos ?? {})];
  if (!tocados.every((c) => PADRAO_CAMINHO.test(c))) return erro("caminho inválido");

  const novos = arquivosDoPedido(pedido, repo, entidade, opcoes.versaoRestaurada);
  if (!(novos instanceof Map)) return novos;

  // Conflitos (§8.6): cada arquivo do `base` tem de estar como o painel o leu.
  for (const [caminho, sha] of Object.entries(pedido.base)) {
    const texto = repo.get(caminho);
    if (sha === null) {
      if (texto !== undefined) return { estado: "CONFLITO", motivo: `${caminho} já existe` };
    } else if (texto === undefined) {
      return { estado: "CONFLITO", motivo: `${caminho} deixou de existir` };
    } else if ((await shaBlob(texto)) !== sha) {
      return { estado: "CONFLITO", motivo: `${caminho} mudou desde que foi carregado` };
    }
  }

  const escritos: ArquivoDados[] = [...novos]
    .map(([caminho, dados]) => ({
      caminho,
      conteudo: serializar(
        dados,
        caminho.startsWith("dados/locais/") ? "local" : "entidade",
        repo.get(caminho),
      ),
    }))
    .filter((a) => a.conteudo !== repo.get(a.caminho))
    .sort((a, b) => a.caminho.localeCompare(b.caminho));
  if (escritos.length === 0) return { estado: "sem_alteracoes" };

  // Validação completa (§8.3) sobre o repositório já com as alterações.
  const final = new Map(repo);
  for (const a of escritos) final.set(a.caminho, a.conteudo);
  const problemas = validarDados(
    [...final].map(([caminho, conteudo]) => ({ caminho, conteudo })),
    {
      hoje: momentoEmLisboa(opcoes.agora).data,
      exigirCalendario: opcoes.exigirCalendario ?? true,
    },
  );
  const erros = problemas.filter((p) => p.nivel === "erro");
  if (erros.length > 0)
    return { estado: "ERRO", motivo: "os dados não passam a validação", problemas: erros };

  // Resumo recalculado; tem de coincidir com o que a pessoa viu antes de enviar.
  const pares: ParLocal[] = escritos
    .filter((a) => a.caminho.startsWith("dados/locais/"))
    .map((a) => {
      const antes = repo.get(a.caminho);
      return {
        antes: antes === undefined ? null : lerYaml<Local>(antes),
        depois: lerYaml<Local>(a.conteudo),
      };
    });
  const resumo = resumirPedido(pares);
  const recebido = [...pedido.resumo].sort((a, b) => a.local.localeCompare(b.local));
  if (!iguais(recebido, resumo)) return erro("o resumo do pedido não coincide com as alterações");

  const nomes = new Map(pares.map((p) => [p.depois.id, p.depois.nome]));
  return {
    estado: "pronto",
    escritos,
    mensagem: mensagemDoCommit(pedido, entidade.nome, resumo, nomes),
    alertas: alertasDeAnomalia(pares),
    avisos: problemas.filter((p) => p.nivel === "aviso"),
  };
}
