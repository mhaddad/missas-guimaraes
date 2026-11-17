/**
 * Imagem de capa da paróquia (a fotografia da igreja principal no topo da página pública).
 *
 * A fotografia escolhida é reduzida no navegador (no máximo 1600 × 1200, WebP ou JPEG; o que
 * também tira os metadados, como a localização GPS) e enviada logo para o R2
 * (`POST /api/entidades/:id/fotos`). Gravar é depois uma `alteracao` normal do campo `foto`,
 * com o resumo e o histórico de sempre.
 */
import type { Local } from "@missas/horarios";
import { api, ErroApi, h } from "./painel-comum.ts";
import {
  abrirModal,
  campo,
  valorDe,
  type Alteracao,
  type Calculo,
  type LocalComSha,
} from "./painel-modal.ts";

const LARGURA_MAXIMA = 1600;
const ALTURA_MAXIMA = 1200;
const LARGURA_MINIMA = 640;
const TAMANHO_MAXIMO = 2_000_000;

type Foto = NonNullable<Local["foto"]>;

/** A fotografia reduzida, pronta a enviar. */
async function reduzir(ficheiro: File): Promise<Blob> {
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(ficheiro, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível ler esta imagem. Use uma fotografia JPG, PNG ou WebP.");
  }
  if (imagem.width < LARGURA_MINIMA)
    throw new Error(
      `A fotografia é pequena demais (${imagem.width} px de largura; o mínimo é ${LARGURA_MINIMA} px).`,
    );
  const escala = Math.min(1, LARGURA_MAXIMA / imagem.width, ALTURA_MAXIMA / imagem.height);
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  tela.getContext("2d")?.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  const comoBlob = (tipo: string, qualidade: number) =>
    new Promise<Blob | null>((resolver) => tela.toBlob(resolver, tipo, qualidade));
  let blob = await comoBlob("image/webp", 0.82);
  // Navegadores que não geram WebP devolvem PNG: aí, JPEG.
  if (!blob || blob.type !== "image/webp") blob = await comoBlob("image/jpeg", 0.85);
  if (!blob || blob.size > TAMANHO_MAXIMO)
    throw new Error("Não foi possível preparar esta fotografia. Experimente outra.");
  return blob;
}

async function enviar(entidade: string, blob: Blob): Promise<string> {
  const { url } = await api<{ url: string }>(
    `/api/entidades/${encodeURIComponent(entidade)}/fotos`,
    { method: "POST", body: blob, headers: { "content-type": blob.type } },
  );
  return url;
}

function textoDoErroEnvio(e: unknown): string {
  if (e instanceof ErroApi && e.estado === 413) return "A fotografia é grande demais.";
  if (e instanceof ErroApi && e.estado === 415) return "Este formato de imagem não é aceite.";
  if (e instanceof ErroApi && e.estado === 429)
    return "Muitos envios seguidos. Espere um minuto e tente outra vez.";
  if (e instanceof Error && !(e instanceof ErroApi)) return e.message;
  return "Não foi possível enviar a fotografia. Tente novamente.";
}

/** Escolher ou trocar a imagem de capa (e editar a descrição e o crédito). */
export function abrirCapa(opcoes: {
  dialogo: HTMLDialogElement;
  entidade: string;
  escolhido: LocalComSha;
}): Promise<Alteracao | null> {
  const { escolhido } = opcoes;
  const { local } = escolhido;
  const atual = local.foto ?? null;

  let envio:
    | { estado: "nada" }
    | { estado: "a-enviar" }
    | { estado: "erro"; texto: string }
    | {
        estado: "pronto";
        url: string;
      } = { estado: "nada" };

  const previa = h("img", {
    alt: "",
    class: "aspect-[16/9] w-full rounded-cartao bg-slate-100 object-cover sm:max-w-md",
    hidden: !atual,
    ...(atual && { src: atual.url }),
  });
  const entrada = h("input", {
    type: "file",
    name: "ficheiro",
    accept: "image/jpeg,image/png,image/webp",
    class:
      "campo py-2.5 file:mr-3 file:rounded-cartao file:border-0 file:bg-superficie file:px-3 file:py-1.5 file:font-semibold",
  });
  const autorizacao = h(
    "label",
    {
      class:
        "grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-cartao border border-borda p-3",
      hidden: true,
    },
    h("input", { type: "checkbox", name: "autorizacao", class: "mt-1 size-5" }),
    h(
      "span",
      {},
      "Tenho autorização para publicar esta fotografia no site (é da paróquia, foi tirada por mim ou o autor autorizou).",
    ),
  );

  entrada.addEventListener("change", () => {
    const ficheiro = entrada.files?.[0];
    if (!ficheiro) return;
    envio = { estado: "a-enviar" };
    autorizacao.hidden = false;
    entrada.dispatchEvent(new Event("input", { bubbles: true }));
    void (async () => {
      try {
        const blob = await reduzir(ficheiro);
        const url = await enviar(opcoes.entidade, blob);
        previa.src = URL.createObjectURL(blob);
        previa.hidden = false;
        envio = { estado: "pronto", url };
      } catch (e) {
        envio = { estado: "erro", texto: textoDoErroEnvio(e) };
      }
      entrada.dispatchEvent(new Event("input", { bubbles: true }));
    })();
  });

  const calcular = (form: HTMLFormElement): Calculo => {
    if (envio.estado === "a-enviar")
      return { mensagem: "A preparar e a enviar a fotografia…", erro: false };
    if (envio.estado === "erro") return { mensagem: envio.texto, erro: true };
    const url = envio.estado === "pronto" ? envio.url : atual?.url;
    if (!url) return { mensagem: "Escolha uma fotografia.", erro: false };
    if (envio.estado === "pronto" && !marcado(form, "autorizacao"))
      return {
        mensagem: "Confirme que tem autorização para publicar esta fotografia.",
        erro: false,
      };
    const alt = valorDe(form, "alt").trim();
    const credito = valorDe(form, "credito").trim();
    const foto: Foto = { url, ...(alt && { alt }), ...(credito && { credito }) };
    return { escolhido, depois: { ...local, foto } };
  };

  return abrirModal({
    dialogo: opcoes.dialogo,
    titulo: atual ? "Alterar a imagem de capa" : "Escolher a imagem de capa",
    textoGravar: "Gravar",
    cabecalho: h(
      "p",
      { class: "text-texto-secundario" },
      "Aparece no topo da página da paróquia no site. Prefira uma fotografia na horizontal, com a igreja bem visível.",
    ),
    campos: [
      previa,
      campo(atual ? "Nova fotografia (opcional)" : "Fotografia", entrada, "JPG, PNG ou WebP."),
      autorizacao,
      campo(
        "Descrição da imagem (opcional)",
        h("input", {
          type: "text",
          name: "alt",
          class: "campo",
          maxlength: "300",
          value: atual?.alt ?? "",
          placeholder: `Ex.: Fachada da ${local.nome}`,
        }),
        "Para quem usa um leitor de ecrã. Sem descrição, fica o nome da igreja.",
      ),
      campo(
        "Crédito (opcional)",
        h("input", {
          type: "text",
          name: "credito",
          class: "campo",
          maxlength: "300",
          value: atual?.credito ?? "",
          placeholder: "Ex.: Paróquia, ou o nome de quem tirou a fotografia",
        }),
        "Aparece por baixo da imagem.",
      ),
    ],
    calcular,
  });
}

/** Retirar a imagem de capa (a página volta a mostrar a imagem provisória). */
export function abrirRetirarCapa(opcoes: {
  dialogo: HTMLDialogElement;
  escolhido: LocalComSha;
}): Promise<Alteracao | null> {
  const { escolhido } = opcoes;
  const { foto: _foto, ...semFoto } = escolhido.local;
  return abrirModal({
    dialogo: opcoes.dialogo,
    titulo: "Retirar a imagem de capa",
    textoGravar: "Retirar",
    cabecalho: h(
      "p",
      { class: "text-texto-secundario" },
      "A página da paróquia volta a mostrar a imagem provisória, com o nome da igreja.",
    ),
    campos: [],
    calcular: () => ({ escolhido, depois: semFoto as Local }),
  });
}

const marcado = (form: HTMLFormElement, nome: string) =>
  (form.elements.namedItem(nome) as HTMLInputElement | null)?.checked === true;
