## Question

Ao reiniciar o agente BGP (upgrade do Cilium/Calico) num nó, o tráfego dos VIPs anunciados por ele caiu por ~30s até a sessão reestabelecer. Quais dois mecanismos reduzem esse impacto?

## Options

- Trocar BGP por L2 sempre
- Graceful Restart (mantém rotas no restart) e BFD (detecção em ms)
- Aumentar réplicas do CoreDNS e do kube-apiserver no upgrade
- Reduzir a MTU dos túneis entre os nós

## Solution

**Graceful Restart (mantém rotas no restart) e BFD (detecção em ms)** é a resposta correta: Graceful Restart diferencia "reinício planejado" de "nó morto", preservando forwarding; BFD acelera a detecção quando o nó REALMENTE morre. Juntos: upgrades sem blackhole e failover sub-segundo.
