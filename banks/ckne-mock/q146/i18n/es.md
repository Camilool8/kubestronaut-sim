## Question

Configuró un canary ponderado (90/10) Y una regla que enruta el header x-beta: true hacia v2. Un usuario con x-beta: true a veces llega a v1. ¿Qué debe revisar?

## Options

- El navegador elimina los headers
- Gateway API no admite matches de headers
- Si el match del header está en la MISMA regla que los pesos
- Los pesos siempre vencen a los headers

## Solution

**Si el match del header está en la MISMA regla que los pesos** es la respuesta correcta: Trampa de estructura: un canary basado en header requiere una regla separada (header match), evaluada como más específica; la regla solo con pesos queda como fallback. Mezclarlo todo en una única regla produce una lotería ponderada para todos.
