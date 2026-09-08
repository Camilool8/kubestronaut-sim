## Question

Qual tipo de Service fornece um VIP interno ao cluster com balanceamento L4 (TCP/UDP/SCTP), sem exposição externa?

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** é a resposta correta: `ClusterIP` é o padrão: um IP virtual estável, resolvível via DNS interno, com balanceamento L4 para os endpoints. NodePort abre uma porta em cada nó; LoadBalancer provisiona um LB externo; ExternalName é só um CNAME.
