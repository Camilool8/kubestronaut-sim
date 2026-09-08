## Question

Se aplicó una AuthorizationPolicy con spec completamente vacío ({}) al namespace prod. ¿Cuál es el efecto?

## Options

- Solo registra logs, sin bloquear
- Un error de validación
- Permite todo (spec vacío = ninguna restricción)
- DENIEGA todo el tráfico del namespace

## Solution

**DENIEGA todo el tráfico del namespace** es la respuesta correcta: Inversión cruel: tener una AuthorizationPolicy ALLOW que no coincide con nada significa que nada está permitido. Incluso es la forma idiomática de implementar deny-all. Compare con NetworkPolicy `ingress: [{}]`, que permite todo: los objetos "vacíos" tienen semánticas opuestas.
