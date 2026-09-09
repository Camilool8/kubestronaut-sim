## Question

Os endpoints do Service estão corretos, pod-a-pod funciona por IP direto, mas o acesso via ClusterIP falha a partir de todos os pods de um nó específico. Qual a suspeita principal?

## Options

- O CoreDNS caiu em todas as réplicas
- O kube-proxy daquele nó está caído ou não programou as regras
- O namespace está sendo excluído em segundo plano
- A imagem do container está errada

## Solution

**O kube-proxy daquele nó está caído ou não programou as regras** é a resposta correta: ClusterIP é materializado POR NÓ (iptables/IPVS/eBPF). Se um único nó falha em alcançar VIPs, a programação local está quebrada: kube-proxy crashando, regras não sincronizadas ou conflito com firewall local. Compare `iptables-save` entre nós.
