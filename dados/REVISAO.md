# Revisão dos dados importados

Gerado em 2026-11-07 pela importação inicial.

- Locais convertidos: **79** — Guimarães: 74, Vizela: 5 (todos do tipo `igreja`; nenhuma capela na fonte)
- Com revisão pendente: **23**
- Marcados como não publicar: **2**
- Sem data de atualização na fonte: **13**
- Sem telefone público: **35**

## Excluídos da importação

- **Igreja de São Jorge**: São Jorge de Vizela pertence ao concelho de Felgueiras (União das freguesias de Vila Fria e Vizela (São Jorge)) — fora do âmbito.

## Em falta na fonte

- Vizela: paróquias de **Infias** e **Tagilde** (o concelho tem 7 paróquias históricas; a fonte só trouxe 5 dentro do concelho).

Todos os locais começam com `confirmado_em: null`: só uma confirmação da entidade (painel, e-mail ou secretaria) preenche `confirmado_em`.

## Itens a rever

| Local | Publicar | Motivo |
|---|---|---|
| `aldao` | sim | Sem data de atualização na fonte. |
| `briteiros-santa-leocadia` | **não** | Sem nenhuma missa registada na fonte.<br>Não publicar: Sem horários conhecidos. |
| `caldelas` | sim | Horários diferentes por dia da semana (convertido de porDia). |
| `calvos` | sim | O aviso de Serzedelo diz "alterna com Calvos": confirmar se se refere a esta Calvos (Guimarães) ou à de Póvoa de Lanhoso. |
| `cerzedelo` | sim | Nome provavelmente grafado "Serzedelo" (freguesia de Guimarães, orago Santa Cristina); confirmar. Sem data de atualização na fonte. |
| `cerzedo` | sim | Sem data de atualização na fonte. |
| `creixomil` | sim | A missa de domingo depende da escala da paróquia — confirmar a regra da escala. |
| `infantas` | sim | Sem data de atualização na fonte. |
| `moreira-de-conegos` | sim | Só tem missa de domingo no inverno — confirmar. |
| `nespereira` | sim | Sábado 17:00 só no 2.º e 4.º sábado (convertido do aviso); alterna com Polvoreira. |
| `polvoreira` | sim | Sábado 17:00 só no 1.º e 3.º sábado (convertido do aviso); alterna com Nespereira. |
| `ronfe` | sim | Missa semanal das 21:00 só em maio (convertido do aviso). |
| `sao-faustino` | sim | Sem data de atualização na fonte. |
| `sao-jorge-de-selho` | sim | Igreja de São Miguel do Paraíso sem pároco nem telefone: provável igreja secundária da paróquia Selho e Paraíso (`selho-e-paraiso`) — confirmar e agrupar. |
| `sao-paio` | sim | LOCALIZAÇÃO ERRADA (provável): mesmo pároco de São Sebastião e Unidade Pastoral de São Sebastião e São Paio → é provavelmente a paróquia de São Paio na cidade de Guimarães; a fonte atribuiu-lhe morada e coordenadas da Igreja Matriz de Moreira de Cónegos. Corrigir morada, geo e freguesia. |
| `selho-sao-lourenco` | sim | Sem data de atualização na fonte. |
| `selho-e-paraiso` | sim | Missa de 6.ª feira só na primeira 6.ª do mês (aviso cita 19h; no inverno a fonte indica 18:30 — confirmar hora). |
| `serzedelo` | **não** | POSSIVELMENTE FORA DO CONCELHO: arciprestado Póvoa de Lanhoso, mesma morada e coordenadas de Cerzedelo (Santa Cristina). Provável Serzedelo (Póvoa de Lanhoso) mal geocodificado.<br>Sábado quinzenal, alternando com Calvos — falta a data de referência.<br>Não publicar: Confirmar se pertence ao concelho de Guimarães. |
| `silvares` | sim | Sem data de atualização na fonte. |
| `vermil` | sim | Sem data de atualização na fonte. |
| `vizela-sao-joao` | sim | Fonte sem horário de domingo de inverno: só foram importadas as missas de domingo de verão (09:00, 11:30). Confirmar o horário de inverno — neste momento o site não mostra missa de domingo em São João.<br>Sem morada na fonte. |
| `vizela-santo-adriao` | sim | Diocese do Porto (arciprestado de Felgueiras): não estará na reunião do arciprestado de Guimarães e Vizela — contacto direto pela secretaria. |
| `vizela-santa-eulalia` | sim | Sem pároco nem telefone na fonte. Diocese do Porto (arciprestado de Lousada): não estará na reunião do arciprestado de Guimarães e Vizela — contacto direto pela secretaria. |

## Ajustes automáticos aplicados a todos

- Dias normalizados (`2ª`/`2a` → `seg` … `6ª` → `sex`) e duplicados removidos.
- Blocos verão/inverno convertidos em regras; quando a hora é igual nas duas épocas, a regra não tem `epoca`.
- Campos redundantes descartados: `schema_org`, `endereco_schema`, `horarios_coordenadas`, `descricao`.
- Cada local tem uma entidade responsável em `dados/entidades/` (todas do tipo `paroquia`, relação 1:1 a rever) e `concelho: Guimarães`.
- `dias_santos: null` em todos: desconhecido até a entidade responder (o painel pergunta).
- `freguesia` deduzida da morada (que vem de geocodificação e nem sempre é exata) — confirmar com a junta/paróquia quando possível.
