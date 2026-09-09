## Question

¿Qué NetworkPolicy implementa un "default deny" de ingress para todos los pods de un namespace?

## Options

- podSelector: {} con policyTypes: [Ingress] y sin reglas de ingress
- Excluir el namespace del CNI
- podSelector: deny-all con policyTypes: [Ingress]
- Una policy con ingress: [{}] que cubra todos los pods

## Solution

**podSelector: {} con policyTypes: [Ingress] y sin reglas de ingress** es la respuesta correcta: Un `podSelector: {}` selecciona todos los pods; declarar `policyTypes: [Ingress]` sin reglas bloquea todo el tráfico entrante. Atención: `ingress: [{}]` hace lo contrario, permite todo.
