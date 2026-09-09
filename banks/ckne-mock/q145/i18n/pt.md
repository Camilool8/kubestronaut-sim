## Question

Um HTTPRoute declarado SEM nenhum matches casa o quê?

## Options

- Nada — matches é obrigatório
- Tudo do(s) hostname(s)/listener
- Apenas GET /
- Apenas HTTPS

## Solution

**Tudo do(s) hostname(s)/listener** é a resposta correta: Sem matches explícito, assume-se `PathPrefix /`. Combinado com as regras de precedência (mais específico vence), um pega-tudo mal posicionado explica muitos "por que essa rota atendeu?".
