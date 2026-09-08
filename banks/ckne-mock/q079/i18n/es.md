## Question

¿Qué filtro de HTTPRoute permite añadir un header (por ejemplo, X-Env: prod) a todas las solicitudes reenviadas al backend?

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** es la respuesta correcta: El filtro `RequestHeaderModifier` añade, establece o elimina headers en la solicitud (también existe ResponseHeaderModifier). `URLRewrite` cambia hostname/path; `RequestMirror` duplica el tráfico hacia otro backend.
