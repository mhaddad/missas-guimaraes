# ADR-002 — Motor de horários e ferramentas de dados

- **Estado:** aceite
- **Data:** 2026-11-08

## Contexto

O motor de horários (`pacotes/horarios`) corre no navegador (site e painel), no Worker e no GitHub Actions, e tem de dar sempre o mesmo resultado. As horas são sempre de Lisboa, mesmo para quem consulta o site com o telemóvel noutro fuso. Os dados são validados nos mesmos três sítios, e o Worker não pode gerar código em tempo de execução.

## Decisão

1. **Datas civis sem `Date` nem `Temporal`.** As datas são texto `AAAA-MM-DD` e a aritmética é feita sobre "dias desde 1970-01-01", o que é igual em qualquer fuso. O único instante real é o "agora" de `proximas`, convertido para Lisboa com `Intl.DateTimeFormat` e fuso explícito. O `Temporal` existe no Node 26, mas ainda não em todos os navegadores, e um polyfill pesaria mais do que este código.
2. **A época (verão/inverno) segue a regra da hora legal da UE**: do último domingo de março (inclusive) ao último domingo de outubro (exclusive). Um teste de propriedades compara-a com o `Intl`.
3. **Os dias santos calculam-se a partir das regras de `dados/calendario.yml`** (datas fixas e `pascoa±N`), para qualquer ano. As datas escritas em `anos` são conferidas pela validação.
4. **O esquema JSON é a única fonte de verdade.** Os tipos TypeScript (`modelo.gerado.ts`) e os validadores do Ajv pré-compilados (`validadores.gerado.js`) são gerados a partir de `dados/schema/` e a CI falha se estiverem desatualizados (`npm run gerados:verificar`).
5. **Formato canónico dos YAML** (`pacotes/dados/src/serializar.ts`): chaves pela ordem do esquema, horas e datas entre plicas, listas de dias em linha, uma exceção por linha, comentários preservados. A validação recusa arquivos fora do formato; `npm run formatar:dados` corrige-os.
6. **As mudanças do painel convertem-se em regras e exceções no motor** (`aplicarMudanca`): *só num dia* → exceção; *habitual a partir de D* → a regra antiga termina em D−1 e a nova começa em D; *durante um período* → a regra fica suspensa (partida em duas pela validade).
7. **Os casos do Anexo C do plano são o contrato** (`anexo-c.test.ts`), com cópias fixas dos horários, para que uma mudança real de horário não parta os testes.

## Consequências

- Qualquer alteração ao esquema obriga a correr `npm run gerar:tipos` e `npm run gerar:validadores`.
- Os textos das descrições ("2.º e 4.º sábados do mês às 17:00") vêm de tabelas do próprio motor, em pt-PT, en e es, e não do `Intl`, para serem iguais em todo o lado. O nome dos idiomas das celebrações ("em latim") usa `Intl.DisplayNames`.
- Os validadores gerados ocupam cerca de 4000 linhas. No Worker não é problema; no painel, carregam-se só onde forem precisos.
