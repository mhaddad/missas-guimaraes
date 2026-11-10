interface ImportMetaEnv {
  /** Chave pública do Turnstile (variável `TURNSTILE_SITE_KEY` do repositório, no deploy). */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
