## Question

Um HTTPRoute em um namespace diferente do Gateway não está funcionando. O que normalmente precisa ser ajustado?

## Options

- O campo listeners.allowedRoutes.namespaces do Gateway
- O Service de backend deve ser NodePort
- HTTPRoutes só funcionam no namespace do Gateway, sem exceção
- O HTTPRoute precisa de hostNetwork

## Solution

**O campo listeners.allowedRoutes.namespaces do Gateway** é a resposta correta: Por padrão, `allowedRoutes.namespaces.from` é `Same`. Para aceitar routes de outros namespaces, use `from: All` ou `from: Selector` no listener. Para backends em outros namespaces, é preciso também um `ReferenceGrant`.
