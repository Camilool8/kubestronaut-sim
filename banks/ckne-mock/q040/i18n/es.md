## Question

En Gateway API, ¿cómo configura la terminación TLS en un listener HTTPS?

## Options

- Montando el certificado como hostPath en cada kube-proxy
- Mediante una annotation tls=true en el Service
- En el listener del Gateway, con tls.mode: Terminate y certificateRefs
- En HTTPRoute, mediante el campo spec.tls.cert

## Solution

**En el listener del Gateway, con tls.mode: Terminate y certificateRefs** es la respuesta correcta: El listener declara `protocol: HTTPS`, `tls.mode: Terminate` y `certificateRefs` hacia Secrets `kubernetes.io/tls`. Un Secret de otro namespace requiere un `ReferenceGrant`.
