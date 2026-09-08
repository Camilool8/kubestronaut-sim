## Question

Como verificar se a criptografia WireGuard do Cilium está de fato ativa e cifrando o tráfego entre nós?

## Options

- cilium status | grep Encryption
- kubectl get secrets
- ping entre os pods
- Olhar a cor dos pods no dashboard

## Solution

**cilium status | grep Encryption** é a resposta correta: Validação em três camadas: o agente reporta o modo, `wg show` confirma peers com handshakes recentes, e a captura na NIC física deve mostrar somente pacotes WireGuard (UDP 51871) em vez do payload claro entre pod IPs.
