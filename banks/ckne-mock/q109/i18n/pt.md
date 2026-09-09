## Question

Ao usar IPsec no Cilium, onde a chave é armazenada e qual prática operacional é necessária?

## Options

- Hardcoded na imagem do agente
- Em um arquivo no laptop do admin
- No Secret cilium-ipsec-keys
- Chave não é necessária no IPsec

## Solution

**No Secret cilium-ipsec-keys** é a resposta correta: O Cilium lê a chave/algoritmo do Secret `cilium-ipsec-keys`. A rotação é operacional: gera-se nova chave com ID incrementado e os agentes fazem a transição sem downtime. WireGuard, em contraste, gerencia as chaves automaticamente por nó.
