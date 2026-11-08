# ADR-001 — Arquitetura e convenções

- **Estado:** aceite
- **Data:** 2026-11-08

## Contexto

Os horários das missas mudam pouco, mas mudam, e quem os conhece são as paróquias. É preciso um site rápido e simples para o público, um painel para as paróquias manterem os seus horários, um registo de quem mudou o quê e a possibilidade de voltar atrás. O custo de operação tem de ser próximo de zero e não pode haver servidores para manter.

## Decisão

1. **Dados em YAML no Git**, sem base de dados. Cada entidade responsável e cada local tem o seu arquivo em `dados/`, validado por JSON Schema e por regras do motor de horários.
2. **Só o GitHub Actions grava no `main`.** O painel envia um pedido ao Worker, que o valida e dispara um workflow com o pedido assinado (HMAC). O workflow volta a validar e faz um commit por pedido. Sem revisão humana: a segurança vem da validação automática, do histórico imutável (`main` sem *force-push*) e do restauro de versões.
3. **Cloudflare para tudo o que corre:** um único Worker serve o site (*static assets*), o painel, a API e os crons. Dados privados (contactos, estado dos pedidos) no Workers KV; cópias de segurança no R2; login pelo Cloudflare Access, só com Google.
4. **Astro** para o site (HTML estático, pouco JavaScript), **Tailwind** compilado no build, **Preact** só nas partes interativas.
5. **Monorepo com npm workspaces** (`pacotes/horarios`, `pacotes/dados`, `site`, `worker`). O pnpm previsto inicialmente foi trocado pelo npm porque o Node 26 já não inclui o corepack e o npm basta para o tamanho do projeto.
6. **Node 26** (LTS) e **TypeScript 6** em modo estrito. O TypeScript 7 fica para quando o `typescript-eslint` e o `astro check` o suportarem.
7. **Português no domínio:** textos em pt-PT e termos do domínio em português também no código; vocabulário técnico genérico em inglês.
8. **Dois ambientes:** homologação (contas pessoais do responsável técnico, `*.workers.dev` protegido, `noindex`) e produção (contas do Arciprestado, domínio próprio). Só o repositório passa de um para o outro; segredos e contactos são recriados.

## Consequências

- Qualquer pessoa pode ver o histórico completo dos dados; nada é apagado.
- A latência de uma alteração até ao site é de poucos minutos (workflow + deploy), não imediata. Os textos da interface dizem isso.
- O repositório é público: nada de dados pessoais, segredos nem referências à origem da importação inicial (ver `AGENTS.md`).
- Os pacotes partilhados são consumidos como TypeScript diretamente (sem passo de compilação), porque todos os consumidores (Vite, Wrangler, tsx, Vitest) o suportam.
