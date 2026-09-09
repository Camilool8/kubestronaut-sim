## Question

Após migrar o Calico de VXLAN para IPIP, o tráfego pod-a-pod entre nós parou APENAS no ambiente cloud. Causa provável?

## Options

- IPIP usa o protocolo IP 4
- A MTU aumentou sozinha
- IPIP não existe mais
- O kube-proxy odeia IPIP

## Solution

**IPIP usa o protocolo IP 4** é a resposta correta: Encapsulamento IPIP não usa portas — é o protocolo IP número 4. Security groups que filtram por TCP/UDP o descartam silenciosamente. VXLAN (UDP 4789/8472) costuma passar. Libere o protocolo 4 ou volte ao VXLAN.
