interface ImportMetaEnv {
  /** Chave pública do Turnstile (variável `TURNSTILE_SITE_KEY` do repositório, no deploy). */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** Páginas públicas: entidades, locais e calendário lidos do D1 pelo middleware. */
    dados?: import("./lib/dados.ts").DadosPublicos;
    /** Painel: a pessoa da sessão (verificada pelo middleware antes de gerar a página). */
    eu?: {
      id: string;
      nome: string;
      perfil: "admin" | "entidade";
      entidades: string[];
    };
  }
}
