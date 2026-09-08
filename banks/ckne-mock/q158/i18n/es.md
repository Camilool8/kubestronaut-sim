## Question

En una regla from, ¿cuál es la diferencia entre namespaceSelector: {} y omitir namespaceSelector?

## Options

- namespaceSelector: {} (vacío) coincide con TODOS los namespaces del cluster
- El selector vacío no coincide con ningún namespace (conjunto vacío)
- El selector vacío es una sintaxis inválida rechazada en admission
- No existe diferencia

## Solution

**namespaceSelector: {} (vacío) coincide con TODOS los namespaces del cluster** es la respuesta correcta: En los selectors de Kubernetes, vacío = seleccionar todo. `namespaceSelector: {}` abre a todo el cluster, lo contrario de la intuición "vacío = nada". Es una de las trampas más frecuentes en exámenes.
