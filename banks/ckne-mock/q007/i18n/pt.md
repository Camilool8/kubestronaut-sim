## Question

Pods no mesmo nó se comunicam, mas pods em nós diferentes não. O CNI usa VXLAN. Qual é a causa mais provável?

## Options

- O kube-scheduler está mal configurado
- A porta UDP do VXLAN está bloqueada entre os nós
- Os pods precisam de hostPort para tráfego entre nós
- CoreDNS está fora do ar

## Solution

**A porta UDP do VXLAN está bloqueada entre os nós** é a resposta correta: Tráfego inter-nós depende do encapsulamento. Se o firewall bloqueia a porta UDP do VXLAN (8472 no Flannel/Cilium, 4789 padrão IANA), a comunicação cross-node falha. Verifique com `tcpdump -i any udp port 8472` e as regras de firewall/security groups.
