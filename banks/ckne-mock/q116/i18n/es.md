## Question

Además de la identidad mTLS del workload, ¿cómo valida tokens JWT de USUARIO FINAL en las solicitudes que llegan a un servicio en Istio?

## Options

- RequestAuthentication + AuthorizationPolicy que requiera requestPrincipals
- NetworkPolicy nativa con un campo jwt dedicado
- Basic Auth en un ConfigMap
- Validación únicamente en el frontend, antes de llegar al gateway

## Solution

**RequestAuthentication + AuthorizationPolicy que requiera requestPrincipals** es la respuesta correcta: `RequestAuthentication` define cómo validar el token (issuer, claves JWKS); por sí solo solo rechaza tokens INVÁLIDOS. `AuthorizationPolicy` con `requestPrincipals: ["*"]` es lo que exige que exista un token válido. Las dos capas —workload y usuario— se complementan.
