## Question

¿Con qué coincide un HTTPRoute declarado SIN ningún match?

## Options

- Con nada: matches es obligatorio
- Con todo en los hostname/listener
- Solo con GET /
- Solo con HTTPS

## Solution

**Con todo en los hostname/listener** es la respuesta correcta: Sin matches explícitos, se asume `PathPrefix /`. Combinado con las reglas de precedencia (gana el más específico), un catch-all mal colocado explica muchos casos de "¿por qué esta route atendió la solicitud?".
