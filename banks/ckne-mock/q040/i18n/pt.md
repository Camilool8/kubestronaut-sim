## Question

No Gateway API, como configurar terminação TLS em um listener HTTPS?

## Options

- Montar o certificado como hostPath em cada kube-proxy
- Via annotation tls=true no Service
- No listener do Gateway, com tls.mode: Terminate e certificateRefs
- No HTTPRoute, campo spec.tls.cert

## Solution

**No listener do Gateway, com tls.mode: Terminate e certificateRefs** é a resposta correta: O listener declara `protocol: HTTPS`, `tls.mode: Terminate` e `certificateRefs` para Secrets `kubernetes.io/tls`. Secret em outro namespace exige `ReferenceGrant`.
