# ADR-003 — Identidade, perfis e acessos do painel

- **Estado:** aceite
- **Data:** 2026-11-10

## Contexto

O painel (`/admin/`) e a API (`/api/*`) só podem ser usados por contactos registados pelo Arciprestado, cada um com o seu âmbito: um administrador vê e edita todas as entidades; o contacto de uma paróquia só a sua (D25). O login é só com Google, pelo Cloudflare Access (D22). Na homologação, todo o Worker está protegido pelo Access ao nível do próprio Worker, com uma política de três contas.

## Decisão

1. **O Worker verifica sempre o JWT do Access** (`Cf-Access-Jwt-Assertion`) em `worker/src/identidade.ts`: RS256 com as chaves públicas da equipa (cache de uma hora; nova busca se aparecer um `kid` desconhecido), `iss`, `aud`, `exp`/`nbf`/`iat` com 60 s de folga e `email`. Qualquer falha dá "sem identidade" (401). Não se usa só o `ctx.access` nem se confia na configuração do Access.
2. **Quem pode o quê vem do KV**, não do Access: `contacto:<id>` com `perfil` (`admin`/`entidade`), `entidades` e `estado`; `email:<email>` como índice. `podeVer` aplica o âmbito em todas as rotas. Um contacto suspenso ou removido não entra.
3. **Escritas na API** exigem a mesma origem (`Origin`) e `application/json`, contra CSRF; corpo até 8 KB; respostas `no-store`.
4. **Acessos:** só `admin`. Sem consentimento registado (data não futura, versão, meio) não há contacto. Ninguém se tira a si próprio de administrador nem se suspende; fica sempre pelo menos um administrador ativo. Cada criação ou alteração fica em `auditoria:*` com o id opaco, sem e-mail.
5. **Primeiro administrador** por `scripts/acessos.ts`, com o e-mail numa variável de ambiente.
6. **Sincronização com o grupo do Access** adiada para o E8: na homologação a política do Access já é uma lista fixa, e a sincronização exige um token com permissão de alterar o Access.
7. **Leitura do `main`** pela GitHub App `missas-guimaraes-painel` (só `contents: read` e `actions: write`). A chave privada (PKCS#1, como o GitHub a entrega) é embrulhada em PKCS#8 no Worker. Sem a App configurada, o painel mostra os dados do último build (`/dados/catalogo.json`), sem SHA.

## Consequências

- Se o Access deixar passar alguém por engano, a API continua a recusar sem um JWT válido e um contacto ativo.
- A troca do Access pelo login Google direto (se o limite de utilizadores for ultrapassado, P19) só mexe em `identidade.ts`.
- Os segredos do Worker (`GITHUB_PAINEL_APP_PRIVATE_KEY`, `TURNSTILE_SECRET`) entram sempre como *Secret*: as variáveis de texto são apagadas pelo deploy e aparecem no log.
