## Question

Além da identidade mTLS entre workloads, como validar tokens JWT de USUÁRIOS FINAIS nas requisições que chegam a um serviço no Istio?

## Options

- RequestAuthentication + AuthorizationPolicy exigindo requestPrincipals
- NetworkPolicy nativa com um campo jwt dedicado
- Basic Auth no ConfigMap
- Validação apenas no frontend, antes de chegar ao gateway

## Solution

**RequestAuthentication + AuthorizationPolicy exigindo requestPrincipals** é a resposta correta: `RequestAuthentication` define como validar o token (emissor, chaves JWKS); sozinha, ela só rejeita tokens INVÁLIDOS. A `AuthorizationPolicy` com `requestPrincipals: ["*"]` é o que exige a presença de um token válido — as duas camadas (workload + usuário) se complementam.
