## Question

O que o Topology Aware Routing (hints de topologia, ex.: service.kubernetes.io/topology-mode: Auto) tenta otimizar, e qual o trade-off?

## Options

- Criptografar todo o tráfego; o trade-off é uso de CPU
- Manter o tráfego dentro da mesma zona de disponibilidade
- Reduzir DNS lookups; o trade-off é cache
- Aumentar réplicas; o trade-off é memória

## Solution

**Manter o tráfego dentro da mesma zona de disponibilidade** é a resposta correta: Com hints, cada kube-proxy prefere endpoints da própria zona — cortando tarifas de tráfego cross-AZ e latência. Se uma zona tem poucos endpoints para sua proporção de tráfego, pode haver sobrecarga local; o mecanismo desativa os hints em distribuições muito assimétricas.
