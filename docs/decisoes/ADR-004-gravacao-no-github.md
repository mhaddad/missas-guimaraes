# ADR-004 — Gravação no GitHub: pedidos assinados e `aplicar-pedido`

- **Estado:** aceite (E4, partes 1 e 2)
- **Data:** 2026-11-11

## Contexto

Só o GitHub Actions grava no `main` (§8.1). O painel e o Worker não têm permissão de escrita. Montam um pedido, validam-no e disparam o `aplicar-pedido.yml`, que volta a validar tudo antes do commit. O repositório é público, por isso o pedido não pode trazer dados pessoais, e o workflow não pode confiar em quem o dispara.

## Decisão

1. **Formato do pedido** (`pacotes/dados/src/pedido.ts`). É o do Anexo B, lido de forma estrita: campos desconhecidos, ids, instantes e SHA fora do padrão são recusados.
   - Os caminhos só podem ser `dados/locais/<id>.yml` ou `dados/entidades/<id>.yml`. Uma expressão regular fechada exclui `..`, subpastas e outras extensões.
   - O contacto vai só como id opaco e função.
   - O id é `p_` seguido de 16 hexadecimais aleatórios.
2. **Assinatura.** É `HMAC-SHA256(PEDIDO_HMAC, pedido_em_base64)` em hexadecimal, calculada sobre o texto exato do input, antes de qualquer interpretação.
   - A verificação usa o `verify` do WebCrypto, que compara em tempo constante.
   - Segredos com menos de 32 caracteres são recusados.
   - O mesmo código corre no Worker e no Node.
3. **Prazo e idempotência.** O pedido e a assinatura aparecem no log público do workflow; isso é aceitável porque não têm dados pessoais e só valem uma vez dentro do prazo.
   - Um pedido vale 15 minutos depois de `emitido_em`, com 1 minuto de folga para relógios adiantados.
   - O id fica no commit como *trailer* `Pedido:`. Um pedido que já esteja no `main` devolve `GRAVADO` com o commit existente e não cria outro. A verificação repete-se em cada tentativa, para o caso de duas execuções do mesmo pedido em simultâneo.
4. **Aplicação sem Git** (`pacotes/dados/src/aplicar.ts`). `prepararPedido` recebe todos os arquivos de `dados/` e devolve os arquivos a escrever e a mensagem do commit, ou `CONFLITO`/`ERRO`. As guardas de §8.3 aplicam-se por tipo:
   - `alteracao`: só locais da entidade e só `horarios`, `excecoes`, `notas`, `notas_i18n` e `dias_santos`. `confirmado_em` e `confirmado_por` não podem ser escritos pelo pedido: só mudam por uma `confirmacao`, e é o workflow que os preenche com o contacto assinado. O esquema exige que `confirmado_por.ref` seja um id opaco (`c_…`), nunca um nome ou um e-mail.
   - `confirmacao`: o workflow gera `confirmado_em` (dia de Lisboa do `emitido_em`) e `confirmado_por` em todos os locais da entidade.
   - `novo-local`: um arquivo novo da entidade do pedido, ainda sem confirmação; na entidade, só se acrescenta o id à lista `locais`. O local fica publicado e gera um alerta aos administradores (§8.2).
   - `restauro`: só arquivos da entidade. Que só um `admin` o pode pedir é verificado no Worker, antes de assinar. O workflow também confirma que o commit `restaura` pertence ao histórico do `main` e que cada arquivo é exatamente igual ao desse commit. Assim, um restauro assinado por engano não serve para escrever valores novos.

   Depois corre a validação completa sobre o repositório já alterado. Por fim recalcula o resumo e recusa o pedido se ele não coincidir com o que a pessoa viu.
5. **Resumo.** Em vez do formato `{local, natureza, antes, depois}` do esboço do Anexo B, usa `{local, linhas}`, com as linhas de `resumirAlteracoes` do motor. É o mesmo texto que vai para o commit e para os e-mails, e o painel e o workflow calculam-no com a mesma função, `resumirPedido`.
6. **Concorrência.** Cada tentativa recomeça do `origin/main` atual (`fetch` + `reset --hard`) e repete a comparação dos SHA, em vez de `pull --rebase`. Assim um pedido que chega primeiro nunca é misturado com outro. São até 5 tentativas, com espera de 2, 4, 8 e 16 s mais um intervalo aleatório.
7. **Mensagem do commit.** Os textos que vêm dos dados (nomes, notas) são reduzidos a uma linha, para não poderem criar *trailers* falsos.
8. **Workflow.**
   - Os inputs passam só por variáveis de ambiente.
   - O job só corre no `main` e no ambiente `gravacao`.
   - O token da App de escrita é criado depois do `npm ci`, para que os scripts de instalação das dependências não o vejam. Nunca fica em `.git/config`: só o `git push` o recebe, pelas variáveis `GIT_CONFIG_*`.
   - O build de verificação corre com um ambiente mínimo (`PATH`, `HOME`, `TMPDIR`, `LANG`, `CI`), sem segredos nem token.
   - As ações usadas neste job estão fixadas por SHA.
   - Os textos que vêm dos dados ou do pedido aparecem nos logs e no resumo numa só linha, com o `%` escapado nas anotações `::`.
   - `CONFLITO` termina com sucesso e um aviso; `ERRO` termina com falha.
9. **Aviso ao Worker.** É opcional (`AVISO_URL`): `POST` com o corpo assinado por `AVISO_HMAC` e um instante, para o Worker recusar repetições. Na homologação, todo o Worker está atrás do Access, por isso o aviso leva um token de serviço do Access.
10. **Sem interface.** `scripts/enviar-pedido.ts` monta e assina os pedidos a partir de arquivos editados à mão, ou de um commit no caso do restauro. Simula a aplicação sobre o `origin/main` e dispara com o `gh`.

11. **Worker** (`worker/src/pedidos.ts`, parte 2).
    - `POST /api/pedidos` monta o pedido. O id, o instante, o contacto (id opaco e função) e o canal são do servidor e nunca vêm do corpo.
    - Antes de assinar verifica o âmbito (`podeVer`; restauro só `admin`) e o limite de 30 pedidos por hora e por contacto.
    - Depois lê do `main` só a entidade, os seus locais, o calendário e os arquivos tocados, e corre o mesmo `prepararPedido`. O `base` só pode falar desses arquivos.
    - Num restauro, confirma que o commit pertence ao histórico do `main` (a API também resolveria commits de forks) e lê os arquivos desse commit.
    - Respostas: conflito (409), dados inválidos (422), alertas de anomalia sem confirmação reforçada (428).
    - Só então assina, dispara o workflow e guarda `pedido:<id>` no KV como `A_GRAVAR` (90 dias).
    - No Worker, a verificação do formato canónico fica desligada, para caber no tempo de CPU. Os arquivos do `main` já a passaram, os novos saem do serializador e o workflow repete-a.
12. **Estados.** `POST /api/interno/estado` não passa pelo Access nem por um contacto.
    - Vale só a assinatura `AVISO_HMAC` sobre o corpo exato, com o instante a menos de 5 minutos.
    - Transições aceites: `A_GRAVAR` → `GRAVADO`, `CONFLITO` ou `ERRO`; `GRAVADO` → `PUBLICADO`. Um desfecho não muda para outro, por isso repetir um aviso não tem efeito.
    - `PUBLICADO` só é aceite com o SHA do commit que gravou o pedido.
    - O `deploy.yml` lê os *trailers* `Pedido:` dos commits gravados pelo bot desde o último deploy bem sucedido. Um *trailer* copiado num PR não conta.
13. **Consulta.** `GET /api/pedidos` mostra os 50 pedidos mais recentes do próprio contacto, ou de todos a um `admin`. Lê só índices ordenados no KV (`recentes:` e `recentes-de:<contacto>:`), nunca todos os registos. Um pedido de outra pessoa dá 404.
14. **Histórico.** `GET /api/entidades/:id/historico` junta os commits dos arquivos da entidade, com título, linhas do resumo e *trailers*. O nome de quem gravou só aparece a um `admin` ou à própria pessoa; os outros veem a função. O diff de cada versão chega com o ecrã *Histórico* (E5.7).

## Consequências

- Quem tiver a chave da App de leitura pode disparar o workflow, mas não grava nada sem o `PEDIDO_HMAC`. Repetir um pedido do log público dentro dos 15 minutos não tem efeito.
- Uma segunda revisão independente (parte 2) levou às correções das transições de estado, do índice dos pedidos, do `base`, da origem do commit no restauro e da fixação das ações no `deploy.yml`.
- Uma revisão de segurança independente (11/11) encontrou e levou às correções de `confirmado_*`, do restauro, do token, dos logs e da idempotência em simultâneo. Não encontrou forma de contornar a assinatura, de sair de `dados/` nem de tocar noutra entidade.
- O `main` precisa do *ruleset* de §8.7 (sem *force-push*, gravação direta só pela App de escrita) para o histórico ser uma garantia. Isso é configuração do GitHub, fora do código.
- Na homologação, os avisos do GitHub Actions só chegam ao Worker com um token de serviço do Access (`CF_ACCESS_CLIENT_ID`/`SECRET`) e uma política *Service Auth* na aplicação. Sem isso, os pedidos ficam em `A_GRAVAR` no painel, embora sejam gravados.
- Fica por fazer o repositório de testes com o mesmo workflow (E4.11). Os testes com repositórios Git temporários cobrem C28 e C30 entretanto.
