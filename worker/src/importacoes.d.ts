/** Só nos testes (Vite/Vitest): o conteúdo de um arquivo como texto. */
declare module "*?raw" {
  const conteudo: string;
  export default conteudo;
}

/** `site/src/worker.ts` corre no Vite (Astro): `import.meta.env.DEV` só no `astro dev`. */
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
