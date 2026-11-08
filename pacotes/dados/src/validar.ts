/**
 * Validações dos dados (§8.3): esquema (validadores pré-compilados), integridade entre
 * arquivos, regras de negócio do motor, calendário e formato canónico. É o mesmo código na
 * CI, no Worker e no GitHub Actions. Erros impedem a gravação; avisos não.
 */
import type { ErrorObject } from "ajv";
import { parse } from "yaml";
import {
  prepararCalendario,
  validar as validarRegrasDeNegocio,
  verificarCalendario,
  type Calendario,
  type CalendarioMotor,
  type Local,
} from "@missas/horarios";
import { formatar } from "./serializar.ts";
import {
  validarCalendario,
  validarEntidade,
  validarLocal,
  type FuncaoValidacao,
} from "./validadores.gerado.js";

export interface ArquivoDados {
  /** Caminho relativo à raiz do repositório, ex.: `dados/locais/aldao.yml`. */
  caminho: string;
  conteudo: string;
}

export interface ProblemaDados {
  nivel: "erro" | "aviso";
  caminho: string;
  mensagem: string;
}

export interface OpcoesValidacao {
  /** Hoje, em Lisboa (AAAA-MM-DD), para recusar confirmações no futuro. */
  hoje?: string;
  /**
   * Erro se `dados/calendario.yml` faltar ou for inválido. Sem calendário, as regras de negócio
   * correm sem dias santos. A validação completa (`npm run validar`) exige-o.
   */
  exigirCalendario?: boolean;
  /** Verifica o formato canónico (C31). Por omissão, sim. */
  formatoCanonico?: boolean;
}

interface Registo {
  id?: unknown;
  entidade?: unknown;
  locais?: unknown;
}

const PASTA_LOCAIS = "dados/locais/";
const PASTA_ENTIDADES = "dados/entidades/";
const CAMINHO_CALENDARIO = "dados/calendario.yml";

function idPeloCaminho(caminho: string): string {
  const nome = caminho.split("/").pop() ?? "";
  return nome.replace(/\.yml$/, "");
}

function descreverErroEsquema(erro: ErrorObject): string {
  const onde = erro.instancePath === "" ? "(raiz)" : erro.instancePath;
  const extra =
    erro.keyword === "additionalProperties"
      ? ` (${String((erro.params as { additionalProperty?: string }).additionalProperty)})`
      : erro.keyword === "enum"
        ? ` (${JSON.stringify((erro.params as { allowedValues?: unknown }).allowedValues)})`
        : "";
  return `esquema: ${onde} ${erro.message ?? "inválido"}${extra}`;
}

export function validarDados(arquivos: ArquivoDados[], opcoes: OpcoesValidacao = {}): ProblemaDados[] {
  const { hoje, formatoCanonico = true, exigirCalendario = false } = opcoes;
  const problemas: ProblemaDados[] = [];
  const erro = (caminho: string, mensagem: string) => problemas.push({ nivel: "erro", caminho, mensagem });
  const locais = new Map<string, { caminho: string; dados: Registo }>();
  const entidades = new Map<string, { caminho: string; dados: Registo }>();
  // Arquivos que já falharam (YAML ou esquema): não geram erros de integridade em cascata.
  const comErro = new Set<string>();
  let calendario: CalendarioMotor | undefined;

  const lidos: { arquivo: ArquivoDados; tipo: "local" | "entidade" | "calendario"; dados: unknown }[] = [];

  for (const arquivo of arquivos) {
    const tipo = arquivo.caminho.startsWith(PASTA_LOCAIS)
      ? "local"
      : arquivo.caminho.startsWith(PASTA_ENTIDADES)
        ? "entidade"
        : arquivo.caminho === CAMINHO_CALENDARIO
          ? "calendario"
          : undefined;
    if (!tipo) continue;
    if (!arquivo.caminho.endsWith(".yml")) {
      erro(arquivo.caminho, "extensão: os arquivos de dados usam .yml");
      continue;
    }

    let dados: unknown;
    try {
      dados = parse(arquivo.conteudo);
    } catch (e) {
      erro(arquivo.caminho, `YAML inválido: ${(e as Error).message}`);
      comErro.add(idPeloCaminho(arquivo.caminho));
      continue;
    }

    const validador: FuncaoValidacao =
      tipo === "local" ? validarLocal : tipo === "entidade" ? validarEntidade : validarCalendario;
    if (!validador(dados)) {
      for (const e of validador.errors ?? []) erro(arquivo.caminho, descreverErroEsquema(e));
      comErro.add(idPeloCaminho(arquivo.caminho));
      continue;
    }

    if (formatoCanonico && formatar(arquivo.conteudo, tipo) !== arquivo.conteudo) {
      erro(arquivo.caminho, "formato: não está no formato canónico (corra `npm run formatar:dados`)");
    }

    if (tipo === "calendario") {
      for (const mensagem of verificarCalendario(dados as Calendario)) {
        erro(arquivo.caminho, `calendário: ${mensagem}`);
      }
      calendario = prepararCalendario(dados as Calendario);
      continue;
    }

    const registo = dados as Registo;
    const id = idPeloCaminho(arquivo.caminho);
    if (registo.id !== id) {
      erro(arquivo.caminho, `integridade: o id "${String(registo.id)}" não coincide com o nome do arquivo "${id}"`);
    }
    (tipo === "local" ? locais : entidades).set(id, { caminho: arquivo.caminho, dados: registo });
    lidos.push({ arquivo, tipo, dados });
  }

  for (const [id, { caminho, dados }] of locais) {
    const entidadeId = String(dados.entidade);
    const entidade = entidades.get(entidadeId);
    if (!entidade) {
      if (comErro.has(entidadeId)) continue;
      erro(caminho, `integridade: a entidade "${entidadeId}" não existe`);
    } else if (!(entidade.dados.locais as string[]).includes(id)) {
      erro(caminho, `integridade: a entidade "${entidadeId}" não lista este local em "locais"`);
    }
  }

  for (const [id, { caminho, dados }] of entidades) {
    for (const localId of dados.locais as string[]) {
      const local = locais.get(localId);
      if (!local) {
        if (comErro.has(localId)) continue;
        erro(caminho, `integridade: o local "${localId}" não existe`);
      } else if (local.dados.entidade !== id) {
        erro(caminho, `integridade: o local "${localId}" pertence a "${String(local.dados.entidade)}"`);
      }
    }
  }

  if (exigirCalendario && !calendario) {
    erro(CAMINHO_CALENDARIO, "calendário em falta ou inválido: os dias santos não podem ser verificados");
  }

  // Regras de negócio (§8.3, item 4), já com o calendário para os dias santos.
  for (const { arquivo, tipo, dados } of lidos) {
    if (tipo !== "local") continue;
    const contexto = { ...(hoje !== undefined && { hoje }), ...(calendario && { calendario }) };
    for (const p of validarRegrasDeNegocio(dados as Local, contexto)) {
      problemas.push({ nivel: p.nivel, caminho: arquivo.caminho, mensagem: `${p.caminho}: ${p.mensagem}` });
    }
  }

  return problemas;
}
