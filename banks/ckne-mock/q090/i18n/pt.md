## Question

Quais são os três elementos-chave de uma CiliumEgressGatewayPolicy?

## Options

- selectors, destinationCIDRs e egressGateway com egressIP
- name, namespace, labels e annotations do recurso
- port, targetPort e nodePort
- ingress, egress e policyTypes

## Solution

**selectors, destinationCIDRs e egressGateway com egressIP** é a resposta correta: A policy casa o tráfego (pods selecionados → CIDRs de destino) e o redireciona ao nó gateway, que faz SNAT para o `egressIP` configurado — dando um IP de saída fixo e auditável para firewalls externos.
