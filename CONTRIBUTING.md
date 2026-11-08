# Como contribuir

1. Leia o `AGENTS.md` (regras do projeto, incluindo o que nunca fazer).
2. Crie um ramo a partir do `main`, faça a alteração e corra `npm run verificar`.
3. Abra um Pull Request com o modelo preenchido. A CI (`validar`) tem de ficar verde.

## Corrigir dados à mão

As paróquias atualizam os horários pelo painel. Para correções pontuais nos YAML de `dados/` (por exemplo, uma morada errada), edite o arquivo e abra um PR: a CI valida o esquema e a integridade. Não reformate os arquivos com outras ferramentas.

## Reportar um erro nos horários

Use o botão "Reportar erro" no site (a partir da versão pública) ou abra uma Issue.
