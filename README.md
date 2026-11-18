# Horários de Missas e Celebrações — Arciprestado de Guimarães e Vizela

Horários das missas e celebrações nas igrejas dos concelhos de Guimarães e Vizela, mantidos pelas próprias paróquias.

**Estado:** em desenvolvimento, em ambiente de homologação. Os horários ainda não estão publicados.

## Como funciona

- O site é uma só página, rápida e sem publicidade, em português, inglês e espanhol.
- As paróquias atualizam os seus horários num painel, com login Google.
- Os dados estão numa base de dados na Cloudflare (D1), não neste repositório. Cada alteração fica no histórico: mostra o que mudou e quando, e qualquer versão pode ser reposta pelo painel.

## Desenvolvimento

Requer Node 26 (ver `.nvmrc`).

```sh
npm ci
npm run dev        # site em http://localhost:4321
npm run verificar  # formatação, lint, tipos, testes e validação dos dados
```

Regras do projeto em [`AGENTS.md`](AGENTS.md); decisões de arquitetura em [`docs/decisoes/`](docs/decisoes/).

## Licença

A definir.
