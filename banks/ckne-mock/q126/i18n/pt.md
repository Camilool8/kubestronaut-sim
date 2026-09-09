## Question

Um pod foi configurado com dnsPolicy: Default. Qual é o comportamento — e por que o nome é traiçoeiro?

## Options

- Usa 8.8.8.8 fixo
- Desativa o DNS completamente
- Herda o resolv.conf do NÓ
- Usa o DNS do cluster, como o nome sugere

## Solution

**Herda o resolv.conf do NÓ** é a resposta correta: Pegadinha clássica de nomenclatura: `Default` significa "herdar do nó", quebrando a resolução de Services. A política padrão aplicada aos pods é `ClusterFirst`.
