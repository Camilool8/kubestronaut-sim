## Question

Os pod IPs da sua rede são roteáveis no datacenter, mas o tráfego para 10.0.0.0/8 interno ainda sai com SNAT do IP do nó. Como preservar o IP do pod nesses destinos?

## Options

- Usar hostNetwork em todos os pods
- Configurar o ip-masq-agent
- Desligar o kube-proxy
- Impossível sem service mesh

## Solution

**Configurar o ip-masq-agent** é a resposta correta: O `ip-masq-agent` controla o masquerade por destino: CIDRs listados em nonMasqueradeCIDRs saem com o IP original do pod. CNIs têm equivalentes (Cilium ipMasqAgent, Calico natOutgoing por IPPool).
