## Question

Qual a diferença entre estas duas regras de ingress?

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) é inválida sintaticamente e rejeitada pelo apiserver
- São idênticas
- (A) é OR entre as fontes; (B) é AND (pods Y dentro de namespaces X)
- (A) aplica-se só a egress; (B) só a ingress

## Solution

**(A) é OR entre as fontes; (B) é AND (pods Y dentro de namespaces X)** é a resposta correta: Itens separados na lista `from` são alternativas (OR); campos combinados no mesmo item são condições conjuntas (AND). Um hífen a mais muda completamente o escopo do acesso.
