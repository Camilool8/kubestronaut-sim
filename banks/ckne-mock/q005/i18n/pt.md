## Question

Com kube-proxy em modo iptables, qual chain é o ponto de entrada onde o tráfego destinado a Services é interceptado?

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** é a resposta correta: A chain `KUBE-SERVICES` (chamada de PREROUTING/OUTPUT na tabela nat) contém uma regra por Service, saltando para chains `KUBE-SVC-*` que balanceiam para chains `KUBE-SEP-*` (endpoints, onde ocorre o DNAT). Depure com `iptables -t nat -L KUBE-SERVICES`.
