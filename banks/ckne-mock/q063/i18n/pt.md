## Question

Qual combinação fornece a um pod uma interface secundária de altíssimo desempenho, com acesso quase direto à NIC física (NFV/baixa latência)?

## Options

- Duas réplicas do kube-proxy
- Aumentar requests de CPU
- hostPort + NodePort combinados na mesma porta física
- Multus + SR-IOV CNI + device plugin, entregando VFs da NIC ao pod

## Solution

**Multus + SR-IOV CNI + device plugin, entregando VFs da NIC ao pod** é a resposta correta: SR-IOV divide a NIC física em Virtual Functions (VFs) entregues diretamente ao pod (bypass da pilha do host), com o device plugin gerenciando a alocação e o Multus anexando a interface — padrão em telco/NFV e workloads de baixa latência.
