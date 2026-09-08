## Question

El listener del Gateway define hostname *.example.com y un HTTPRoute declara hostnames [app.example.com, app.other.com]. ¿Qué ocurre?

## Options

- Ambos hostnames funcionan
- Solo se sirve la intersección
- El Gateway adopta app.other.com automáticamente
- Se rechaza toda la route

## Solution

**Solo se sirve la intersección** es la respuesta correcta: La vinculación listener↔route considera la intersección de hostnames: solo se programan los nombres compatibles con el hostname del listener. El estado de HTTPRoute (Accepted/ResolvedRefs) muestra el resultado de la asociación; compruébelo siempre con `kubectl describe httproute`.
