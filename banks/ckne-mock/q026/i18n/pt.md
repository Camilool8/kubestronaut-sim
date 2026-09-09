## Question

Sua empresa exige que todo tráfego de saída do cluster para uma API externa venha de um IP fixo, para liberação em firewall. Qual solução aplicar?

## Options

- Aumentar o pod CIDR
- Usar hostPort nos pods
- Trocar o Service para ExternalName
- Configurar um Egress Gateway

## Solution

**Configurar um Egress Gateway** é a resposta correta: Egress gateways concentram a saída em nós/IPs específicos: no Cilium, uma `CiliumEgressGatewayPolicy` faz SNAT para o egressIP de um nó gateway; no Istio, o tráfego sai pelo egress gateway do mesh. Sem isso, o IP de saída é o de qualquer nó.
