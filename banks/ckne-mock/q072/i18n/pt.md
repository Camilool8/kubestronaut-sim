## Question

Qual é o backend mais recente do kube-proxy, criado para substituir o modo iptables com melhor desempenho e API de kernel mais moderna?

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** é a resposta correta: O modo `nftables` (GA no Kubernetes 1.33) usa a API sucessora do iptables, com atualizações de regras mais eficientes e melhor desempenho em clusters com muitos Services. eBPF (Cilium) continua sendo a alternativa fora do kube-proxy.
