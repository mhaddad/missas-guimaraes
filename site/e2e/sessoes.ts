/**
 * Sessões de teste (só na base local dos e2e, criada por `scripts/semear-e2e.ts`). Valores fixos
 * e públicos: não dão acesso a nada fora dos testes.
 */
export const SESSOES = {
  admin: "e2e-admin-0000000000000000000000000000000000".slice(0, 43),
  entidade: "e2e-entidade-000000000000000000000000000000".slice(0, 43),
} as const;
