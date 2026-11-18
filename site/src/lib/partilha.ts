/**
 * Imagem de partilha (Open Graph) da página de uma paróquia: a fotografia da primeira igreja que
 * a tiver, com a descrição da foto ou o nome da igreja. Sem nenhuma, fica a imagem geral do site.
 */
import type { Local } from "@missas/horarios";

export interface ImagemPartilha {
  url: string;
  alt: string;
}

export function imagemDePartilha(
  locais: readonly Pick<Local, "nome" | "foto">[],
): ImagemPartilha | undefined {
  const local = locais.find((l) => l.foto?.url);
  if (!local?.foto) return undefined;
  return { url: local.foto.url, alt: local.foto.alt ?? local.nome };
}
