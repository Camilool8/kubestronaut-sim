## Question

Una NetworkPolicy tiene policyTypes: [Ingress], pero el autor también escribió un bloque egress: [...] en spec. ¿Qué efecto tiene el bloque egress?

## Options

- Se aplica normalmente
- Bloquea todo el egress
- Provoca un error de validación
- Se IGNORA: policyTypes gobierna

## Solution

**Se IGNORA: policyTypes gobierna** es la respuesta correcta: La aplicación sigue `policyTypes`, no la presencia de secciones. Las reglas egress "decorativas" pueden superar las revisiones; es una trampa frecuente en auditorías y exámenes.
