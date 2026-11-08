/**
 * Validações dos dados (§8.3). No E0: esquema JSON e integridade (nome do arquivo = id,
 * ligações entre entidades e locais nos dois sentidos). As regras de negócio do motor,
 * o formato canónico e a geografia por polígonos entram no E1.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { parse } from "yaml";

export interface ArquivoDados {
  /** Caminho relativo à raiz do repositório, ex.: `dados/locais/aldao.yml`. */
  caminho: string;
  conteudo: string;
}

export interface ErroValidacao {
  caminho: string;
  mensagem: string;
}

export interface Esquemas {
  local: object;
  entidade: object;
}

interface Registo {
  id?: unknown;
  entidade?: unknown;
  locais?: unknown;
}

const PASTA_LOCAIS = "dados/locais/";
const PASTA_ENTIDADES = "dados/entidades/";

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

export function validarDados(arquivos: ArquivoDados[], esquemas: Esquemas): ErroValidacao[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats.default(ajv);
  const validarLocal = ajv.compile(esquemas.local);
  const validarEntidade = ajv.compile(esquemas.entidade);

  const erros: ErroValidacao[] = [];
  const locais = new Map<string, { caminho: string; dados: Registo }>();
  const entidades = new Map<string, { caminho: string; dados: Registo }>();
  // Arquivos que já falharam (YAML ou esquema): não geram erros de integridade em cascata.
  const comErro = new Set<string>();

  for (const arquivo of arquivos) {
    const eLocal = arquivo.caminho.startsWith(PASTA_LOCAIS);
    const eEntidade = arquivo.caminho.startsWith(PASTA_ENTIDADES);
    if (!eLocal && !eEntidade) continue;
    if (!arquivo.caminho.endsWith(".yml")) {
      erros.push({ caminho: arquivo.caminho, mensagem: "extensão: os arquivos de dados usam .yml" });
      continue;
    }

    let dados: unknown;
    try {
      dados = parse(arquivo.conteudo);
    } catch (e) {
      erros.push({ caminho: arquivo.caminho, mensagem: `YAML inválido: ${(e as Error).message}` });
      comErro.add(idPeloCaminho(arquivo.caminho));
      continue;
    }

    const validar = eLocal ? validarLocal : validarEntidade;
    if (!validar(dados)) {
      for (const erro of validar.errors ?? []) {
        erros.push({ caminho: arquivo.caminho, mensagem: descreverErroEsquema(erro) });
      }
      comErro.add(idPeloCaminho(arquivo.caminho));
      continue;
    }

    const registo = dados as Registo;
    const id = idPeloCaminho(arquivo.caminho);
    if (registo.id !== id) {
      erros.push({
        caminho: arquivo.caminho,
        mensagem: `integridade: o id "${String(registo.id)}" não coincide com o nome do arquivo "${id}"`,
      });
    }
    (eLocal ? locais : entidades).set(id, { caminho: arquivo.caminho, dados: registo });
  }

  for (const [id, { caminho, dados }] of locais) {
    const entidadeId = String(dados.entidade);
    const entidade = entidades.get(entidadeId);
    if (!entidade) {
      if (comErro.has(entidadeId)) continue;
      erros.push({ caminho, mensagem: `integridade: a entidade "${entidadeId}" não existe` });
    } else if (!(entidade.dados.locais as string[]).includes(id)) {
      erros.push({
        caminho,
        mensagem: `integridade: a entidade "${entidadeId}" não lista este local em "locais"`,
      });
    }
  }

  for (const [id, { caminho, dados }] of entidades) {
    for (const localId of dados.locais as string[]) {
      const local = locais.get(localId);
      if (!local) {
        if (comErro.has(localId)) continue;
        erros.push({ caminho, mensagem: `integridade: o local "${localId}" não existe` });
      } else if (local.dados.entidade !== id) {
        erros.push({
          caminho,
          mensagem: `integridade: o local "${localId}" pertence a "${String(local.dados.entidade)}"`,
        });
      }
    }
  }

  return erros;
}
