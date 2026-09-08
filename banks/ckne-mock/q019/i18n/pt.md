## Question

No Gateway API, qual a divisão correta de papéis entre Gateway e HTTPRoute?

## Options

- Ambos fazem a mesma coisa, HTTPRoute é apenas o nome novo
- Gateway define regras de roteamento; HTTPRoute define listeners
- Gateway é gerenciado pelo operador de infraestrutura e define listeners/endereços
- HTTPRoute substitui o Service; Gateway substitui o Deployment

## Solution

**Gateway é gerenciado pelo operador de infraestrutura e define listeners/endereços** é a resposta correta: Modelo orientado a personas: `GatewayClass` (implementação), `Gateway` (infra: listeners, portas, TLS) e `HTTPRoute` (app: matches, filtros, backends). O route referencia o Gateway em `parentRefs` e Services em `backendRefs`.
