/** Utilitários só para testes do Worker: Google falso (ID tokens) e contactos com sessão. */
import MIGRACAO from "../migracoes/0001_inicial.sql?raw";
import { gravar } from "./bd.ts";
import { gravarContacto, type Contacto } from "./contactos.ts";
import type { ObterChaves } from "./google.ts";
import { base64Url, COOKIE_SESSAO, criarSessao } from "./sessao.ts";
import { D1Memoria } from "./teste-d1.ts";

export { D1Memoria };

export function novaBase(): D1Memoria {
  return new D1Memoria([MIGRACAO]);
}

const texto = (s: string) => base64Url(new TextEncoder().encode(s));

/** Um Google falso: chave RSA própria e emissão de ID tokens assinados. */
export async function criarGoogleFalso(clientId: string) {
  const par = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publica = (await crypto.subtle.exportKey("jwk", par.publicKey)) as { n: string; e: string };
  const obterChaves: ObterChaves = async () => [
    { kid: "g1", kty: "RSA", n: publica.n, e: publica.e },
  ];
  async function idToken(
    carga: Record<string, unknown>,
    opcoes: { alg?: string; kid?: string; chave?: CryptoKey } = {},
  ): Promise<string> {
    const c = texto(JSON.stringify({ alg: opcoes.alg ?? "RS256", kid: opcoes.kid ?? "g1" }));
    const p = texto(JSON.stringify(carga));
    const assinatura = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      opcoes.chave ?? par.privateKey,
      new TextEncoder().encode(`${c}.${p}`),
    );
    return `${c}.${p}.${base64Url(new Uint8Array(assinatura))}`;
  }
  const cargaValida = (email: string, nonce: string, agora: Date) => {
    const s = Math.floor(agora.getTime() / 1000);
    return {
      iss: "https://accounts.google.com",
      aud: clientId,
      email,
      email_verified: true,
      nonce,
      iat: s - 5,
      exp: s + 3600,
    };
  };
  return { obterChaves, idToken, cargaValida };
}

export function contacto(id: string, email: string, extra: Partial<Contacto> = {}): Contacto {
  return {
    id,
    nome: `Pessoa ${id}`,
    email,
    funcao: "secretaria",
    perfil: "entidade",
    entidades: ["nespereira"],
    estado: "ativo",
    consentimento: { em: "2026-11-01", versao: "v1", meio: "papel" },
    criado_em: "2026-11-01T00:00:00.000Z",
    atualizado_em: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

/** Regista o contacto e devolve o cabeçalho `Cookie` de uma sessão aberta. */
export async function comSessao(bd: D1Database, c: Contacto, agora = new Date()): Promise<string> {
  await gravarContacto(bd, c, null);
  return `${COOKIE_SESSAO}=${await criarSessao(bd, c.id, agora)}`;
}

/** Importa uma entidade e os seus locais (gravação "importacao"). */
export async function importar(
  bd: D1Database,
  entidade: { id: string; locais: string[] } & Record<string, unknown>,
  locais: ({ id: string } & Record<string, unknown>)[],
): Promise<void> {
  await gravar(bd, {
    entidadeId: entidade.id,
    acao: "importacao",
    contactoId: null,
    canal: null,
    resumo: [],
    alertas: [],
    entidade: { dados: entidade as never, versaoAnterior: null },
    locais: locais.map((l) => ({ dados: l as never, versaoAnterior: null })),
  });
}
