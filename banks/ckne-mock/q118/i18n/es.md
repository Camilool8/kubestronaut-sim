## Question

¿Qué manifiesto aísla completamente todos los pods de un namespace, sin permitir tráfico entrante NI saliente?

## Options

- Eliminar todos los Services
- Solo policyTypes: [Ingress] con podSelector: {}
- podSelector: {} con policyTypes: [Ingress, Egress] y sin reglas ingress/egress
- podSelector: {} con ingress: [{}] y egress: [{}] declarados

## Solution

**podSelector: {} con policyTypes: [Ingress, Egress] y sin reglas ingress/egress** es la respuesta correcta: Seleccionar todo y declarar ambos policyTypes sin reglas = default deny total. La variante con `[{}]` permite todo, porque una regla vacía coincide con cualquier origen/destino: la clásica trampa de examen. A partir de ahí, cada acceso se concede mediante policies adicionales.
