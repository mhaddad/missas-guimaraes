/**
 * Cabeçalhos de segurança em todas as respostas do Worker (páginas, API, imagens, ficheiros).
 *
 * CSP: nenhum script embutido nas páginas (o JavaScript vem todo de `/_astro/`, e os blocos
 * `application/json` e `ld+json` não correm), por isso `script-src` fica restrito à própria origem
 * e ao Turnstile dos relatos. Os estilos embutidos (`style=` e o `<style>` dentro de `<noscript>`)
 * pedem `'unsafe-inline'` em `style-src`, o que não permite correr código. `frame-ancestors`
 * e `X-Frame-Options` impedem que o site (e o painel) seja metido num `<iframe>` de outro sítio.
 *
 * Um cabeçalho que a resposta já traga (ex.: a CSP própria das imagens em `/fotos/`) mantém-se.
 */

const TURNSTILE = "https://challenges.cloudflare.com";

export const POLITICA_CONTEUDO = [
  "default-src 'self'",
  `script-src 'self' ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: para a pré-visualização da imagem de capa no painel.
  "img-src 'self' data: blob:",
  // data: para os subconjuntos pequenos da fonte, que o Vite embute no CSS.
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${TURNSTILE}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const CABECALHOS_SEGURANCA: Readonly<Record<string, string>> = {
  "content-security-policy": POLITICA_CONTEUDO,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

/** Dois anos; sem `preload` (é um compromisso para o domínio, a decidir em produção). */
const HSTS = "max-age=63072000; includeSubDomains";

export function comCabecalhosDeSeguranca(resposta: Response, url: URL): Response {
  const nova = new Response(resposta.body, resposta);
  const definir = (nome: string, valor: string) => {
    if (!nova.headers.has(nome)) nova.headers.set(nome, valor);
  };
  for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) definir(nome, valor);
  // Só em https: num http (desenvolvimento local) o navegador ignora-o.
  if (url.protocol === "https:") definir("strict-transport-security", HSTS);
  return nova;
}
