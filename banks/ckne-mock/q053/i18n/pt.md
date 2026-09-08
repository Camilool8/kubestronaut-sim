## Question

A aplicação reporta latência alta entre dois serviços. node_netstat_Tcp_RetransSegs cresce rapidamente nos nós envolvidos. O que isso indica?

## Options

- Perda de pacotes no caminho
- Que o DNS está lento
- Que o etcd precisa de compactação
- Que faltam réplicas no Deployment

## Solution

**Perda de pacotes no caminho** é a resposta correta: Retransmissões TCP = perda de pacotes. Culpado frequente: MTU incorreto com overlay (VXLAN consome ~50 bytes). Valide com `ping -M do -s 1472`, `tcpdump` e a MTU do CNI.
