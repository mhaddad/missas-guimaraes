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
    /** Página de uma paróquia: a entidade, os seus locais publicados e o calendário. */
    paroquia?: {
      entidade: import("@missas/horarios").Entidade;
      locais: import("@missas/horarios").Local[];
      calendario: import("@missas/horarios").Calendario;
    };
    /** Fragmento do detalhe de uma igreja: só esse local e a sua entidade. */
    igreja?: {
      local: import("@missas/horarios").Local;
      entidade: import("@missas/horarios").Entidade;
    };
    /** Painel, *Visão geral* (só administradores). */
    visaoGeral?: import("@missas/worker").VisaoGeral;
    /** Painel, lista das paróquias (já filtrada pelo âmbito da pessoa). */
    paroquiasPainel?: import("@missas/worker").ParoquiaPainel[];
    /** Painel, página de uma entidade (o âmbito já foi verificado). */
    entidadePainel?: { id: string; nome: string };
    /** Painel: a pessoa da sessão (verificada pelo middleware antes de gerar a página). */
    eu?: {
      id: string;
      nome: string;
      perfil: "admin" | "entidade";
      entidades: string[];
    };
  }
}
