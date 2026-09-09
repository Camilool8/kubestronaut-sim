## Question

Duas rules de um HTTPRoute casam com a mesma requisição: uma com path /api e outra com /api/v2. Qual vence?

## Options

- A primeira do YAML sempre
- A escolha é aleatória
- Nenhuma; a requisição é rejeitada com 404
- A regra mais específica — maior prefixo de path

## Solution

**A regra mais específica — maior prefixo de path** é a resposta correta: A precedência do Gateway API é determinística: exact > prefix mais longo, depois nº de headers/query casados; empates entre HTTPRoutes vão para o mais antigo (e ordem alfabética como desempate final). Isso evita ambiguidade de roteamento.
