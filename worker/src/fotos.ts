/**
 * Imagens de capa das paróquias, guardadas no R2. REVISÃO DE SEGURANÇA OBRIGATÓRIA.
 *
 *   POST /api/entidades/:id/fotos     (API do painel, `api/painel.ts`) o corpo é a imagem, já
 *                                     reduzida no navegador; devolve o caminho público
 *   GET  /fotos/<sha-256>.<webp|jpg>  (público) a imagem, com cache longa
 *
 * O nome do arquivo é o SHA-256 do conteúdo: não se adivinha, não se sobrepõe e nunca muda (por
 * isso a cache pode ser "immutable"). Só WebP e JPEG, confirmados pelos primeiros bytes; o tipo
 * servido vem da extensão, nunca do que o navegador declarou. Pôr a imagem na página é uma
 * gravação normal (`alteracao` do campo `foto`), com as guardas e o histórico de sempre.
 */

export interface EnvFotos {
  FOTOS?: R2Bucket;
}

export const TAMANHO_MAXIMO_FOTO = 2_000_000;

type Extensao = "webp" | "jpg";
const TIPOS_ACEITES: Record<string, Extensao> = { "image/webp": "webp", "image/jpeg": "jpg" };
const TIPO_DA_EXTENSAO: Record<Extensao, string> = { webp: "image/webp", jpg: "image/jpeg" };
const PADRAO_CAMINHO = /^\/fotos\/([0-9a-f]{64})\.(webp|jpg)$/;

/** O tipo declarado num `content-type` de envio de imagem (`null` se não for aceite). */
export function extensaoDoTipo(contentType: string | null): Extensao | null {
  const tipo = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return TIPOS_ACEITES[tipo] ?? null;
}

/** O formato pelos primeiros bytes: JPEG (`FF D8 FF`) ou WebP (`RIFF····WEBP`). */
export function formatoDaImagem(bytes: Uint8Array): Extensao | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpg";
  const ascii = (de: number, ate: number) => String.fromCharCode(...bytes.subarray(de, ate));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** Lê e confere o corpo de um envio: a imagem e a extensão, ou o código do erro. */
export async function lerFotoEnviada(
  pedido: Request,
): Promise<{ bytes: Uint8Array; extensao: Extensao } | "tipo" | "tamanho" | "corpo"> {
  const extensao = extensaoDoTipo(pedido.headers.get("content-type"));
  if (!extensao) return "tipo";
  const declarado = Number(pedido.headers.get("content-length") ?? "0");
  if (declarado > TAMANHO_MAXIMO_FOTO) return "tamanho";
  const bytes = new Uint8Array(await pedido.arrayBuffer());
  if (bytes.length > TAMANHO_MAXIMO_FOTO) return "tamanho";
  if (bytes.length === 0) return "corpo";
  if (formatoDaImagem(bytes) !== extensao) return "tipo";
  return { bytes, extensao };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...resumo].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Guarda a imagem (se ainda não existir) e devolve o caminho público. */
export async function guardarFoto(
  bucket: R2Bucket,
  foto: { bytes: Uint8Array; extensao: Extensao },
  origem: { entidade: string; contacto: string; agora: Date },
): Promise<string> {
  const chave = `${await sha256(foto.bytes)}.${foto.extensao}`;
  if (!(await bucket.head(chave)))
    await bucket.put(chave, foto.bytes, {
      httpMetadata: { contentType: TIPO_DA_EXTENSAO[foto.extensao] },
      // Só ids: a entidade e o id opaco do contacto (nunca nome nem e-mail).
      customMetadata: {
        entidade: origem.entidade,
        contacto: origem.contacto,
        enviada_em: origem.agora.toISOString(),
      },
    });
  return `/fotos/${chave}`;
}

/** `GET /fotos/<sha-256>.<ext>`: a imagem do R2, pública e com cache longa. */
export async function servirFoto(pedido: Request, env: EnvFotos): Promise<Response> {
  const { pathname } = new URL(pedido.url);
  const m = PADRAO_CAMINHO.exec(pathname);
  if (!m) return new Response("Não encontrado", { status: 404 });
  if (pedido.method !== "GET" && pedido.method !== "HEAD")
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  if (!env.FOTOS) return new Response("Indisponível", { status: 503 });
  const extensao = m[2] as Extensao;
  const chave = `${m[1]}.${extensao}`;
  const objeto =
    pedido.method === "HEAD" ? await env.FOTOS.head(chave) : await env.FOTOS.get(chave);
  if (!objeto) return new Response("Não encontrado", { status: 404 });
  const corpo = pedido.method === "HEAD" ? null : (objeto as R2ObjectBody).body;
  return new Response(corpo, {
    headers: {
      "content-type": TIPO_DA_EXTENSAO[extensao],
      "cache-control": "public, max-age=31536000, immutable",
      etag: objeto.httpEtag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
