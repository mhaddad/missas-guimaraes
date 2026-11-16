# ADR-005 — Dados, login e deploy só na Cloudflare

- **Estado:** proposto (a aprovar pelo Matheus)
- **Data:** 2026-11-16
- **Substitui:** ADR-004 (gravação no GitHub) e parte do ADR-003 (Cloudflare Access)

## Contexto

O E4 e o E5 puseram o painel a gravar com o GitHub como base de dados: o Worker assina um pedido, o GitHub Actions valida e faz um commit no `main`, e um novo deploy publica o site. Funciona, mas a experiência na homologação mostrou o custo:

- **Demora.** Cada alteração leva 2 a 4 minutos a aparecer no site.
- **Dependência do GitHub Actions.** A 11/11, uma indisponibilidade do GitHub deixou o painel sem gravar durante a noite.
- **Muita configuração.** Duas GitHub Apps com chaves privadas, dois segredos HMAC partilhados entre o Worker e o GitHub, um ambiente `gravacao`, um *ruleset* com exceção, duas aplicações do Cloudflare Access, um token de serviço, o AUD, e duas listas de e-mails a manter à mão: a política do Access e os utilizadores de teste do Google.

O Matheus quer o GitHub **só como repositório de código** e o resto na Cloudflare. Quer também dar acesso ao painel apenas registando o e-mail Gmail da pessoa no ecrã *Acessos*: administrador geral, ou contacto de uma ou mais paróquias.

## Decisão

### 1. Dados no Cloudflare D1

O D1 (SQLite) passa a ser a única fonte dos horários, das entidades, dos contactos, das sessões, do histórico e dos relatos. O plano gratuito chega com folga: 5 milhões de linhas lidas e 100 mil escritas por dia, 500 MB por base e *Time Travel* de 7 dias.

Os locais e as entidades ficam guardados como **documento JSON com o esquema atual** (`dados/schema/*.schema.json`). Assim, o motor, os validadores pré-compilados, o `diff`, o `resumirPedido` e os alertas de anomalia mantêm-se sem mudanças.

| Tabela | Conteúdo |
|---|---|
| `entidades` | `id`, `dados` (JSON), `versao`, `atualizado_em` |
| `locais` | `id`, `entidade_id`, `dados` (JSON), `versao`, `atualizado_em`, `atualizado_por` |
| `versoes` | Só cresce, nunca se apaga: `id`, `tipo` (`local`/`entidade`), `registo_id`, `versao`, `dados`, `acao` (`importacao`, `confirmacao`, `alteracao`, `novo-local`, `restauro`), `resumo` (linhas do motor), `contacto_id`, `criado_em` |
| `contactos` | `id` opaco, `nome`, `email` (único, minúsculas), `funcao`, `perfil` (`admin`/`entidade`), `estado`, `consentimento` (JSON), datas |
| `contacto_entidades` | `contacto_id`, `entidade_id` |
| `sessoes` | `id` (*hash* SHA-256 do valor do cookie), `contacto_id`, `criada_em`, `expira_em` |
| `auditoria` | Ações dos administradores sobre contactos (2 anos) |
| `relatos` | Relatos do público (§6.7), sem IP |
| `config` | `versao_dados`, um contador que muda a cada gravação e serve para a cache do site |

**Gravação.** Cada gravação é uma única transação (`batch` do D1):

1. `UPDATE locais … WHERE id = ? AND versao = ?`. Se nenhuma linha mudar, alguém gravou entretanto: é **conflito**, como hoje com o SHA.
2. `INSERT` em `versoes`.
3. Incremento de `config.versao_dados`.

As guardas de âmbito e de campos do `aplicar.ts` (ADR-004) mantêm-se: a confirmação só mexe em `confirmado_*`, uma alteração só nos campos permitidos, o restauro é só para `admin` e tem de ser igual a uma versão guardada. O mesmo para a validação completa. Tudo isto corre no Worker antes do `batch`.

**Histórico e restauro.** Passam a vir da tabela `versoes`, com data, quem gravou, resumo e o *diff* entre versões. Restaurar é gravar de novo os `dados` de uma versão anterior, como uma versão nova: nada se apaga. O *Time Travel* do D1 (7 dias) cobre erros que estraguem várias tabelas de uma vez.

### 2. Login Google feito pelo Worker, sem Cloudflare Access

- **Fluxo:** OAuth 2.0 / OpenID Connect com o Google, *authorization code* com PKCE, `state` e `nonce`, e os *scopes* `openid email`.
- **Token:** o Worker troca o código, verifica o *ID token* (RS256 com as chaves do Google, `iss`, `aud` = o nosso *client id*, `exp`, `nonce`, `email_verified = true`) e procura o e-mail em `contactos`. Reaproveita a verificação de JWT do `identidade.ts`, que já cobre RS256, a cache das chaves e a rotação.
- **Quem entra:** só quem estiver registado no ecrã *Acessos* e ativo. Os outros veem a página "sem acesso". **Não há nenhuma lista de e-mails fora do painel.**
- **Sessão:**
  - Cookie `__Host-sessao`, `HttpOnly`, `Secure`, `SameSite=Lax`, com 32 bytes aleatórios e 14 dias de validade.
  - No D1 guarda-se só o *hash* do cookie. Por isso não há chave de assinatura a configurar.
  - *Sair* apaga a sessão.
  - Suspender ou remover um contacto termina-lhe as sessões.
- **CSRF:** as escritas continuam a exigir a mesma origem e `application/json`.
- **Limite de tentativas:** o *rate limit* do Worker, que já existe para os relatos.
- **Configuração única no Google Cloud:**
  - usa-se o cliente OAuth atual, com o endereço de retorno `https://<domínio>/auth/retorno`;
  - publica-se o ecrã de consentimento, que deixa de estar "em teste". Com só `openid email`, *scopes* não sensíveis, o Google não exige verificação, e deixa de haver lista de utilizadores de teste.

### 3. Site gerado pelo Worker a partir do D1

O Astro passa a correr no Worker (adaptador `@astrojs/cloudflare`, modo *server*):

- As páginas públicas são geradas a cada pedido a partir do D1, com o HTML completo como hoje: funcionam sem JavaScript, com JSON-LD e nos três idiomas.
- O painel continua estático.
- As páginas públicas ficam na **cache** da Cloudflare com a chave `idioma + data de Lisboa + versao_dados`. Depois de uma gravação, a página seguinte já sai atualizada, sem esperar por um deploy. Sem gravações, gera-se no máximo uma página por idioma e por dia.
- A API (`/api/*`, `/relato`, `/auth/*`) e os *crons* do E6 ficam no ponto de entrada do Worker, que delega as páginas no Astro.

**Risco: tempo de CPU.** O plano gratuito dos Workers dá 10 ms de CPU por pedido, e gerar a página com 80 locais pode passar disso quando não está em cache. Mede-se no passo 5 (§Migração).

- Se passar, a primeira opção é pré-calcular no momento da gravação o que a página precisa (próximas celebrações e textos dos horários) e guardá-lo no D1.
- A segunda é o plano pago dos Workers (5 US$/mês), com 30 s de CPU. Esta mudança é só de faturação, sem configuração.

### 4. Deploy pela Cloudflare (Workers Builds)

O repositório liga-se ao Worker no painel da Cloudflare, uma vez. Cada merge no `main` faz o build e o deploy na própria Cloudflare. **Não há tokens da Cloudflare no GitHub.** O GitHub Actions fica só com os testes (`validar`, `site`), sem segredos nem ambientes.

### 5. Configuração que fica e configuração que sai

| Fica | Sai |
|---|---|
| Worker, D1 e *rate limit*, declarados no `wrangler.jsonc` | GitHub Apps `missas-guimaraes-painel` e `missas-guimaraes-bot` |
| Segredo `GOOGLE_CLIENT_SECRET` (novo) | `PEDIDO_HMAC`, `AVISO_HMAC`, `BOT_APP_*`, `GITHUB_PAINEL_APP_*` |
| Segredo `TURNSTILE_SECRET` (já existe) | Ambiente `gravacao`, `CLOUDFLARE_API_TOKEN` no GitHub |
| Variáveis públicas: `GOOGLE_CLIENT_ID`, chave do Turnstile | Aplicações do Access, token de serviço, `ACCESS_*`, lista de e-mails no Zero Trust |
| Cliente OAuth no Google Cloud (publicado) | Utilizadores de teste no Google |
| *Ruleset* simples do `main` (PR com testes verdes) | Exceção do bot no *ruleset*; workflows `aplicar-pedido` e `deploy` |

O envio de e-mails (E6) acrescentará uma chave do fornecedor. Não há como evitá-la.

### 6. O que se mantém do trabalho feito

O motor (`pacotes/horarios`) e os seus testes; a validação e o esquema (`pacotes/dados`); o formato canónico (para a exportação); `aplicar.ts` (guardas, resumo, alertas), que passa a receber o estado do D1 em vez dos arquivos; os ecrãs do painel (P1 a P4, histórico, Acessos); e o site, que muda só de onde lê os dados.

Sai `github.ts`, `pedido.ts` (formato assinado e HMAC), `scripts/aplicar-pedido.ts`, `scripts/enviar-pedido.ts`, `scripts/avisar-publicacao.ts`, o `identidade.ts` do Access (a verificação de JWT passa para o login Google) e os workflows de gravação. Os pedidos deixam de ter os estados `A_GRAVAR → GRAVADO → PUBLICADO`: a gravação passa a ser imediata e o painel mostra *Gravado. Já está no site.*

### 7. Dados abertos e cópias

Os dados públicos dos horários continuam acessíveis em `/dados/horarios.json`, gerado a partir do D1.

A cópia de segurança é feita pela tabela `versoes` (histórico completo), pelo *Time Travel* do D1 (7 dias) e por uma exportação semanal (`wrangler d1 export`), feita à mão por um administrador enquanto não houver R2 (E7.5).

**Os dados deixam de estar no repositório.** O histórico do Git até agora fica como arquivo.

## Migração (PRs pequenos, sem parar a homologação)

1. **Este ADR.** O Matheus revê e aprova.
2. **D1 e importação.**
   - Criar a base (`wrangler d1 create`) e as tabelas (migrações em `worker/migracoes/`).
   - Correr `scripts/importar-d1.ts`, que lê os YAML do `main` e cria as entidades, os locais e uma versão `importacao` de cada um. Os contactos são migrados do KV.
   - Nos testes, um adaptador com `node:sqlite` (Node 26) faz de D1.
3. **Login Google no Worker** (`/auth/entrar`, `/auth/retorno`, `/auth/sair`) e contactos no D1. No fim, desliga-se o Access.
4. **Painel a gravar no D1:** P1 a P4, histórico e restauro, mais o *diff* entre versões (E5.7).
5. **Site a ler do D1** (Astro no Worker, cache por `versao_dados`).
   - Medir o CPU com os 80 locais.
   - Confirmar o Lighthouse e o axe.
   - Correr os 64 e2e contra o D1 local.
6. **Workers Builds e limpeza.**
   - Remover o código, os workflows, as Apps, os segredos e as aplicações do Access que saem.
   - Tirar os YAML de `dados/` (fica o esquema).
   - Atualizar o AGENTS.md e o PLANO.

Até ao passo 4 estar validado, o sistema atual continua a gravar no GitHub. A importação do passo 2 repete-se no momento da troca, para não perder o que a Oliveira gravar entretanto.

## Consequências

- As alterações aparecem no site **em segundos**, e o painel deixa de depender do GitHub para gravar.
- Dar acesso a alguém passa a ser **só registar o e-mail no painel**.
- A configuração fica reduzida a **dois segredos** e a um cliente OAuth.
- **Perde-se:**
  - o Git como registo de auditoria público: a auditoria passa a ser a tabela `versoes`, só visível no painel;
  - a edição dos dados por PR: passa a ser só pelo painel, ou por um script de administração.
- **A segurança do histórico deixa de depender do *ruleset* do GitHub** e passa a assentar no D1. Por isso nenhuma rota pode apagar ou reescrever linhas de `versoes`, e isso é testado.
- **Risco de CPU no plano gratuito** na geração das páginas públicas, com as mitigações de §3.
- O AGENTS.md, o PLANO (D18, D21, D22, D28, §8, §9) e o ADR-003/004 serão atualizados no passo 6.
