## Question

¿Cuál es la diferencia entre estas dos reglas de ingress?

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) es sintácticamente inválida y el apiserver la rechaza
- Son idénticas
- (A) es OR entre las fuentes; (B) es AND (pods Y dentro de namespaces X)
- (A) solo se aplica a egress; (B) solo a ingress

## Solution

**(A) es OR entre las fuentes; (B) es AND (pods Y dentro de namespaces X)** es la respuesta correcta: Los elementos separados de la lista `from` son alternativas (OR); los campos combinados en el mismo elemento son condiciones conjuntas (AND). Un guion adicional cambia por completo el alcance del acceso.
