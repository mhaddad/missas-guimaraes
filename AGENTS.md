# AGENTS.md — regras para quem programa neste repositório (pessoas e IA)

**Horários de Missas e Celebrações — Arciprestado de Guimarães e Vizela.** Site de uma só página com os horários das igrejas dos concelhos de Guimarães e Vizela, e um painel onde as paróquias mantêm os seus horários. Os dados estão no **Cloudflare D1**; este repositório tem só o código (ADR-005).

## Arquitetura em poucas linhas

- **Um só Cloudflare Worker** serve tudo. O Astro (`site/`, modo *server*) gera todas as páginas a partir do D1; as páginas públicas ficam numa cache por idioma, dia de Lisboa e versão dos dados. A API, o login e os relatos estão em `worker/` (biblioteca `@missas/worker`), chamados por `site/src/worker.ts`.
- **Dados:** D1 (`worker/migracoes/`). Entidades e locais guardam-se como documento JSON no esquema de `dados/schema/*.schema.json`. Cada gravação fica em `gravacoes` + `versoes`, que só crescem (*triggers* recusam `UPDATE` e `DELETE`): é o histórico e o restauro.
- **Imagens de capa:** enviadas pelo painel para o **R2** (`FOTOS`, `worker/src/fotos.ts`), com o SHA-256 do conteúdo como nome, e servidas em `/fotos/`. Pôr uma imagem na página é uma gravação normal do campo `foto` (só aceita caminhos `/fotos/…`).
- **Login:** Google, feito pelo próprio Worker (OAuth com PKCE). Só entra quem estiver registado e ativo no ecrã *Acessos*. Sessões no D1 (só o *hash* do cookie).
- **Gravação:** imediata. O Worker aplica as guardas e a validação (`pacotes/dados/src/gravacao.ts`) e grava numa transação, com controlo de versões (conflito → 409).
- **Motor de horários** (`pacotes/horarios`): expande regras e exceções em celebrações concretas. Corre no navegador e no Worker, sempre com o mesmo código.
- **Deploy:** Cloudflare Workers Builds a cada merge no `main`. O GitHub Actions só corre testes, sem segredos.

## Comandos

| Comando | O quê |
|---|---|
| `npm ci` | Instala tudo (npm workspaces; Node 26, ver `.nvmrc`) |
| `npm run dev` | Site em modo de desenvolvimento |
| `npm run verificar` | Formatação, lint, tipos, testes e validação dos dados: **tem de passar antes de cada PR** |
| `npm test` | Testes (Vitest) |
| `npm run validar` | Valida os YAML de `dados/` (fonte da importação inicial para o D1) |
| `npm run importar:d1 -- --local` | Importa os YAML para o D1 local (`--remote` só na migração; ver o script) |
| `npm run e2e` | Testes no navegador contra o `wrangler dev` com um D1 local e dados fixos |
| `npm run build` | Gera o site em `site/dist` |
| `npm run formatar:dados` | Reescreve os YAML de `dados/` no formato canónico |
| `npm run gerar:tipos` / `npm run gerar:validadores` | Depois de mudar `dados/schema/`: tipos TypeScript e validadores pré-compilados |

## Convenções

- **Língua:** textos visíveis em **português europeu** (pt-PT: "ecrã", "telemóvel", "registadas"), com versões em inglês e espanhol no site. Termos do domínio em português também no código (`local`, `entidade`, `horarios`, `excecoes`, `confirmado_em`); vocabulário técnico genérico pode ficar em inglês.
- **Hora:** sempre **Europe/Lisbon**. Nunca "GMT+0" fixo: no verão é GMT+1.
- **Dados:** o nome do arquivo é o `id`; um local pertence a uma entidade e a entidade lista o local (nos dois sentidos). Os YAML seguem o formato canónico do projeto (serializador em `pacotes/dados`, `npm run formatar:dados`); não os reformatar com outras ferramentas.
- **Esquema:** `dados/schema/*.schema.json` é a única fonte de verdade; os arquivos `*.gerado.*` não se editam à mão (ADR-002).
- **Testes primeiro** no motor e na gravação: os casos de referência são o contrato. Não se altera um teste existente para o fazer passar.
- **Um PR por tarefa**, pequeno, com a CI verde.

## O que nunca fazer

1. **Nunca citar a origem da importação inicial dos dados** (nome do site, URLs, identificadores numéricos da fonte), nem em dados, nem em código, nem em commits. Os dados públicos não têm proveniência.
2. **Nunca acrescentar dados pessoais** ao repositório: e-mails, nomes ou telefones de contactos do painel. Os contactos vivem no D1. O histórico identifica pessoas só por um id opaco (`c_7f3a`).
3. **Nunca pôr segredos** no código, nos testes ou nos workflows. Há só dois, ambos segredos do Worker (*Type: Secret*): `GOOGLE_CLIENT_SECRET` e `TURNSTILE_SECRET`.
4. **Nunca inventar afirmações institucionais nem integrações.** Este projeto é uma aplicação do Arciprestado de Guimarães e Vizela; **não é uma plataforma oficial da Arquidiocese de Braga** e não está ligado à Cúria, a agendas diocesanas nem a outros sistemas. Ficam fora textos como "Plataforma Eclesiástica Oficial", "Sincronização Curial", "Gestão canónica", "Conforme com as normas canónicas", "Comunidade notificada em tempo real". Sobre a publicação, dizer só o que é verdade: uma gravação aparece no site logo a seguir (ADR-005), mas ninguém é notificado. Na dúvida, texto simples e factual.
5. **Nunca usar o dourado `#B09247` nem o celeste `#6EB1E4` em texto** (contraste insuficiente). Texto dourado: `dourado-texto` (`#735B28`); texto azul: `azul-texto` (`#006493`). Tokens em `site/src/styles/tokens.css`.
6. **Nunca escrever SQL que altere ou apague `gravacoes` ou `versoes`.** O histórico só cresce; a única exceção é a substituição completa na migração (`importar-d1.ts --substituir`).

## Segurança — revisão obrigatória

Mudanças em qualquer um destes pontos pedem leitura humana linha a linha e uma revisão de segurança independente antes do *merge*:
login e sessões (`worker/src/google.ts`, `worker/src/sessao.ts`, `site/src/middleware.ts`); âmbito por perfil e API (`worker/src/contactos.ts`, `worker/src/api/painel.ts`, `worker/src/visao-geral.ts`, `worker/src/relatos-painel.ts`, rotas do painel em `site/src/middleware.ts`); envio e entrega de imagens (`worker/src/fotos.ts`); gravação e histórico (`pacotes/dados/src/gravacao.ts`, `worker/src/bd.ts`, `worker/migracoes/`); ADR-005; tokens de confirmação por e-mail (E6).

## Ambientes

- **Homologação** (atual): `*.workers.dev`, com `noindex`; a parte pública abre sem login, o painel pede login Google; e-mails só para uma lista fixa de destinatários.
- **Produção**: no domínio próprio, depois da validação.

Decisões de arquitetura: `docs/decisoes/`.
