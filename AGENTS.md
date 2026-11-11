# AGENTS.md — regras para quem programa neste repositório (pessoas e IA)

**Horários de Missas e Celebrações — Arciprestado de Guimarães e Vizela.** Site de uma só página com os horários das igrejas dos concelhos de Guimarães e Vizela, e um painel onde as paróquias mantêm os seus horários. Os dados são arquivos YAML neste repositório; não há base de dados.

## Arquitetura em poucas linhas

- **Site e painel:** Astro (`site/`), servidos como *static assets* por um único Cloudflare Worker (`worker/`), que também tem a API e os crons.
- **Dados:** `dados/entidades/<id>.yml` (paróquias e outras entidades responsáveis) e `dados/locais/<id>.yml` (igrejas e capelas, com as regras de horário), validados por `dados/schema/*.schema.json`.
- **Escrita:** o painel nunca escreve no repositório. O Worker valida e dispara um workflow assinado; **só o GitHub Actions grava no `main`**, com um commit por pedido. O histórico do Git é a auditoria e o mecanismo de restauro.
- **Motor de horários** (`pacotes/horarios`): expande regras e exceções em celebrações concretas. Corre no navegador, no Worker e no GitHub Actions, sempre com o mesmo código.
- **Validação** (`pacotes/dados`, `scripts/validar.ts`): a mesma no painel, no Worker e na CI.

## Comandos

| Comando | O quê |
|---|---|
| `npm ci` | Instala tudo (npm workspaces; Node 26, ver `.nvmrc`) |
| `npm run dev` | Site em modo de desenvolvimento |
| `npm run verificar` | Formatação, lint, tipos, testes e validação dos dados: **tem de passar antes de cada PR** |
| `npm test` | Testes (Vitest) |
| `npm run validar` | Valida todos os YAML de `dados/` |
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
2. **Nunca acrescentar dados pessoais** ao repositório: e-mails, nomes ou telefones de contactos do painel. Os contactos vivem no Workers KV. Os commits identificam pessoas só por um id opaco (`c_7f3a`).
3. **Nunca pôr segredos** no código, nos testes ou nos workflows (chaves, tokens, HMAC). Usam-se segredos do Worker e do ambiente `gravacao` do GitHub Actions.
4. **Nunca inventar afirmações institucionais nem integrações.** Este projeto é uma aplicação do Arciprestado de Guimarães e Vizela; **não é uma plataforma oficial da Arquidiocese de Braga** e não está ligado à Cúria, a agendas diocesanas nem a outros sistemas. Ficam fora textos como "Plataforma Eclesiástica Oficial", "Sincronização Curial", "Gestão canónica", "Conforme com as normas canónicas", "Comunidade notificada em tempo real", "refletidas imediatamente" (o correto é "em poucos minutos"). Na dúvida, texto simples e factual.
5. **Nunca usar o dourado `#B09247` nem o celeste `#6EB1E4` em texto** (contraste insuficiente). Texto dourado: `dourado-texto` (`#735B28`); texto azul: `azul-texto` (`#006493`). Tokens em `site/src/styles/tokens.css`.
6. **Nunca gravar diretamente no `main`** fora do GitHub Actions (a partir do E4 há um *ruleset* que o impede).

## Segurança — revisão obrigatória

Mudanças em qualquer um destes pontos pedem leitura humana linha a linha e uma revisão de segurança independente antes do *merge*:
verificação do JWT do Cloudflare Access e âmbito por perfil (`admin` / `entidade`) (`worker/src/identidade.ts`, `worker/src/contactos.ts`, `worker/src/api/painel.ts`, ADR-003); assinatura HMAC e formato dos pedidos e guardas de âmbito (`pacotes/dados/src/pedido.ts`, `pacotes/dados/src/aplicar.ts`, `worker/src/pedidos.ts`, ADR-004); `scripts/aplicar-pedido.ts` e `.github/workflows/aplicar-pedido.yml`; permissões das GitHub Apps e workflows; tokens de confirmação por e-mail.

## Ambientes

- **Homologação** (atual): `*.workers.dev`, todo protegido pelo Cloudflare Access, com `noindex`; e-mails só para uma lista fixa de destinatários.
- **Produção**: no domínio próprio, depois da validação.

Decisões de arquitetura: `docs/decisoes/`.
