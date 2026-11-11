/** Só nos testes (Vite/Vitest): o conteúdo de um arquivo como texto. */
declare module "*?raw" {
  const conteudo: string;
  export default conteudo;
}
